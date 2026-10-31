"""Safe to run repeatedly. It never overwrites existing permissions, settings or passwords,
and never creates sample business data."""
import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bcrypt  # noqa: E402

from erp.db import db  # noqa: E402
from erp.permissions import ACTION_COLUMNS, ACTIONS, LEGACY_ROLE_TEMPLATES, MODULES, ROLE_TEMPLATES  # noqa: E402
from erp.services import get_settings  # noqa: E402


def seed_role(name, template, description):
    role = db.one('SELECT * FROM "Role" WHERE name = %s', name)
    if role:
        db.update("Role", role["id"], {"isSystem": True})
    else:
        role = db.insert("Role", {"name": name, "description": description, "isSystem": True})
    if db.value('SELECT COUNT(*) AS n FROM "RolePermission" WHERE "roleId" = %s', role["id"]):
        return
    for permission in db.all('SELECT * FROM "Permission"'):
        allowed = template.get(permission["name"], [])
        flags = {ACTION_COLUMNS[a]: a in allowed for a in ACTIONS}
        db.execute(
            f'INSERT INTO "RolePermission" ("roleId", "permissionId", {", ".join(chr(34) + k + chr(34) for k in flags)}) '
            f'VALUES (%s, %s, {", ".join(["%s"] * len(flags))})',
            role["id"], permission["id"], *flags.values(),
        )


def main():
    for name, description in MODULES:
        db.execute(
            'INSERT INTO "Permission" (name, description, module) VALUES (%s, %s, %s) '
            "ON DUPLICATE KEY UPDATE description = VALUES(description), module = VALUES(module)",
            name, description, name,
        )
    for name, template in ROLE_TEMPLATES.items():
        seed_role(name, template["perms"], template["description"])
    for name, source in LEGACY_ROLE_TEMPLATES.items():
        if db.one('SELECT id FROM "Role" WHERE name = %s', name):
            seed_role(name, ROLE_TEMPLATES[source]["perms"], ROLE_TEMPLATES[source]["description"])

    if not get_settings():
        db.insert("ErpSettings", {
            "companyName": "Bhanu Shree Tiles", "legalName": "", "phone": "", "email": "", "gstin": "", "pan": "", "website": "",
            "currency": "INR", "address": "", "invoicePrefix": "BST-INV", "purchasePrefix": "BST-PUR", "tax": 18, "dueDays": 30,
            "invoiceFooter": "Thank you for your business", "paymentMode": "CASH", "roundOff": "NONE", "timezone": "Asia/Kolkata",
            "dateFormat": "DD-MM-YYYY", "language": "English", "dashboard": "Role based", "theme": "Dark",
        })
        print("Default settings created. Add your company details in Settings.")

    super_role = db.one("""SELECT id FROM "Role" WHERE name = 'SUPER_ADMIN'""")
    if not db.value('SELECT COUNT(*) AS n FROM "User" WHERE "roleId" = %s', super_role["id"]):
        password = os.environ.get("ADMIN_PASSWORD") or f"{secrets.token_urlsafe(9)}aA1"
        db.insert("User", {
            "name": "Super Administrator", "username": "admin", "email": "admin@bhanushreetiles.com",
            "passwordHash": bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode(), "status": "ACTIVE",
            "roleId": super_role["id"], "mustChangePassword": True,
        })
        print("First Super Admin created.")
        print("  Username: admin")
        if not os.environ.get("ADMIN_PASSWORD"):
            print(f"  Password: {password}  (shown once, change it at first login)")
    print("Seed complete.")


if __name__ == "__main__":
    main()
