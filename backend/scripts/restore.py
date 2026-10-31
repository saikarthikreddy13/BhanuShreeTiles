"""Replaces ALL current data with a backup. Run with the file name and --confirm:
    python scripts/restore.py erp-backup-....json.gz --confirm
A safety backup of the current data is taken first."""
import gzip
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from erp.backup import TABLES, create_backup, table_name  # noqa: E402
from erp.config import BACKUP_DIR  # noqa: E402
from erp.db import transaction  # noqa: E402


def moment(value):
    """Backups write times as 2026-10-31T06:05:03.387Z, and MySQL takes them without the T and Z."""
    if isinstance(value, str) and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z", value):
        return value[:-1].replace("T", " ")
    return value


def main():
    if len(sys.argv) != 3 or sys.argv[2] != "--confirm":
        sys.exit("Usage: python scripts/restore.py <backup-file> --confirm")
    file = BACKUP_DIR / Path(sys.argv[1]).name
    if not file.is_file():
        sys.exit(f"Backup not found: {file}")

    tables = json.loads(gzip.decompress(file.read_bytes()))["tables"]
    safety = create_backup(None, 1000)
    print(f"Safety backup: {safety['fileName']}")

    with transaction() as tx:
        # These two settings stay on this connection only and are cleared before it is reused.
        tx.execute("SET @erp_restore = 1, FOREIGN_KEY_CHECKS = 0")
        tx.execute('DELETE FROM "Session"')
        tx.execute('DELETE FROM "PasswordResetToken"')
        for key in reversed(TABLES):
            tx.execute(f'DELETE FROM "{table_name(key)}"')
        for key in TABLES:
            rows = tables.get(key) or []
            name = table_name(key)
            for row in rows:
                columns = ", ".join(f'"{c}"' for c in row)
                marks = ", ".join(["%s"] * len(row))
                tx.execute(f'INSERT INTO "{name}" ({columns}) VALUES ({marks})', *[moment(v) for v in row.values()])
        tx.insert("BackupRecord", {"fileName": safety["fileName"], "sizeBytes": safety["sizeBytes"], "rowCount": safety["rowCount"]})
        tx.execute("SET @erp_restore = NULL, FOREIGN_KEY_CHECKS = 1")
    print("Restore complete. Users must log in again.")


if __name__ == "__main__":
    main()
