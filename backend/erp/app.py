import re
import threading
import time
import traceback
from collections import defaultdict
from math import ceil

import pymysql
from PIL import Image, UnidentifiedImageError
from flask import Flask, Response as app_response, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from . import routes  # noqa: F401
from .backup import create_backup
from .config import API_RATE_LIMIT, AUTH_RATE_LIMIT, FRONTEND_DIR, ORIGINS, PORT, PRODUCTION, TRUST_PROXY, UPLOAD_DIR
from .db import PoolTimeout, db
from .errors import AppError
from .imagesearch import describe, index as photo_index
from .tilemodel import build_glb
from .services import get_settings
from .web import ErpJson, api, authenticate, reply, route

PUBLIC = {
    "/health", "/auth/login", "/auth/forgot-password", "/auth/reset-password", "/auth/logout", "/auth/session", "/public/catalog",
    "/public/image-search", "/public/tile.glb",
}
PASSWORD_CHANGE_ALLOWED = {"/auth/me", "/auth/change-password"}
AUTH_LIMITED = {"/auth/login", "/auth/forgot-password", "/auth/reset-password"}
UNAVAILABLE = "The database is unavailable. Please try again shortly"
DUPLICATE = 1062
LINKED = {1451, 1452}
INVALID = {1048, 1264, 1265, 1292, 1364, 1366, 1406}
UNREACHABLE = {1040, 1205, 1213, 2002, 2003, 2006, 2013}


class RateLimiter:
    def __init__(self, window, limit, message):
        self.window = window
        self.limit = limit
        self.message = message
        self.hits = defaultdict(list)
        self.lock = threading.Lock()

    def check(self, key):
        moment = time.monotonic()
        with self.lock:
            if len(self.hits) > 10000:
                self.hits.clear()
            hits = [t for t in self.hits[key] if moment - t < self.window]
            hits.append(moment)
            self.hits[key] = hits
            return len(hits) <= self.limit


general_limit = RateLimiter(60, API_RATE_LIMIT, "Too many requests. Please slow down")
auth_limit = RateLimiter(15 * 60, AUTH_RATE_LIMIT, "Too many attempts. Try again later")


@route("/health")
def health():
    try:
        db.value("SELECT 1 AS ok")
        return reply(message="Backend running", database="connected")
    except (pymysql.Error, PoolTimeout):
        return jsonify({"success": False, "message": "Backend running, database unavailable", "database": "disconnected"}), 503


def int_arg(name, default):
    value = request.args.get(name) or ""
    return int(value) if value.isdecimal() and len(value) < 7 else default


# What the website may show about a tile: never cost prices.
PUBLIC_FIELDS = (
    'SELECT p.name, p.size, p.color, p.finish, p."imageUrl", p."sellingPrice" AS price, c.name AS category, COALESCE(b.name, \'\') AS brand, '
    'CAST(COALESCE((SELECT SUM(s.quantity) FROM "StockBalance" s WHERE s."productId" = p.id AND s.quantity > 0), 0) AS DOUBLE) AS boxes'
)
PUBLIC_TABLES = 'FROM "Product" p JOIN "Category" c ON c.id = p."categoryId" LEFT JOIN "Brand" b ON b.id = p."brandId"'


IMAGES_DIR = (FRONTEND_DIR / "images").resolve()


@route("/public/tile.glb")
def public_tile_model():
    """3D tile patch for "Try in your room" (AR on phones, 3D preview elsewhere)."""
    image = (request.args.get("image") or "")[:300]
    place = "wall" if request.args.get("place") == "wall" else "floor"
    path = (IMAGES_DIR / image.removeprefix("/images/")).resolve() if image.startswith("/images/") else None
    if not path or not path.is_relative_to(IMAGES_DIR) or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"} or not path.is_file():
        raise AppError(404, "Tile photo not found")
    with Image.open(path) as photo:
        glb, _ = build_glb(photo, (request.args.get("size") or "")[:60], (request.args.get("finish") or "")[:60], place)
    response = app_response(glb, mimetype="model/gltf-binary")
    # The same address always gives the same model, so phones and Vercel can keep it.
    response.headers["Cache-Control"] = "public, max-age=604800, s-maxage=31536000, immutable"
    return response


@route("/public/image-search", methods="POST")
def public_image_search():
    """Tiles that look most like the customer's photo."""
    file = request.files.get("image")
    if not file:
        raise AppError(400, "Choose a photo to search with")
    try:
        photo = Image.open(file.stream)
        if photo.format not in {"JPEG", "PNG", "WEBP", "GIF", "BMP"}:
            raise AppError(400, "Use a JPG, PNG or WebP photo")
        wanted = describe(photo)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise AppError(400, "This photo could not be read. Try another one") from None
    known, vectors = photo_index()
    brand = (request.form.get("brand") or "").strip()[:80]
    tests, params = ["p.status = 'ACTIVE'", 'p."imageUrl" IS NOT NULL'], []
    if brand:
        tests.append("b.name = %s")
        params.append(brand)
    rows = [r for r in db.all(f"{PUBLIC_FIELDS} {PUBLIC_TABLES} WHERE {' AND '.join(tests)}", *params) if r["imageUrl"] in known]
    likeness = vectors @ wanted   # both are unit length, so this is cosine similarity
    rows.sort(key=lambda r: -likeness[known[r["imageUrl"]]])
    return reply(rows[:24], total=min(len(rows), 24))


@route("/public/catalog")
def public_catalog():
    """Website catalogue: public fields and boxes available, never cost prices."""
    q = (request.args.get("q") or "").strip()[:80]
    brand = (request.args.get("brand") or "").strip()[:80]
    size = (request.args.get("size") or "").strip()[:60]
    limit = min(max(int_arg("limit", 24), 1), 60)
    page = max(int_arg("page", 1), 1)
    fields = ["p.name", "p.sku", "p.size", "p.color", "p.finish", "p.description", "c.name"]
    tests = ["p.status = 'ACTIVE'"]
    params = []
    if re.fullmatch(r"\d+x\d+", q):
        # A size search must match the whole size: 200x1200 is not 1200x1200.
        tests.append("p.size LIKE %s")
        params.append(f"{q} %")
    elif q:
        # Every word typed must appear somewhere, so "black cadbury" finds Cadbury Black.
        fields.append("b.name")
        for word in q.split()[:6]:
            tests.append("(" + " OR ".join(f"POSITION(LOWER(%s) IN LOWER(COALESCE({f}, ''))) > 0" for f in fields) + ")")
            params += [word] * len(fields)
    if brand:
        tests.append("b.name = %s")
        params.append(brand)
    tables = PUBLIC_TABLES
    where = " AND ".join(tests)
    sizes = [r["size"] for r in db.all(f"SELECT DISTINCT p.size {tables} WHERE {where} AND p.size IS NOT NULL", *params)]
    sizes.sort(key=lambda s: [int(n) for n in re.findall(r"\d+", s)])
    if size:
        where += " AND p.size = %s"
        params.append(size)
    total = db.value(f"SELECT COUNT(*) AS n {tables} WHERE {where}", *params)
    # A tile whose name is what was typed comes first, then names starting with it.
    order, order_params = "p.name ASC", []
    if q and not re.fullmatch(r"\d+x\d+", q):
        order = "CASE WHEN LOWER(p.name) = LOWER(%s) THEN 0 WHEN LOWER(p.name) LIKE CONCAT(LOWER(%s), '%%') THEN 1 ELSE 2 END, p.name ASC"
        order_params = [q, q.replace("%", "").replace("_", "")]
    rows = db.all(
        f"{PUBLIC_FIELDS} {tables} WHERE {where} ORDER BY {order} LIMIT %s OFFSET %s",
        *params, *order_params, limit, (page - 1) * limit,
    )
    brands = [r["name"] for r in db.all('SELECT DISTINCT b.name FROM "Brand" b JOIN "Product" p ON p."brandId" = b.id WHERE p.status = \'ACTIVE\' ORDER BY b.name')]
    return reply(rows, total=total, pages=max(ceil(total / limit), 1), sizes=sizes, brands=brands)


def page_policy():
    """Content-Security-Policy for the website and ERP pages: the browser may only run scripts and
    load data from this site and the libraries it uses, so injected code cannot run or send data
    elsewhere. Keep this list in step with what the pages load."""
    api = "" if PRODUCTION else f" {request.scheme}://{request.host.split(':')[0]}:{PORT}"
    rules = {
        "default-src": "'self'",
        # Inline is needed for the small scripts and onclick handlers already in the pages.
        "script-src": "'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
        "style-src": "'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src": "'self' data: https://fonts.gstatic.com",
        "img-src": "'self' data: blob:",
        "media-src": "'self' blob:",
        # model-viewer fetches the 3D tiles here, and its optional decoders from Google's gstatic.
        "connect-src": f"'self' blob: data: https://cdn.jsdelivr.net https://www.gstatic.com{api}",
        "worker-src": "'self' blob:",
        "frame-src": "https://www.openstreetmap.org",
        "frame-ancestors": "'self'",
        "object-src": "'none'",
        "base-uri": "'self'",
        "form-action": "'self'",
    }
    policy = "; ".join(f"{k} {v}" for k, v in rules.items())
    return policy + ("; upgrade-insecure-requests" if PRODUCTION else "")


def not_found_reply():
    if request.path.startswith("/api/"):
        return jsonify({"success": False, "message": "API route not found"}), 404
    return send_from_directory(FRONTEND_DIR, "404.html"), 404


def create_app():
    app = Flask(__name__, static_folder=None)
    app.json = ErpJson(app)
    app.url_map.strict_slashes = False
    app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024
    if TRUST_PROXY:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=TRUST_PROXY)
    app.register_blueprint(api)

    @app.before_request
    def gate():
        origin = request.headers.get("Origin")
        if request.method == "OPTIONS" and origin in ORIGINS:
            return "", 204
        if not request.path.startswith("/api/"):
            return None
        path = request.path[4:].rstrip("/")
        client = request.remote_addr
        if not general_limit.check(client):
            return jsonify({"success": False, "message": general_limit.message}), 429
        if path in AUTH_LIMITED and request.method == "POST" and not auth_limit.check(client):
            return jsonify({"success": False, "message": auth_limit.message}), 429
        if path not in PUBLIC:
            authenticate(allow_password_change=path in PASSWORD_CHANGE_ALLOWED)
        return None

    @app.after_request
    def headers(response):
        origin = request.headers.get("Origin")
        if origin in ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            response.headers["Vary"] = "Origin"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.path.startswith(("/api/", "/uploads/")):
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
            response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        elif response.mimetype == "text/html":
            response.headers["Content-Security-Policy"] = page_policy()
            response.headers["Permissions-Policy"] = "camera=(self), microphone=(), geolocation=(), payment=(), usb=()"
        if not request.path.startswith(("/api/", "/uploads/")) and response.status_code == 200:
            # Vercel keeps public files until the next deploy, so they stop passing through the app.
            browser = 86400 if request.path.startswith("/images/") else 0
            response.headers["Cache-Control"] = f"public, max-age={browser}, s-maxage=31536000"
        return response

    @app.errorhandler(AppError)
    def app_error(error):
        payload = {"success": False, "message": error.message}
        if error.errors:
            payload["errors"] = error.errors
        return jsonify(payload), error.status

    @app.errorhandler(HTTPException)
    def http_error(error):
        if error.code in (404, 405):
            return not_found_reply()
        if error.code == 413:
            return jsonify({"success": False, "message": "The upload is too large"}), 413
        return jsonify({"success": False, "message": error.description}), error.code

    @app.errorhandler(Exception)
    def any_error(error):
        code = error.args[0] if isinstance(error, pymysql.Error) and error.args else None
        if code == DUPLICATE:
            key = re.search(r"for key '(?:[^.']*\.)?([^']*)'", str(error.args[1]))
            name = key[1].split("_") if key else []
            label = ", ".join(name[1:-1]) or "value"
            return jsonify({"success": False, "message": f"This {label} already exists"}), 409
        if code in LINKED:
            return jsonify({"success": False, "message": "This record is linked to other records. Deactivate it instead"}), 409
        if code in INVALID or isinstance(error, pymysql.DataError):
            return jsonify({"success": False, "message": "A value in this request is missing or invalid"}), 400
        if code in UNREACHABLE or isinstance(error, PoolTimeout):
            return jsonify({"success": False, "message": UNAVAILABLE}), 503
        print(f"{request.method} {request.path}:", flush=True)
        traceback.print_exception(error)
        return jsonify({"success": False, "message": "Something went wrong on the server"}), 500

    @app.get("/uploads/<path:name>")
    def uploads(name):
        return send_from_directory(UPLOAD_DIR, name)

    @app.get("/")
    def home():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.get("/<path:name>")
    def site(name):
        if name.startswith("api/"):
            return not_found_reply()
        if (FRONTEND_DIR / name).is_file():
            return send_from_directory(FRONTEND_DIR, name)
        if (FRONTEND_DIR / f"{name}.html").is_file():
            return send_from_directory(FRONTEND_DIR, f"{name}.html")
        return not_found_reply()

    return app


def scheduled_backups():
    time.sleep(60)
    while True:
        try:
            settings = get_settings()
            if settings and settings["backupEnabled"]:
                latest = db.one('SELECT "createdAt" FROM "BackupRecord" ORDER BY id DESC LIMIT 1')
                age = db.value("SELECT TIMESTAMPDIFF(SECOND, %s, UTC_TIMESTAMP()) AS v", latest["createdAt"]) if latest else None
                if age is None or age >= 23 * 3600:
                    record = create_backup(None, settings["backupKeepCount"])
                    print(f"Scheduled backup created: {record['fileName']}", flush=True)
        except Exception as error:
            print("Scheduled backup failed:", error, flush=True)
        time.sleep(3600)
