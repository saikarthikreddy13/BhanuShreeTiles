import os
import secrets
import smtplib
from datetime import timedelta
from email.message import EmailMessage

import bcrypt
from flask import g, jsonify, make_response, request

from ..config import ORIGINS, PRODUCTION
from ..db import db, now, transaction
from ..errors import AppError, bad_request
from ..services import get_settings
from ..validate import boolean, clean, string
from ..web import COOKIE_NAME, audit, authenticate, body, client_ip, hash_token, reply, route, user_agent

LOCK_MINUTES = 15
REMEMBER_DAYS = 7
RESET_MINUTES = 30
INVALID = "Invalid username or password"

PASSWORD_RULE = string("Password", min=8, max=72, required=True)


def hash_password(password):
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(12)).decode()


def check_password(password, stored):
    return bcrypt.checkpw(password.encode()[:72], stored.encode())


# Compared against when the user does not exist, so response time does not reveal valid usernames.
DUMMY_HASH = hash_password("not-a-real-password")


def assert_strong_password(password):
    if not (any(c.islower() for c in password) and any(c.isupper() for c in password) and any(c.isdigit() for c in password)):
        raise bad_request("Password needs upper case, lower case and a number")


def public_user(user):
    return {
        "id": user["id"], "name": user["name"], "username": user["username"], "email": user["email"], "phone": user["phone"],
        "role": user["role"]["name"], "isSuperAdmin": user["isSuperAdmin"], "mustChangePassword": user["mustChangePassword"],
        "permissions": user["permissions"],
    }


def record_login(identifier, success, reason, user_id=None):
    db.insert("LoginHistory", {
        "userId": user_id, "identifier": identifier[:120], "success": success, "reason": reason,
        "ipAddress": client_ip(), "userAgent": user_agent(),
    })


def find_account(identifier, active_only=False):
    status = "status = 'ACTIVE' AND " if active_only else ""
    return db.one(
        f'SELECT * FROM "User" WHERE {status}(username = %s OR phone = %s OR email = %s) ORDER BY id LIMIT 1',
        identifier, identifier, identifier.lower(),
    )


@route("/auth/login", "POST")
def login():
    data = clean(body(), {
        "identifier": string("Username or contact number", max=120, required=True),
        "password": string("Password", max=200, required=True),
        "remember": boolean(),
    })
    identifier, password, remember = data["identifier"], data["password"], data.get("remember")
    user = find_account(identifier)
    password_ok = check_password(password, user["passwordHash"] if user else DUMMY_HASH)

    if not user:
        record_login(identifier, False, "Unknown user")
        raise AppError(401, INVALID)
    if user["lockedUntil"] and user["lockedUntil"] > now():
        record_login(identifier, False, "Account locked", user["id"])
        raise AppError(429, f"Too many failed attempts. Try again after {LOCK_MINUTES} minutes")
    if not password_ok:
        settings = get_settings()
        limit = (settings or {}).get("maxLoginAttempts") or 5
        failed = user["failedLogins"] + 1
        db.update("User", user["id"], (
            {"failedLogins": 0, "lockedUntil": now() + timedelta(minutes=LOCK_MINUTES)} if failed >= limit else {"failedLogins": failed}
        ))
        record_login(identifier, False, "Wrong password", user["id"])
        raise AppError(401, INVALID)
    if user["status"] != "ACTIVE":
        record_login(identifier, False, f"Account {user['status']}", user["id"])
        raise AppError(403, "This account is not active. Contact your administrator")

    settings = get_settings() or {}
    lifetime = timedelta(days=REMEMBER_DAYS) if remember else timedelta(hours=settings.get("sessionHours") or 8)
    token = secrets.token_hex(32)
    db.insert("Session", {
        "userId": user["id"], "tokenHash": hash_token(token), "expiresAt": now() + lifetime,
        "ipAddress": client_ip(), "userAgent": user_agent(),
    })
    db.update("User", user["id"], {"lastLoginAt": now(), "failedLogins": 0, "lockedUntil": None})
    record_login(identifier, True, None, user["id"])
    audit("LOGIN", "auth", f"{user['username']} logged in", user["id"], user["id"])

    response = make_response(jsonify({"success": True, "message": "Login successful"}))
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, secure=PRODUCTION, samesite="Lax", path="/",
        max_age=int(lifetime.total_seconds()) if remember else None,
    )
    return response


@route("/auth/logout", "POST")
def logout():
    token = request.cookies.get(COOKIE_NAME)
    if token:
        session = db.one('SELECT * FROM "Session" WHERE "tokenHash" = %s', hash_token(token))
        if session and not session["revokedAt"]:
            db.update("Session", session["id"], {"revokedAt": now()})
            audit("LOGOUT", "auth", "User logged out", session["userId"], session["userId"])
    response = make_response(jsonify({"success": True, "message": "Logged out"}))
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, secure=PRODUCTION, samesite="Lax")
    return response


@route("/auth/me")
def me():
    return reply(public_user(g.user))


@route("/auth/session")
def session():
    """Like /auth/me, but answers normally when nobody is signed in."""
    try:
        authenticate(allow_password_change=True)
    except AppError as error:
        if error.status == 401:
            return reply(None)
        raise
    return reply(public_user(g.user))


@route("/auth/change-password", "POST")
def change_password():
    data = clean(body(), {
        "currentPassword": string("Current password", max=200, required=True),
        "newPassword": PASSWORD_RULE,
    })
    assert_strong_password(data["newPassword"])
    user = db.get("User", g.user["id"])
    if not check_password(data["currentPassword"], user["passwordHash"]):
        raise bad_request("Current password is incorrect")
    with transaction() as tx:
        tx.update("User", user["id"], {
            "passwordHash": hash_password(data["newPassword"]), "mustChangePassword": False, "passwordChangedAt": now(),
        })
        tx.execute(
            'UPDATE "Session" SET "revokedAt" = %s WHERE "userId" = %s AND "revokedAt" IS NULL AND id <> %s',
            now(), user["id"], g.session_id,
        )
    audit("PASSWORD", "auth", "Changed own password", user["id"])
    return reply(message="Password changed")


def deliver_reset(user, link):
    host = os.environ.get("SMTP_HOST")
    if not host or not user["email"]:
        if not PRODUCTION:
            print(f"Password reset link for {user['username']}: {link}", flush=True)
        return
    message = EmailMessage()
    message["Subject"] = "Reset your ERP password"
    message["From"] = os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER")
    message["To"] = user["email"]
    message.set_content(f"Open this link within {RESET_MINUTES} minutes to reset your password:\n{link}")
    with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT") or 587), timeout=20) as smtp:
        smtp.starttls()
        if os.environ.get("SMTP_USER"):
            smtp.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASS") or "")
        smtp.send_message(message)


@route("/auth/forgot-password", "POST")
def forgot_password():
    """The response is identical whether or not the account exists."""
    data = clean(body(), {"identifier": string("Username, phone or email", max=120, required=True)})
    user = find_account(data["identifier"], active_only=True)
    if user:
        token = secrets.token_hex(32)
        db.insert("PasswordResetToken", {
            "userId": user["id"], "tokenHash": hash_token(token), "expiresAt": now() + timedelta(minutes=RESET_MINUTES),
        })
        try:
            deliver_reset(user, f"{ORIGINS[0]}/reset-password.html?token={token}")
        except Exception as error:
            print("Reset email failed:", error, flush=True)
        audit("PASSWORD", "auth", "Password reset requested", user["id"], user["id"])
    return reply(message="If that account exists, a reset link has been sent")


@route("/auth/reset-password", "POST")
def reset_password():
    data = clean(body(), {"token": string("Reset token", max=200, required=True), "newPassword": PASSWORD_RULE})
    assert_strong_password(data["newPassword"])
    record = db.one('SELECT * FROM "PasswordResetToken" WHERE "tokenHash" = %s', hash_token(data["token"]))
    if not record or record["usedAt"] or record["expiresAt"] < now():
        raise bad_request("This reset link is invalid or has expired")
    with transaction() as tx:
        tx.update("User", record["userId"], {
            "passwordHash": hash_password(data["newPassword"]), "mustChangePassword": False, "passwordChangedAt": now(),
            "failedLogins": 0, "lockedUntil": None,
        })
        tx.execute('UPDATE "PasswordResetToken" SET "usedAt" = %s WHERE id = %s', now(), record["id"])
        tx.execute('UPDATE "Session" SET "revokedAt" = %s WHERE "userId" = %s AND "revokedAt" IS NULL', now(), record["userId"])
    audit("PASSWORD", "auth", "Password reset completed", record["userId"], record["userId"])
    return reply(message="Password updated. You can log in now")
