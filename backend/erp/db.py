"""MySQL access: plain SQL through a small connection pool."""
import os
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from queue import Empty, LifoQueue
from tempfile import gettempdir
from threading import Lock
from urllib.parse import unquote, urlsplit

import pymysql
from pymysql.constants import CLIENT, FIELD_TYPE
from pymysql.cursors import DictCursor

from .config import DATABASE_CA, DATABASE_URL
from .errors import not_found

# ANSI_QUOTES lets "Table" and "column" keep their exact names. Times are stored as UTC.
# READ COMMITTED means a row read after taking a lock is always its latest committed value.
SESSION = (
    "SET SESSION sql_mode = 'ANSI_QUOTES,STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION', "
    "time_zone = '+00:00', transaction_isolation = 'READ-COMMITTED'"
)
# Vercel runs many small copies of the app and the database allows 46 connections in all.
MAX_CONNECTIONS = 4 if os.environ.get("VERCEL") else 24
CHECK_AFTER_SECONDS = 30
POOL_WAIT_SECONDS = 15


class PoolTimeout(Exception):
    pass


def certificate():
    """Writes the certificate once, because the driver reads it from a file."""
    path = Path(gettempdir()) / "erp-database-ca.pem"
    if not path.exists():
        path.write_text(DATABASE_CA + "\n", encoding="ascii")
    return str(path)


def connect():
    url = urlsplit(DATABASE_URL)
    secure = {"ssl_ca": certificate()} if DATABASE_CA else {}
    return pymysql.connect(
        **secure,
        host=url.hostname, port=url.port or 3306, user=unquote(url.username or ""), password=unquote(url.password or ""),
        database=url.path.lstrip("/"), charset="utf8mb4", autocommit=True, cursorclass=DictCursor, connect_timeout=5, read_timeout=30, write_timeout=30,
        # Updates report matching rows, not only rows whose values changed.
        client_flag=CLIENT.FOUND_ROWS, init_command=SESSION,
    )


class Pool:
    def __init__(self):
        self.idle = LifoQueue()
        self.opened = 0
        self.lock = Lock()

    def take(self):
        try:
            conn = self.idle.get_nowait()
        except Empty:
            with self.lock:
                room = self.opened < MAX_CONNECTIONS
                if room:
                    self.opened += 1
            if room:
                try:
                    return connect()
                except Exception:
                    with self.lock:
                        self.opened -= 1
                    raise
            try:
                conn = self.idle.get(timeout=POOL_WAIT_SECONDS)
            except Empty:
                raise PoolTimeout() from None
        # Checking a connection costs a trip to the database, so only do it after a quiet spell.
        if time.time() - getattr(conn, "last_used", 0) > CHECK_AFTER_SECONDS:
            try:
                conn.ping(reconnect=True)
            except Exception:
                self.drop(conn)
                raise
        return conn

    def give(self, conn):
        conn.last_used = time.time()
        self.idle.put(conn)

    def drop(self, conn):
        with self.lock:
            self.opened -= 1
        try:
            conn.close()
        except Exception:
            pass

    @contextmanager
    def connection(self):
        conn = self.take()
        try:
            yield conn
        except pymysql.OperationalError:
            self.drop(conn)
            raise
        except BaseException:
            self.give(conn)
            raise
        else:
            self.give(conn)


pool = Pool()
_columns = {}


def _booleans(cur, rows):
    """TINYINT(1) columns are the schema's true/false values."""
    flags = [d[0] for d in cur.description or [] if d[1] == FIELD_TYPE.TINY and d[3] == 1]
    if flags:
        for row in rows:
            for name in flags:
                if row[name] is not None:
                    row[name] = bool(row[name])
    return rows


def now():
    """Timestamps are stored as UTC without a zone."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Db:
    """Without a connection each call stands alone. Inside transaction() all calls share one."""

    def __init__(self, conn=None):
        self.conn = conn

    @contextmanager
    def _cursor(self):
        if self.conn is not None:
            with self.conn.cursor() as cur:
                yield cur
        else:
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    yield cur

    def all(self, sql, *params):
        with self._cursor() as cur:
            cur.execute(sql, params)
            return _booleans(cur, list(cur.fetchall()))

    def one(self, sql, *params):
        with self._cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return _booleans(cur, [row])[0] if row else None

    def value(self, sql, *params):
        row = self.one(sql, *params)
        return next(iter(row.values())) if row else None

    def execute(self, sql, *params):
        with self._cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount

    def get(self, table, id, lock=False):
        return self.one(f'SELECT * FROM "{table}" WHERE id = %s{" FOR UPDATE" if lock else ""}', id)

    def columns(self, table):
        if table not in _columns:
            rows = self.all(
                "SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns "
                "WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER(%s)",
                table,
            )
            _columns[table] = {r["name"]: r["nullable"] == "YES" for r in rows}
        return _columns[table]

    def _stamped(self, table, data):
        cols = self.columns(table)
        unknown = set(data) - set(cols)
        if unknown:
            raise ValueError(f"Unknown columns for {table}: {unknown}")
        return {**data, "updatedAt": now()} if "updatedAt" in cols else dict(data)

    def insert(self, table, data):
        data = {k: v for k, v in self._stamped(table, data).items() if v is not None}
        names = ", ".join(f'"{k}"' for k in data)
        marks = ", ".join(["%s"] * len(data))
        with self._cursor() as cur:
            cur.execute(f'INSERT INTO "{table}" ({names}) VALUES ({marks})', tuple(data.values()))
            new_id = cur.lastrowid or data.get("id")
        return self.get(table, new_id)

    def insert_many(self, table, rows):
        for row in rows:
            self.insert(table, row)

    def update(self, table, id, data):
        cols = self.columns(table)
        data = {k: v for k, v in self._stamped(table, data).items() if v is not None or cols.get(k)}
        if not data:
            row = self.get(table, id)
        else:
            sets = ", ".join(f'"{k}" = %s' for k in data)
            self.execute(f'UPDATE "{table}" SET {sets} WHERE id = %s', *data.values(), id)
            row = self.get(table, id)
        if not row:
            raise not_found()
        return row


db = Db()


@contextmanager
def transaction():
    """Commits when the block ends, rolls back if it raises."""
    with pool.connection() as conn:
        conn.begin()
        try:
            yield Db(conn)
        except BaseException:
            conn.rollback()
            raise
        conn.commit()


class Where:
    def __init__(self):
        self.parts = []
        self.params = []

    def raw(self, sql, *params):
        self.parts.append(sql)
        self.params.extend(params)
        return self

    def eq(self, column, value):
        return self.raw(f't."{column}" = %s', value)

    def contains(self, expressions, term, extra=()):
        term = str(term or "").strip()
        if not term or not (expressions or extra):
            return self
        tests = [f"POSITION(LOWER(%s) IN LOWER({e})) > 0" for e in expressions]
        tests += list(extra)
        self.parts.append("(" + " OR ".join(tests) + ")")
        self.params.extend([term] * len(tests))
        return self

    def search(self, term, columns, extra=()):
        return self.contains([f't."{c}"' for c in columns], term, extra)

    def range(self, expression, rng):
        if rng:
            if "gte" in rng:
                self.raw(f"{expression} >= %s", rng["gte"])
            if "lte" in rng:
                self.raw(f"{expression} <= %s", rng["lte"])
        return self

    @property
    def sql(self):
        return " WHERE " + " AND ".join(self.parts) if self.parts else ""


def name_match(table, key):
    """Search test for a related record's name, for use with Where.search(extra=...)."""
    return f'EXISTS (SELECT 1 FROM "{table}" x WHERE x.id = t."{key}" AND POSITION(LOWER(%s) IN LOWER(x.name)) > 0)'


def _cols(fields):
    if fields == "*":
        return "*"
    names = {"id", *[f.strip() for f in fields.split(",")]}
    return ", ".join(f'"{n}"' for n in names)


def join_one(store, rows, key, table, fk, fields="*"):
    """Adds the parent record of each row under key."""
    ids = list({r[fk] for r in rows if r.get(fk) is not None})
    found = {}
    if ids:
        found = {x["id"]: x for x in store.all(f'SELECT {_cols(fields)} FROM "{table}" WHERE id IN %s', ids)}
    for row in rows:
        row[key] = found.get(row.get(fk))
    return rows


def join_many(store, rows, key, table, fk, where="", order="id", fields="*"):
    """Adds the child records of each row under key."""
    ids = [r["id"] for r in rows]
    groups = {}
    if ids:
        cols = "*" if fields == "*" else _cols(f"{fields},{fk}")
        for x in store.all(f'SELECT {cols} FROM "{table}" WHERE "{fk}" IN %s {where} ORDER BY {order}', ids):
            groups.setdefault(x[fk], []).append(x)
    for row in rows:
        row[key] = groups.get(row["id"], [])
    return rows


def join_child(store, rows, key, table, fk, fields="*"):
    """Adds a single child record of each row under key."""
    join_many(store, rows, key, table, fk, fields=fields)
    for row in rows:
        row[key] = row[key][0] if row[key] else None
    return rows
