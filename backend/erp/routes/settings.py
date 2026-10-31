from flask import g, send_from_directory

from ..backup import create_backup
from ..config import BACKUP_DIR
from ..db import Where, db, join_one
from ..errors import not_found
from ..services import get_settings
from ..validate import boolean, clean, decimal, int_param, integer, string
from ..web import audit, body, reply, route, send_list


def text(label, max=160):
    return string(label, max=max)


FIELDS = {
    "companyName": string("Company name", max=160, required=True),
    "legalName": text("Legal name"), "phone": text("Contact number", 40), "email": text("Email"), "gstin": text("GSTIN", 20), "pan": text("PAN", 12),
    "website": text("Website"), "currency": text("Currency", 40), "address": text("Address", 400),
    "invoicePrefix": string("Invoice prefix", max=12, required=True),
    "purchasePrefix": string("Purchase prefix", max=12, required=True),
    "tax": decimal("Default tax", min=0, max=100),
    "dueDays": integer("Due days", min=0, max=365),
    "invoiceFooter": text("Invoice footer", 400), "paymentMode": text("Default payment mode", 30), "roundOff": text("Round off", 20),
    "lowStock": integer("Low stock level", min=0),
    "lowStockAlert": boolean(), "saleAlert": boolean(), "purchaseAlert": boolean(), "paymentAlert": boolean(), "expenseAlert": boolean(),
    "twoFactor": boolean(), "loginAlert": boolean(), "sessionTimeout": boolean(),
    "timezone": text("Timezone", 60), "dateFormat": text("Date format", 20), "language": text("Language", 30), "dashboard": text("Dashboard", 40), "theme": text("Theme", 30),
    "pageSize": integer("Page size", min=5, max=200),
    "maxLoginAttempts": integer("Login attempts", min=3, max=20),
    "sessionHours": integer("Session hours", min=1, max=72),
    "backupEnabled": boolean(), "backupKeepCount": integer("Backups to keep", min=1, max=365),
}


@route("/settings/company")
def company():
    """Details printed on documents; any signed-in user may need them."""
    s = get_settings() or {}
    keys = ["companyName", "legalName", "address", "phone", "email", "gstin", "website", "invoiceFooter", "tax", "paymentMode", "pageSize"]
    return reply({k: s.get(k) for k in keys})


@route("/settings", perm=("settings", "read"))
def read_settings():
    return reply(get_settings())


@route("/settings", "PUT", perm=("settings", "update"))
def save_settings():
    data = clean(body(), FIELDS, partial=True)
    for key in list(data):
        if data[key] is None:
            if FIELDS[key]["type"] == "string":
                data[key] = ""
            else:
                del data[key]
    if "tax" in data:
        data["tax"] = float(data["tax"])
    current = get_settings()
    settings = db.update("ErpSettings", current["id"], data)
    audit("UPDATE", "settings", "Updated system settings", settings["id"])
    return reply(settings, "Settings saved")


@route("/backup", perm=("backup", "read"))
def list_backups():
    return send_list("BackupRecord", Where(), "t.id DESC",
                     lambda store, rows: join_one(store, rows, "createdBy", "User", "createdById", "name"), "backup")


@route("/backup", "POST", perm=("backup", "create"))
def make_backup():
    settings = get_settings() or {}
    record = create_backup(g.user["id"], settings.get("backupKeepCount") or 14)
    audit("BACKUP", "backup", f"Created backup {record['fileName']}", record["id"])
    return reply(record, "Backup created", 201)


@route("/backup/<id>/download", perm=("backup", "export"))
def download_backup(id):
    record = db.get("BackupRecord", int_param(id))
    if not record:
        raise not_found("Backup")
    name = record["fileName"].replace("\\", "/").rsplit("/", 1)[-1]
    if not (BACKUP_DIR / name).is_file():
        raise not_found("Backup file")
    audit("EXPORT", "backup", f"Downloaded backup {record['fileName']}", record["id"])
    return send_from_directory(BACKUP_DIR, name, as_attachment=True, download_name=record["fileName"])
