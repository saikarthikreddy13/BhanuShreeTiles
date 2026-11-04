"""Add the Letina range from letina_products.txt. Safe to run repeatedly: a product whose SKU
already exists is skipped, so nothing entered in the ERP is overwritten. Letina publishes no
prices, so prices start at 0 and stock is left untouched. Photos load from letina.in itself.

    python backend\\scripts\\seed_letina.py            add the products
    python backend\\scripts\\seed_letina.py --check    only parse the list and print counts"""
import hashlib
import re
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

IMAGE_BASE = "https://www.letina.in/includes/img/products/"
WORD_NAME = re.compile(r"[A-Za-z]+(?:-+[A-Za-z]+)*(?:-\d)?")


def display_name(label):
    """CADBURY-BLACK -> Cadbury Black; design codes such as 3129-HL01-(1138) -> 3129-HL01 (1138)."""
    if WORD_NAME.fullmatch(label):
        return " ".join(w.capitalize() for w in re.split(r"-+", label))
    name = re.sub(r"-*\(", " (", label).replace("_", "-")
    return re.sub(r"-{2,}", "-", name).strip()


def sku_for(folder, label):
    code = re.sub(r"[^A-Z0-9]+", "-", label.upper()).strip("-")[:32]
    return f"LT-{code}-{hashlib.sha1((folder + label).encode()).hexdigest()[:8]}"


def read_products():
    products, group, seen = [], None, set()
    for line in (Path(__file__).parent / "letina_products.txt").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            size, category, finish, rooms, folder = (x.strip() for x in line[1:].split("|"))
            group = {"size": size, "category": category, "finish": finish, "rooms": rooms, "folder": folder}
            continue
        for label in line.split():
            name = display_name(label)
            # The same tile is shown in several colour sets on Letina's pages; list it once.
            key = (group["size"], group["finish"], name.lower())
            if key in seen:
                continue
            seen.add(key)
            products.append({**group, "label": label, "name": name})
    return products


def main():
    products = read_products()
    if "--check" in sys.argv:
        for p in products[:5] + products[-3:]:
            print(sku_for(p["folder"], p["label"]), "|", p["name"], "|", p["size"], "|", p["finish"])
        print(f"{len(products)} Letina products in the list")
        return

    from erp.db import db, now, transaction

    def find_or_add(table, name, description):
        row = db.one(f'SELECT id FROM "{table}" WHERE name = %s', name)
        return row["id"] if row else db.insert(table, {"name": name, "description": description})["id"]

    brand = find_or_add("Brand", "Letina", "Letina Vitrified (letina.in)")
    categories = {name: find_or_add("Category", name, None) for name in {p["category"] for p in products}}
    have = {r["sku"] for r in db.all('SELECT sku FROM "Product" WHERE sku LIKE %s', "LT-%")}
    stamp = now()
    rows = []
    for p in products:
        sku = sku_for(p["folder"], p["label"])
        if sku in have:
            continue
        have.add(sku)
        rows.append((
            sku, p["name"], f"Rooms: {p['rooms']}. {p['category']}, {p['finish']} series.",
            categories[p["category"]], brand, p["size"], None, p["finish"],
            IMAGE_BASE + quote(f"{p['folder']}{p['label']}.jpg", safe="/-_."), 0, 0, stamp,
        ))
    with transaction() as tx:
        with tx.conn.cursor() as cur:
            cur.executemany(
                'INSERT INTO "Product" (sku, name, description, "categoryId", "brandId", size, color, finish, "imageUrl", '
                '"purchasePrice", "sellingPrice", "updatedAt") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                rows,
            )
    print(f"Added {len(rows)} products, skipped {len(products) - len(rows)} already present")


if __name__ == "__main__":
    main()
