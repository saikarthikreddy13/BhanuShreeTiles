import threading

from waitress import serve

from erp.app import create_app, scheduled_backups
from erp.config import FRONTEND_PORT, HOST, PORT

app = create_app()

if __name__ == "__main__":
    threading.Thread(target=scheduled_backups, daemon=True).start()
    print(f"API:      http://localhost:{PORT}/api/health", flush=True)
    print(f"Website:  http://localhost:{FRONTEND_PORT}/login.html", flush=True)
    serve(app, listen=f"{HOST}:{PORT} {HOST}:{FRONTEND_PORT}", threads=16)
