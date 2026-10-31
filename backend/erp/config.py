import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

# localhost can try IPv6 first and hang when the database listens on IPv4 only.
DATABASE_URL = (os.environ.get("DATABASE_URL") or "").split("?")[0].strip('"').replace("@localhost:", "@127.0.0.1:")
PORT = int(os.environ.get("PORT") or 5001)
FRONTEND_PORT = int(os.environ.get("FRONTEND_PORT") or 3000)
HOST = os.environ.get("HOST") or "localhost"
PRODUCTION = os.environ.get("APP_ENV") == "production"
TRUST_PROXY = int(os.environ.get("TRUST_PROXY") or 0)
API_RATE_LIMIT = int(os.environ.get("API_RATE_LIMIT") or 600)
AUTH_RATE_LIMIT = int(os.environ.get("AUTH_RATE_LIMIT") or 30)
ORIGINS = [
    o.strip()
    for o in (os.environ.get("FRONTEND_ORIGIN") or f"http://localhost:{FRONTEND_PORT},http://127.0.0.1:{FRONTEND_PORT}").split(",")
]

FRONTEND_DIR = ROOT.parent / "frontend"
UPLOAD_DIR = ROOT / "uploads"
BACKUP_DIR = ROOT / "backups"
UPLOAD_DIR.mkdir(exist_ok=True)
