from flask import g, request

from ..db import Where, db, join_many, join_one, transaction
from ..errors import bad_request, conflict, not_found
from ..money import D
from ..services import move_stock, next_number
from ..validate import clean, decimal, enum, int_param, integer, query_int, string
from ..web import audit, body, date_range, reply, route, send_list

GODOWN = integer("Godown", min=1, required=True)
NOTES = string("Notes", max=300)
REASON = string("Reason", min=3, max=200, required=True)


def clean_lines(items, extra=None):
    if not isinstance(items, list) or not items:
        raise bad_request("Add at least one product")
    return [clean(item, {
        "productId": integer("Product", min=1, required=True),
        "quantity": decimal("Quantity", min=0.01, required=True),
        **(extra or {}),
    }) for item in items]


def product_search(where):
    term = request.args.get("search")
    where.contains([], term, [
        'EXISTS (SELECT 1 FROM "Product" x WHERE x.id = t."productId" AND POSITION(LOWER(%s) IN LOWER(x.name)) > 0)',
        'EXISTS (SELECT 1 FROM "Product" x WHERE x.id = t."productId" AND POSITION(LOWER(%s) IN LOWER(x.sku)) > 0)',
    ])
    return where


def by_place(where):
    for key in ("godownId", "productId"):
        if request.args.get(key):
            where.eq(key, query_int(request.args[key]))
    return where


def balance_include(store, rows):
    join_one(store, rows, "product", "Product", "productId", "id,name,sku,unit,reorderLevel,purchasePrice,sellingPrice")
    join_one(store, rows, "godown", "Godown", "godownId", "id,name")


@route("/stock/balances", perm=("stock", "read"))
def balances():
    where = by_place(product_search(Where()))
    order = '(SELECT name FROM "Product" p WHERE p.id = t."productId") ASC, t."godownId" ASC'
    return send_list("StockBalance", where, order, balance_include, "stock")


def low_stock_products(take=200):
    return db.all(
        'SELECT p.id, p.name, p.sku, p."reorderLevel", CAST(COALESCE(SUM(b.quantity), 0) AS DOUBLE) AS quantity '
        'FROM "Product" p LEFT JOIN "StockBalance" b ON b."productId" = p.id '
        """WHERE p.status = 'ACTIVE' AND p."reorderLevel" > 0 GROUP BY p.id """
        'HAVING COALESCE(SUM(b.quantity), 0) <= p."reorderLevel" ORDER BY quantity ASC LIMIT %s',
        take,
    )


@route("/stock/low", perm=("stock", "read"))
def low():
    return reply(low_stock_products())


@route("/stock/valuation", perm=("stock", "read"))
def valuation():
    return reply(db.all(
        'SELECT g.id, g.name AS godown, COUNT(DISTINCT b."productId") AS products, '
        'CAST(COALESCE(SUM(b.quantity), 0) AS DOUBLE) AS units, '
        'CAST(COALESCE(SUM(b.quantity * p."purchasePrice"), 0) AS DOUBLE) AS "costValue", '
        'CAST(COALESCE(SUM(b.quantity * p."sellingPrice"), 0) AS DOUBLE) AS "saleValue" '
        'FROM "Godown" g LEFT JOIN "StockBalance" b ON b."godownId" = g.id '
        'LEFT JOIN "Product" p ON p.id = b."productId" GROUP BY g.id ORDER BY g.name'
    ))


def movement_include(store, rows):
    join_one(store, rows, "product", "Product", "productId", "name,sku")
    join_one(store, rows, "godown", "Godown", "godownId", "name")
    join_one(store, rows, "createdBy", "User", "createdById", "name")


@route("/stock/movements", perm=("stock", "read"))
def movements():
    where = by_place(product_search(Where()))
    if request.args.get("type"):
        where.eq("type", request.args["type"])
    where.range('t."createdAt"', date_range())
    return send_list("StockMovement", where, "t.id DESC", movement_include, "stock")


def documents(path, table, number_field, item_table, item_fk, joins):
    """Read-only lists of stock documents share one shape."""
    def include(store, rows):
        for key, parent, fk in joins:
            join_one(store, rows, key, parent, fk, "name")
        join_many(store, rows, "items", item_table, item_fk)
        join_one(store, [i for r in rows for i in r["items"]], "product", "Product", "productId", "name,sku")

    @route(path, perm=("stock", "read"))
    def list_documents():
        where = Where().search(request.args.get("search"), [number_field]).range('t."createdAt"', date_range())
        return send_list(table, where, "t.id DESC", include, "stock")


GODOWN_JOIN = ("godown", "Godown", "godownId")
documents("/stock/in", "StockIn", "stockInNo", "StockInItem", "stockInId", [GODOWN_JOIN, ("supplier", "Supplier", "supplierId")])
documents("/stock/out", "StockOut", "stockOutNo", "StockOutItem", "stockOutId", [GODOWN_JOIN])
documents("/stock/transfers", "StockTransfer", "transferNo", "StockTransferItem", "transferId",
          [("fromGodown", "Godown", "fromGodownId"), ("toGodown", "Godown", "toGodownId")])
documents("/stock/adjustments", "StockAdjustment", "adjustmentNo", "StockAdjustmentItem", "adjustmentId",
          [GODOWN_JOIN, ("createdBy", "User", "createdById")])
documents("/stock/damaged", "DamagedStock", "damageNo", "DamagedStockItem", "damagedStockId", [GODOWN_JOIN])


@route("/stock/in", "POST", perm=("stock", "create"))
def stock_in():
    payload = body()
    data = clean(payload, {"godownId": GODOWN, "supplierId": integer("Supplier", min=1), "notes": NOTES})
    items = clean_lines(payload.get("items"), {"unitCost": decimal("Unit cost", min=0)})
    with transaction() as tx:
        doc = tx.insert("StockIn", {
            "stockInNo": next_number(tx, "SI"), "godownId": data["godownId"], "supplierId": data.get("supplierId"),
            "notes": data.get("notes") or None, "createdById": g.user["id"],
        })
        tx.insert_many("StockInItem", [
            {"stockInId": doc["id"], "productId": i["productId"], "quantity": i["quantity"], "unitCost": i.get("unitCost")} for i in items
        ])
        for item in items:
            move_stock(tx, item["productId"], data["godownId"], item["quantity"], "IN", "StockIn", doc["id"], data.get("notes"), g.user["id"])
    audit("STOCK_IN", "stock", f"Stock in {doc['stockInNo']}", doc["id"])
    return reply(doc, f"{doc['stockInNo']} saved", 201)


@route("/stock/out", "POST", perm=("stock", "create"))
def stock_out():
    payload = body()
    data = clean(payload, {"godownId": GODOWN, "reason": REASON, "notes": NOTES})
    items = clean_lines(payload.get("items"))
    with transaction() as tx:
        doc = tx.insert("StockOut", {
            "stockOutNo": next_number(tx, "SO"), "godownId": data["godownId"], "reason": data["reason"],
            "notes": data.get("notes") or None, "createdById": g.user["id"],
        })
        tx.insert_many("StockOutItem", [{"stockOutId": doc["id"], "productId": i["productId"], "quantity": i["quantity"]} for i in items])
        for item in items:
            move_stock(tx, item["productId"], data["godownId"], -item["quantity"], "OUT", "StockOut", doc["id"], data["reason"], g.user["id"])
    audit("STOCK_OUT", "stock", f"Stock out {doc['stockOutNo']}", doc["id"])
    return reply(doc, f"{doc['stockOutNo']} saved", 201)


@route("/stock/transfers", "POST", perm=("stock", "create"))
def transfer():
    payload = body()
    data = clean(payload, {
        "fromGodownId": integer("From godown", min=1, required=True),
        "toGodownId": integer("To godown", min=1, required=True),
        "notes": NOTES,
    })
    if data["fromGodownId"] == data["toGodownId"]:
        raise bad_request("Choose two different godowns")
    items = clean_lines(payload.get("items"))
    with transaction() as tx:
        doc = tx.insert("StockTransfer", {
            "transferNo": next_number(tx, "ST"), "fromGodownId": data["fromGodownId"], "toGodownId": data["toGodownId"],
            "notes": data.get("notes") or None, "createdById": g.user["id"],
        })
        tx.insert_many("StockTransferItem", [{"transferId": doc["id"], "productId": i["productId"], "quantity": i["quantity"]} for i in items])
        for item in items:
            shared = (doc["id"], doc["transferNo"], g.user["id"])
            move_stock(tx, item["productId"], data["fromGodownId"], -item["quantity"], "TRANSFER", "StockTransfer", *shared)
            move_stock(tx, item["productId"], data["toGodownId"], item["quantity"], "TRANSFER", "StockTransfer", *shared)
    audit("STOCK_TRANSFER", "stock", f"Transfer {doc['transferNo']}", doc["id"])
    return reply(doc, f"{doc['transferNo']} saved", 201)


@route("/stock/transfers/<id>/cancel", "POST", perm=("stock", "approve"))
def cancel_transfer(id):
    transfer_id = int_param(id)
    with transaction() as tx:
        existing = tx.get("StockTransfer", transfer_id, lock=True)
        if not existing:
            raise not_found("Transfer")
        if existing["status"] == "CANCELLED":
            raise conflict("Transfer is already cancelled")
        shared = (transfer_id, f"Cancelled {existing['transferNo']}", g.user["id"])
        for item in tx.all('SELECT * FROM "StockTransferItem" WHERE "transferId" = %s', transfer_id):
            move_stock(tx, item["productId"], existing["toGodownId"], -D(item["quantity"]), "TRANSFER", "StockTransferCancel", *shared)
            move_stock(tx, item["productId"], existing["fromGodownId"], item["quantity"], "TRANSFER", "StockTransferCancel", *shared)
        doc = tx.update("StockTransfer", transfer_id, {"status": "CANCELLED"})
    audit("CANCEL", "stock", f"Cancelled transfer {doc['transferNo']}", transfer_id)
    return reply(doc, "Transfer cancelled and stock moved back")


@route("/stock/adjustments", "POST", perm=("stock", "update"))
def adjustment():
    payload = body()
    data = clean(payload, {
        "godownId": GODOWN,
        "type": enum("Type", ["INCREASE", "DECREASE"], required=True),
        "reason": REASON,
    })
    items = clean_lines(payload.get("items"))
    with transaction() as tx:
        doc = tx.insert("StockAdjustment", {
            "adjustmentNo": next_number(tx, "ADJ"), "godownId": data["godownId"], "type": data["type"], "reason": data["reason"],
            "createdById": g.user["id"],
        })
        tx.insert_many("StockAdjustmentItem", [{"adjustmentId": doc["id"], "productId": i["productId"], "quantity": i["quantity"]} for i in items])
        for item in items:
            delta = item["quantity"] if data["type"] == "INCREASE" else -item["quantity"]
            move_stock(tx, item["productId"], data["godownId"], delta, "ADJUSTMENT", "StockAdjustment", doc["id"], data["reason"], g.user["id"])
    audit("UPDATE", "stock", f"Adjustment {doc['adjustmentNo']}", doc["id"])
    return reply(doc, f"{doc['adjustmentNo']} saved", 201)


@route("/stock/damaged", "POST", perm=("stock", "create"))
def damaged():
    payload = body()
    data = clean(payload, {"godownId": GODOWN, "reason": REASON, "notes": NOTES})
    items = clean_lines(payload.get("items"))
    with transaction() as tx:
        ids = [i["productId"] for i in items]
        cost = {p["id"]: p["purchasePrice"] for p in tx.all('SELECT id, "purchasePrice" FROM "Product" WHERE id IN %s', ids)}
        doc = tx.insert("DamagedStock", {
            "damageNo": next_number(tx, "DMG"), "godownId": data["godownId"], "reason": data["reason"],
            "notes": data.get("notes") or None, "createdById": g.user["id"],
        })
        tx.insert_many("DamagedStockItem", [{
            "damagedStockId": doc["id"], "productId": i["productId"], "quantity": i["quantity"],
            "value": i["quantity"] * D(cost.get(i["productId"])),
        } for i in items])
        for item in items:
            move_stock(tx, item["productId"], data["godownId"], -item["quantity"], "DAMAGED", "DamagedStock", doc["id"], data["reason"], g.user["id"])
    audit("STOCK_OUT", "stock", f"Damaged stock {doc['damageNo']}", doc["id"])
    return reply(doc, f"{doc['damageNo']} saved", 201)
