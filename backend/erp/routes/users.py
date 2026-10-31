import re

import pymysql
from flask import g, request

from ..db import Where, db, join_one, now, transaction
from ..errors import bad_request, conflict, forbidden, not_found
from ..permissions import ACTION_COLUMNS, ACTIONS, MODULES
from ..validate import clean, email, enum, int_param, integer, phone, query_int, string
from ..web import audit, body, date_range, reply, route, send_list
from .auth import PASSWORD_RULE, assert_strong_password, hash_password

STATUS = ["ACTIVE", "INACTIVE", "SUSPENDED"]
SAFE = 'id, name, email, phone, username, status, "roleId", "lastLoginAt", "createdAt", "mustChangePassword", "lockedUntil"'

FIELDS = {
    "name": string("Name", min=2, max=120, required=True),
    "username": string("Username", min=3, max=30, required=True),
    "email": email(required=True),
    "phone": phone(),
    "roleId": integer("Role", min=1, required=True),
    "status": enum("Status", STATUS),
}


def safe_user(store, id):
    row = store.one(f'SELECT {SAFE} FROM "User" WHERE id = %s', id)
    if row:
        join_one(store, [row], "role", "Role", "roleId", "name")
    return row


def assert_can_assign(role_id):
    role = db.get("Role", role_id)
    if not role:
        raise bad_request("Role does not exist")
    if role["name"] == "SUPER_ADMIN" and not g.user["isSuperAdmin"]:
        raise forbidden("Only a Super Admin can assign the Super Admin role")
    return role


def assert_can_manage(target):
    if target["role"]["name"] == "SUPER_ADMIN" and not g.user["isSuperAdmin"]:
        raise forbidden("Only a Super Admin can change a Super Admin")


def assert_not_last_super_admin(target):
    """The system must always keep one working Super Admin."""
    if target["role"]["name"] != "SUPER_ADMIN":
        return
    others = db.value(
        'SELECT COUNT(*) AS n FROM "User" u JOIN "Role" r ON r.id = u."roleId" '
        "WHERE u.id <> %s AND u.status = 'ACTIVE' AND r.name = 'SUPER_ADMIN'",
        target["id"],
    )
    if others == 0:
        raise conflict("This is the last active Super Admin")


def find_target(id):
    target = db.get("User", id)
    if not target:
        raise not_found("User")
    target["role"] = db.get("Role", target["roleId"])
    return target


def revoke_sessions(store, user_id):
    store.execute('UPDATE "Session" SET "revokedAt" = %s WHERE "userId" = %s AND "revokedAt" IS NULL', now(), user_id)


def users_include(store, rows):
    for row in rows:
        row.pop("passwordHash", None)
    join_one(store, rows, "role", "Role", "roleId", "name")


@route("/users", perm=("users", "read"))
def list_users():
    where = Where().search(request.args.get("search"), ["name", "username", "email", "phone"])
    if request.args.get("status"):
        where.eq("status", request.args["status"])
    if request.args.get("roleId"):
        where.eq("roleId", query_int(request.args["roleId"]))
    return send_list("User", where, "t.id DESC", users_include, "users")


@route("/users/login-history", perm=("users", "read"))
def login_history():
    where = Where().search(request.args.get("search"), ["identifier", "ipAddress"])
    where.range('t."createdAt"', date_range())
    if request.args.get("success"):
        where.eq("success", request.args["success"] == "true")
    return send_list(
        "LoginHistory", where, "t.id DESC",
        lambda store, rows: join_one(store, rows, "user", "User", "userId", "name,username"), "users",
    )


@route("/users/<id>", perm=("users", "read"))
def get_user(id):
    row = safe_user(db, int_param(id))
    if not row:
        raise not_found("User")
    return reply(row)


@route("/users", "POST", perm=("users", "create"))
def create_user():
    data = clean(body(), {**FIELDS, "password": PASSWORD_RULE})
    assert_strong_password(data["password"])
    role = assert_can_assign(data["roleId"])
    password = data.pop("password")
    created = db.insert("User", {
        **data, "email": data["email"].lower(), "status": data.get("status") or "ACTIVE",
        "passwordHash": hash_password(password), "mustChangePassword": True,
    })
    audit("CREATE", "users", f"Created user {created['username']} with role {role['name']}", created["id"])
    return reply(safe_user(db, created["id"]), "User created", 201)


@route("/users/<id>", "PUT", perm=("users", "update"))
def update_user(id):
    user_id = int_param(id)
    target = find_target(user_id)
    assert_can_manage(target)
    data = clean(body(), FIELDS, partial=True)
    if data.get("roleId") and data["roleId"] != target["roleId"]:
        if user_id == g.user["id"]:
            raise forbidden("You cannot change your own role")
        assert_can_assign(data["roleId"])
        assert_not_last_super_admin(target)
    if data.get("status") and data["status"] != "ACTIVE":
        if user_id == g.user["id"]:
            raise forbidden("You cannot deactivate your own account")
        assert_not_last_super_admin(target)
    if data.get("email"):
        data["email"] = data["email"].lower()
    db.update("User", user_id, data)
    if data.get("status") and data["status"] != "ACTIVE":
        revoke_sessions(db, user_id)
    audit("UPDATE", "users", f"Updated user {data.get('username') or target['username']}", user_id)
    return reply(safe_user(db, user_id), "User updated")


@route("/users/<id>/reset-password", "POST", perm=("users", "update"))
def admin_reset_password(id):
    user_id = int_param(id)
    target = find_target(user_id)
    assert_can_manage(target)
    password = clean(body(), {"password": PASSWORD_RULE})["password"]
    assert_strong_password(password)
    with transaction() as tx:
        tx.update("User", user_id, {
            "passwordHash": hash_password(password), "mustChangePassword": True, "failedLogins": 0, "lockedUntil": None,
        })
        revoke_sessions(tx, user_id)
    audit("PASSWORD", "users", f"Reset password for {target['username']}", user_id)
    return reply(message="Password reset. The user must change it at next login")


@route("/users/<id>", "DELETE", perm=("users", "delete"))
def delete_user(id):
    """Users with history are deactivated, so their records keep a valid author."""
    user_id = int_param(id)
    if user_id == g.user["id"]:
        raise forbidden("You cannot delete your own account")
    target = find_target(user_id)
    assert_can_manage(target)
    assert_not_last_super_admin(target)
    if db.value('SELECT COUNT(*) AS n FROM "AuditLog" WHERE "userId" = %s', user_id) == 0:
        try:
            db.execute('DELETE FROM "User" WHERE id = %s', user_id)
            audit("DELETE", "users", f"Deleted user {target['username']}", user_id)
            return reply(message="User deleted")
        except pymysql.IntegrityError:
            pass
    db.update("User", user_id, {"status": "INACTIVE"})
    revoke_sessions(db, user_id)
    audit("DELETE", "users", f"Deactivated user {target['username']}", user_id)
    return reply(message="This user has history, so the account was deactivated instead")


def role_row(row):
    row["_count"] = {"users": row.pop("users")}
    return row


ROLE_COUNT = 'SELECT r.*, (SELECT COUNT(*) FROM "User" u WHERE u."roleId" = r.id) AS users FROM "Role" r'


@route("/roles", perm=("roles", "read"))
def list_roles():
    return reply([role_row(r) for r in db.all(f"{ROLE_COUNT} ORDER BY r.id ASC")])


@route("/roles/options")
def role_options():
    return reply(db.all('SELECT id, name FROM "Role" ORDER BY name ASC'))


@route("/roles", "POST", perm=("roles", "create"))
def create_role():
    data = clean(body(), {
        "name": string("Role name", min=2, max=40, required=True),
        "description": string("Description", max=200),
    })
    data["name"] = re.sub(r"[^A-Z0-9]+", "_", data["name"].upper())
    role = db.insert("Role", data)
    audit("CREATE", "roles", f"Created role {role['name']}", role["id"])
    return reply(role, "Role created", 201)


@route("/roles/<id>", "DELETE", perm=("roles", "delete"))
def delete_role(id):
    role_id = int_param(id)
    role = db.one(f"{ROLE_COUNT} WHERE r.id = %s", role_id)
    if not role:
        raise not_found("Role")
    if role["isSystem"]:
        raise forbidden("System roles cannot be deleted")
    if role["users"]:
        raise conflict("Move this role's users to another role first")
    db.execute('DELETE FROM "Role" WHERE id = %s', role_id)
    audit("DELETE", "roles", f"Deleted role {role['name']}", role_id)
    return reply(message="Role deleted")


@route("/roles/<id>/permissions", perm=("roles", "read"))
def get_permissions(id):
    role_id = int_param(id)
    role = db.get("Role", role_id)
    if not role:
        raise not_found("Role")
    rows = db.all(
        'SELECT p.name AS module_name, rp.* FROM "RolePermission" rp JOIN "Permission" p ON p.id = rp."permissionId" WHERE rp."roleId" = %s',
        role_id,
    )
    by_module = {r["module_name"]: r for r in rows}
    matrix = [
        {
            "module": key, "label": label,
            "actions": {a: role["name"] == "SUPER_ADMIN" or bool(by_module.get(key, {}).get(ACTION_COLUMNS[a])) for a in ACTIONS},
        }
        for key, label in MODULES
    ]
    return reply({"role": {"id": role["id"], "name": role["name"]}, "actions": ACTIONS, "matrix": matrix})


@route("/roles/<id>/permissions", "PUT", perm=("roles", "update"))
def save_permissions(id):
    role_id = int_param(id)
    role = db.get("Role", role_id)
    if not role:
        raise not_found("Role")
    if role["name"] == "SUPER_ADMIN":
        raise forbidden("Super Admin always has every permission")
    if role["id"] == g.user["roleId"]:
        raise forbidden("You cannot change your own role's permissions")
    matrix = body().get("matrix")
    if not isinstance(matrix, list):
        raise bad_request("Permission matrix is required")

    known = {m for m, _ in MODULES}
    ids = {p["name"]: p["id"] for p in db.all('SELECT id, name FROM "Permission"')}
    columns = [ACTION_COLUMNS[a] for a in ACTIONS]
    names = ", ".join(f'"{c}"' for c in columns)
    updates = ", ".join(f'"{c}" = VALUES("{c}")' for c in columns)
    with transaction() as tx:
        for row in matrix:
            module = row.get("module") if isinstance(row, dict) else None
            if module not in known or module not in ids:
                raise bad_request(f"Unknown module {module}")
            actions = row.get("actions") if isinstance(row.get("actions"), dict) else {}
            flags = [bool(actions.get(a)) for a in ACTIONS]
            tx.execute(
                f'INSERT INTO "RolePermission" ("roleId", "permissionId", {names}) VALUES (%s, %s, {", ".join(["%s"] * len(flags))}) '
                f'ON DUPLICATE KEY UPDATE {updates}',
                role_id, ids[module], *flags,
            )
    audit("PERMISSION_CHANGE", "roles", f"Changed permissions for role {role['name']}", role_id)
    return reply(message="Permissions saved")
