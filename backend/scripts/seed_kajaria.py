"""Add Kajaria's published tiles from kajaria_products.json. Safe to run repeatedly: a product whose
SKU already exists is skipped, so nothing entered in the ERP is overwritten. Kajaria does not publish
prices, so prices start at 0 and stock is left untouched."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from erp.db import db  # noqa: E402


def find_or_add(table, name, description):
    row = db.one(f'SELECT id FROM "{table}" WHERE name = %s', name)
    return row["id"] if row else db.insert(table, {"name": name, "description": description})["id"]


def main():
    products = json.loads((Path(__file__).parent / "kajaria_products.json").read_text(encoding="utf-8"))
    brand = find_or_add("Brand", "Kajaria", "Kajaria Ceramics")
    added = 0
    for p in products:
        sku = f"KJ-{p['slug'].upper()}"
        image = f"/images/tiles/{p['slug']}.jpg"
        existing = db.one('SELECT id, "imageUrl" FROM "Product" WHERE sku = %s', sku)
        if existing:
            if not existing["imageUrl"]:
                db.update("Product", existing["id"], {"imageUrl": image})
            continue
        use = f" {p['use']}." if p.get("use") else ""
        db.insert("Product", {
            "sku": sku,
            "name": p["name"],
            "description": f"Rooms: {', '.join(p['rooms'])}.{use}",
            "categoryId": find_or_add("Category", p["type"], None),
            "brandId": brand,
            "imageUrl": image,
            "size": p["sizes"][0],
            "color": ", ".join(p["colours"]) or None,
            "finish": ", ".join(p["finishes"]) or None,
            "purchasePrice": 0,
            "sellingPrice": 0,
        })
        added += 1
    print(f"Added {added} products, skipped {len(products) - added} already present")


if __name__ == "__main__":
    main()
