"""Applies the SQL files in migrations/ that this database has not had yet. Safe to run again."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from erp.config import ROOT  # noqa: E402
from erp.db import connect  # noqa: E402


def statements(text):
    """Trigger bodies hold semicolons, so a statement ends only where the next one begins."""
    text = re.sub(r"^--.*$", "", text, flags=re.M)
    return [s.strip() for s in re.split(r";\s*\n\s*(?=CREATE |ALTER |INSERT )", text.strip().rstrip(";")) if s.strip()]


def main():
    conn = connect()
    with conn.cursor() as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS erp_migrations (name VARCHAR(191) PRIMARY KEY, applied_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3))")
        cur.execute("SELECT name FROM erp_migrations")
        applied = {r["name"] for r in cur.fetchall()}
        for file in sorted((ROOT / "migrations").glob("*.sql")):
            if file.stem in applied:
                continue
            for statement in statements(file.read_text(encoding="utf-8")):
                cur.execute(statement)
            cur.execute("INSERT INTO erp_migrations (name) VALUES (%s)", (file.stem,))
            print(f"Applied {file.name}")
    conn.close()
    print("Migrations complete.")


if __name__ == "__main__":
    main()
