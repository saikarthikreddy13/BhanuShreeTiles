"""Add the Italica range from italica_products.json. Safe to run repeatedly: a product whose SKU
already exists is skipped, so nothing entered in the ERP is overwritten. Italica publishes no
prices, so prices start at 0 and stock is left untouched."""
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from erp.db import db, now, transaction  # noqa: E402

CATEGORIES = {"Glaze Vitrified Tiles": "Glazed Vitrified Tiles"}
BUSINESS_ROOMS = {"Cafe", "Restaurant", "Showroom", "Lift area"}


def find_or_add(table, name, description):
    row = db.one(f'SELECT id FROM "{table}" WHERE name = %s', name)
    return row["id"] if row else db.insert(table, {"name": name, "description": description})["id"]


def sku_for(p):
    sku = f"IT-{p['slug'].upper()}-{p['collection'].split('-mm')[0].replace('-X-', 'X').replace('-x-', 'X')}"
    return sku if len(sku) <= 50 else f"{sku[:41]}-{hashlib.sha1(sku.encode()).hexdigest()[:8]}"


def size_text(p):
    size = re.match(r"\d+x\d+", p["size"])[0]
    thick = re.match(r"\d+", p["thickness"] or "")
    return f"{size} mm, {thick[0]} mm thick" if thick else f"{size} mm"


def description(p):
    rooms = list(p["rooms"])
    if BUSINESS_ROOMS & set(rooms) and "Commercial" not in rooms:
        rooms.insert(0, "Commercial")
    parts = [f"Rooms: {', '.join(rooms)}." if rooms else "", " and ".join(p["uses"]) + "." if p["uses"] else ""]
    if p.get("surface"):
        parts.append(f"Surface: {p['surface'].title()}.")
    if p.get("body"):
        parts.append(f"Tile body: {p['body']}.")
    return " ".join(x for x in parts if x)


def main():
    products = json.loads((Path(__file__).parent / "italica_products.json").read_text(encoding="utf-8"))
    brand = find_or_add("Brand", "Italica", "Italica Tiles")
    categories = {}
    for name in {p["category"] for p in products}:
        title = CATEGORIES.get(name, name)
        categories[name] = find_or_add("Category", title, None)
    have = {r["sku"] for r in db.all('SELECT sku FROM "Product" WHERE sku LIKE %s', "IT-%")}
    stamp = now()
    rows = []
    for p in products:
        sku = sku_for(p)
        if sku in have:
            continue
        have.add(sku)
        rows.append((
            sku, p["name"].title(), description(p), categories[p["category"]], brand, size_text(p), p.get("color"),
            (p.get("finish") or p.get("surface") or "").title() or None,
            f"/images/italica/{p['image']}" if p.get("image") else None, 0, 0, stamp,
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
