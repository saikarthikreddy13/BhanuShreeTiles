import gzip
from datetime import datetime, timezone

from .config import BACKUP_DIR
from .db import db
from .web import to_json

# Dependency order, so a restore inserts parents before children.
TABLES = [
    "role", "permission", "rolePermission", "user", "category", "brand", "product", "godown", "stockBalance", "stockMovement",
    "customer", "supplier", "salesDocument", "salesDocumentItem", "sale", "saleItem", "invoice", "purchaseOrder", "purchaseOrderItem",
    "purchase", "purchaseItem", "payment", "receipt", "creditDebitNote", "stockIn", "stockInItem", "stockOut", "stockOutItem",
    "stockTransfer", "stockTransferItem", "damagedStock", "damagedStockItem", "stockAdjustment", "stockAdjustmentItem",
    "expense", "income", "employee", "attendance", "leaveRequest", "payroll", "salesTeamMember", "customerLedger", "supplierLedger",
    "auditLog", "loginHistory", "documentSequence", "erpSettings", "backupRecord",
]


def table_name(key):
    return key[0].upper() + key[1:]


def create_backup(user_id=None, keep=14):
    BACKUP_DIR.mkdir(exist_ok=True)
    tables = {key: db.all(f'SELECT * FROM "{table_name(key)}"') for key in TABLES}
    moment = datetime.now(timezone.utc)
    stamp = moment.strftime("%Y-%m-%dT%H-%M-%S-") + f"{moment.microsecond // 1000:03d}Z"
    file_name = f"erp-backup-{stamp}.json.gz"
    payload = gzip.compress(to_json({"version": 1, "createdAt": moment.isoformat(), "tables": tables}).encode())
    (BACKUP_DIR / file_name).write_bytes(payload)

    record = db.insert("BackupRecord", {
        "fileName": file_name, "sizeBytes": len(payload), "rowCount": sum(len(r) for r in tables.values()), "createdById": user_id,
    })
    for row in db.all('SELECT * FROM "BackupRecord" ORDER BY id DESC LIMIT 18446744073709551615 OFFSET %s', keep):
        (BACKUP_DIR / row["fileName"]).unlink(missing_ok=True)
        db.execute('DELETE FROM "BackupRecord" WHERE id = %s', row["id"])
    return record
