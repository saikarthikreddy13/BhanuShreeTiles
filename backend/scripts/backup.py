import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from erp.backup import create_backup  # noqa: E402
from erp.services import get_settings  # noqa: E402

settings = get_settings() or {}
record = create_backup(None, settings.get("backupKeepCount") or 14)
print(f"Backup created: {record['fileName']}")
