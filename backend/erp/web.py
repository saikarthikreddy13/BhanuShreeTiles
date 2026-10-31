"""Request helpers: routes, sign-in check, JSON replies, lists and the standard CRUD screens."""
import hashlib
import itertools
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from functools import wraps
from math import ceil

from flask import Blueprint, g, jsonify, request
from flask.json.provider import DefaultJSONProvider

from .db import Where, db, now, transaction
from .errors import AppError, bad_request, forbidden, not_found
from .money import plain
from .permissions import ACTION_COLUMNS, ACTIONS, has_permission
from .validate import clean, int_param

COOKIE_NAME = "erp_session"

api = Blueprint("api", __name__, url_prefix="/api")
_names = itertools.count()


def encode(value):
    if isinstance(value, Decimal):
        return plain(value)
    if isinstance(value, datetime):
        return value.isoformat(timespec="milliseconds") + "Z"
    if isinstance(value, date):
        return f"{value.isoformat()}T00:00:00.000Z"
    raise TypeError(f"Cannot encode {type(value)}")


class ErpJson(DefaultJSONProvider):
    sort_keys = False
    ensure_ascii = False

    @staticmethod
    def default(value):
        return encode(value)


def to_json(value):
    return json.dumps(value, default=encode)


def route(rule, methods="GET", perm=None):
    """perm is (module, action), checked on the server on every call."""
    def decorate(fn):
        @wraps(fn)
        def view(**kwargs):
            if perm and not has_permission(g.user, *perm):
                raise forbidden()
            return fn(**kwargs)
        api.add_url_rule(rule, f"{fn.__name__}_{next(_names)}", view, methods=methods.split(","))
        return fn
    return decorate


def body():
    if not request.get_data():
        return {}
    try:
        data = json.loads(request.get_data())
    except ValueError:
        raise bad_request("Invalid JSON in request") from None
    return data if isinstance(data, dict) else {}


def reply(data=None, message=None, status=200, **extra):
    out = {"success": True}
    if message is not None:
        out["message"] = message
    if data is not None or (message is None and not extra):
        out["data"] = data
    out.update(extra)
    return jsonify(out), status


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def user_permissions(role_id):
    rows = db.all(
        'SELECT p.name, rp.* FROM "RolePermission" rp JOIN "Permission" p ON p.id = rp."permissionId" WHERE rp."roleId" = %s',
        role_id,
    )
    result = {}
    for row in rows:
        actions = [a for a in ACTIONS if row[ACTION_COLUMNS[a]]]
        if actions:
            result[row["name"]] = actions
    return result


def authenticate(allow_password_change=False):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise AppError(401, "Please log in")
    session = db.one('SELECT * FROM "Session" WHERE "tokenHash" = %s', hash_token(token))
    if not session or session["revokedAt"] or session["expiresAt"] < now():
        raise AppError(401, "Your session has expired. Please log in again")
    user = db.get("User", session["userId"])
    if user["status"] != "ACTIVE":
        raise AppError(401, "Your account is not active")
    if now() - session["lastSeenAt"] > timedelta(seconds=60):
        db.execute('UPDATE "Session" SET "lastSeenAt" = %s WHERE id = %s', now(), session["id"])
    user.pop("passwordHash")
    user["role"] = db.get("Role", user["roleId"])
    user["isSuperAdmin"] = user["role"]["name"] == "SUPER_ADMIN"
    user["permissions"] = user_permissions(user["roleId"])
    g.user = user
    g.session_id = session["id"]
    if user["mustChangePassword"] and not allow_password_change:
        raise AppError(403, "Please change your password to continue")


def client_ip():
    return request.remote_addr


def user_agent():
    return (request.headers.get("User-Agent") or "")[:300] or None


def audit(action, module, description, entity_id=None, user_id=None):
    """Audit failures are logged but never break the request that triggered them."""
    try:
        current = getattr(g, "user", None)
        db.insert("AuditLog", {
            "userId": user_id if user_id is not None else (current or {}).get("id"),
            "action": action, "module": module, "description": description, "entityId": entity_id,
            "ipAddress": client_ip(), "userAgent": user_agent(),
        })
    except Exception as error:
        print("Audit log error:", error, flush=True)


def _number(value, fallback):
    try:
        number = int(float(value))
    except (TypeError, ValueError, OverflowError):
        return fallback
    return number or fallback


def page_params():
    page = max(_number(request.args.get("page"), 1), 1)
    limit = min(max(_number(request.args.get("limit"), 25), 1), 1000)
    return page, limit, (page - 1) * limit


def date_range(values=None):
    """A day runs from local midnight to local midnight, stored as UTC."""
    values = request.args if values is None else values
    result = {}

    def boundary(text, clock):
        try:
            day = datetime.fromisoformat(str(text)[:10])
        except ValueError:
            return None
        return (day + clock).astimezone(timezone.utc).replace(tzinfo=None)

    start = boundary(values.get("from"), timedelta()) if values.get("from") else None
    end = boundary(values.get("to"), timedelta(hours=23, minutes=59, seconds=59, milliseconds=999)) if values.get("to") else None
    if start:
        result["gte"] = start
    if end:
        result["lte"] = end
    return result or None


def send_list(table, where, order, include, module):
    """Sends a paged list. ?export=1 returns up to 5000 rows and requires the export permission."""
    exporting = request.args.get("export") == "1"
    if exporting and not has_permission(g.user, module, "export"):
        raise forbidden()
    page, limit, skip = (1, 5000, 0) if exporting else page_params()
    rows = db.all(
        f'SELECT t.* FROM "{table}" t{where.sql} ORDER BY {order} LIMIT %s OFFSET %s',
        *where.params, limit, skip,
    )
    total = db.value(f'SELECT COUNT(*) AS n FROM "{table}" t{where.sql}', *where.params)
    if include:
        include(db, rows)
    return jsonify({
        "success": True, "data": rows,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": max(ceil(total / limit), 1)},
    })


def crud(path, table, module, label, fields, search=(), include=None, order="t.id DESC", filters=None, date_field=None,
         prepare=None, soft_delete=None, no_delete=False, describe=None):
    """Standard list/get/create/update/delete routes for master data."""
    describe = describe or (lambda row: row.get("name") or row["id"])
    filters = filters or {}

    def with_include(store, row):
        if include:
            include(store, [row])
        return row

    @route(path, perm=(module, "read"))
    def list_rows():
        where = Where().search(request.args.get("search"), search)
        for key, build in filters.items():
            if request.args.get(key):
                build(where, request.args[key])
        if date_field:
            where.range(f't."{date_field}"', date_range())
        return send_list(table, where, order, include, module)

    @route(f"{path}/<id>", perm=(module, "read"))
    def get_row(id):
        row = db.get(table, int_param(id))
        if not row:
            raise not_found(label)
        return reply(with_include(db, row))

    @route(path, "POST", perm=(module, "create"))
    def create_row():
        data = clean(body(), fields)
        with transaction() as tx:
            if prepare:
                data = prepare(tx, data, "create", None)
            row = with_include(tx, tx.insert(table, data))
        audit("CREATE", module, f"Created {label} {describe(row)}", row["id"])
        return reply(row, f"{label} created", 201)

    @route(f"{path}/<id>", "PUT", perm=(module, "update"))
    def update_row(id):
        row_id = int_param(id)
        data = clean(body(), fields, partial=True)
        with transaction() as tx:
            if prepare:
                data = prepare(tx, data, "update", row_id)
            row = with_include(tx, tx.update(table, row_id, data))
        audit("UPDATE", module, f"Updated {label} {describe(row)}", row["id"])
        return reply(row, f"{label} updated")

    if not no_delete:
        @route(f"{path}/<id>", "DELETE", perm=(module, "delete"))
        def delete_row(id):
            row_id = int_param(id)
            row = db.update(table, row_id, soft_delete)
            audit("DELETE", module, f"Deactivated {label} {describe(row)}", row_id)
            return reply(message=f"{label} deactivated")
