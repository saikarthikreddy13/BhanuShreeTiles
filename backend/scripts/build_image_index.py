"""Describe every tile photo for search by photo, saving backend/erp/image_index.npy and .json.

Run it after adding tiles or photos, then commit both files:
    .venv\\Scripts\\python.exe scripts\\build_image_index.py          only photos not yet described
    .venv\\Scripts\\python.exe scripts\\build_image_index.py --all    every photo again
Photos in frontend/images subfolders and ERP uploads in backend/uploads are included, so the same
files serve the local and the hosted database (both store the same imageUrl values)."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from erp.imagesearch import INDEX_KEYS, INDEX_VECTORS, describe, index  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FOLDERS = {"/images/": ROOT / "frontend" / "images", "/uploads/": ROOT / "backend" / "uploads"}


def main():
    rows, old = ({}, None) if "--all" in sys.argv else index()
    keys, vectors = [], []
    for prefix, folder in FOLDERS.items():
        for path in sorted(folder.rglob("*")):
            # Loose files in frontend/images are site banners, not tile photos.
            if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"} or (prefix == "/images/" and path.parent == folder):
                continue
            url = prefix + path.relative_to(folder).as_posix()
            if url in rows:
                vectors.append(old[rows[url]])
            else:
                try:
                    with Image.open(path) as image:
                        vectors.append(describe(image))
                except OSError as error:
                    print(f"skipped {url}: {error}")
                    continue
            keys.append(url)
    np.save(INDEX_VECTORS, np.array(vectors, np.float16))
    INDEX_KEYS.write_text(json.dumps(keys, separators=(",", ":")), encoding="utf-8")
    print(f"{len(keys)} photos described ({len(set(keys) - set(rows))} new)")


if __name__ == "__main__":
    main()
