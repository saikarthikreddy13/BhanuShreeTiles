"""Entry point for Vercel, which runs the app from the project root."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

from erp.app import create_app  # noqa: E402

app = create_app()
