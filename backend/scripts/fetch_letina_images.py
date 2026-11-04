"""Download each Letina photo once, shrink it and save it in frontend/images/letina.

Letina's server does not let other websites read photo pixels, which image search and the 360
room view need, so the site keeps its own copies like the Italica ones. Photos already saved
are skipped, so this is safe to run again. Requests go one at a time with a pause between them."""
import io
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import quote

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from seed_letina import IMAGE_BASE, LOCAL_DIR, image_file, read_products  # noqa: E402

MAX_SIDE = 900


def main():
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    saved = skipped = failed = 0
    for p in read_products():
        target = LOCAL_DIR / image_file(p)
        if target.exists():
            skipped += 1
            continue
        url = IMAGE_BASE + quote(f"{p['folder']}{p['label']}.jpg", safe="/-_.")
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "BhanuShreeTiles-catalogue/1.0 (+https://bhanushreetiles.vercel.app)"}), timeout=30) as r:
                photo = Image.open(io.BytesIO(r.read())).convert("RGB")
        except Exception as error:  # noqa: BLE001 - report and carry on with the rest
            print(f"failed {url}: {error}")
            failed += 1
            continue
        photo.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        photo.save(target, "JPEG", quality=82, optimize=True, progressive=True)
        saved += 1
        time.sleep(0.25)
    print(f"Saved {saved}, already had {skipped}, failed {failed}")


if __name__ == "__main__":
    main()
