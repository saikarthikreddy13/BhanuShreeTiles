from flask import g, request

from ..db import Where, db, join_many, join_one, name_match, now, transaction
from ..errors import bad_request, conflict, not_found
from ..money import D, compute_totals
from ..permissions import has_permission
from ..services import get_settings, move_stock, next_number, post_supplier, record_payment, reverse_payment
from ..validate import clean, date, decimal, enum, int_param, integer, query_int, string
from ..web import audit, body, date_range, reply, route, send_list
from .sales import METHODS


def clean_lines(items):
    if not isinstance(items, list) or not items:
        raise bad_request("Add at least one product")
    return [clean(item, {
        "productId": integer("Product", min=1, required=True),
        "quantity": decimal("Quantity", min=0.01, required=True),
        "unitCost": decimal("Purchase price", min=0, required=True),
        "discount": decimal("Item discount", min=0),
        "taxPercent": decimal("GST %", min=0, max=100),
    }) for item in items]


def totals_for(tx, lines, discount):
    ids = list({l["productId"] for l in lines})
    products = {p["id"]: p for p in tx.all('SELECT * FROM "Product" WHERE id IN %s', ids)}
    priced = []
    for line in lines:
        product = products.get(line["productId"])
        if not product:
            raise bad_request(f"Product {line['productId']} does not exist")
        tax = line.get("taxPercent")
        priced.append({
            "productId": line["productId"], "quantity": D(line["quantity"]), "unitPrice": D(line["unitCost"]),
            "discount": D(line.get("discount")), "taxPercent": D(product["taxPercent"] if tax is None else tax),
        })
    totals = compute_totals(priced, discount)
    for item in totals["items"]:
        item["unitCost"] = item.pop("unitPrice")
    return totals


def receive_purchase(tx, purchase, items, user_id, paid_amount=None, method=None, transaction_id=None):
    """Runs when a purchase is approved: stock in, supplier ledger, optional payment."""
    number = purchase["purchaseNumber"]
    stock_in = tx.insert("StockIn", {
        "stockInNo": next_number(tx, "SI"), "godownId": purchase["godownId"], "supplierId": purchase["supplierId"],
        "purchaseId": purchase["id"], "createdById": user_id, "notes": f"Purchase {number}",
    })
    tx.insert_many("StockInItem", [
        {"stockInId": stock_in["id"], "productId": i["productId"], "quantity": i["quantity"], "unitCost": i["unitCost"]} for i in items
    ])
    for item in items:
        move_stock(tx, item["productId"], purchase["godownId"], item["quantity"], "IN", "Purchase", purchase["id"], f"Purchase {number}", user_id)
    post_supplier(tx, purchase["supplierId"], credit=purchase["totalAmount"], reference=number,
                  description="Purchase received", date=purchase["purchaseDate"])
    if D(paid_amount) > 0:
        record_payment(tx, {
            "direction": "OUT", "amount": paid_amount, "method": method or "CASH", "transactionId": transaction_id,
            "supplierId": purchase["supplierId"], "purchaseId": purchase["id"], "notes": f"Payment for {number}",
        }, user_id)


def list_include(store, rows):
    join_one(store, rows, "supplier", "Supplier", "supplierId", "id,name,phone")
    join_one(store, rows, "godown", "Godown", "godownId", "id,name")
    join_one(store, rows, "approvedBy", "User", "approvedById", "id,name")


@route("/purchases", perm=("purchases", "read"))
def list_purchases():
    where = Where().search(request.args.get("search"), ["purchaseNumber", "supplierInvoiceNo"], [name_match("Supplier", "supplierId")])
    if request.args.get("status"):
        where.eq("status", request.args["status"])
    if request.args.get("supplierId"):
        where.eq("supplierId", query_int(request.args["supplierId"]))
    if request.args.get("payment") == "due":
        where.raw('t."balanceAmount" > 0')
    where.range('t."purchaseDate"', date_range())
    return send_list("Purchase", where, "t.id DESC", list_include, "purchases")


@route("/purchases/<id>", perm=("purchases", "read"))
def get_purchase(id):
    purchase = db.get("Purchase", int_param(id))
    if not purchase:
        raise not_found("Purchase")
    list_include(db, [purchase])
    join_many(db, [purchase], "payments", "Payment", "purchaseId", order="id DESC")
    join_many(db, [purchase], "items", "PurchaseItem", "purchaseId")
    join_one(db, purchase["items"], "product", "Product", "productId", "name,sku,unit")
    return reply(purchase)


@route("/purchases", "POST", perm=("purchases", "create"))
def create_purchase():
    payload = body()
    data = clean(payload, {
        "supplierId": integer("Supplier", min=1, required=True),
        "godownId": integer("Godown", min=1, required=True),
        "supplierInvoiceNo": string("Supplier invoice no", max=60),
        "purchaseOrderId": integer("Purchase order", min=1),
        "purchaseDate": date("Purchase date"),
        "discount": decimal("Discount", min=0),
        "paidAmount": decimal("Amount paid", min=0),
        "method": enum("Payment mode", METHODS),
        "transactionId": string("Reference", max=80),
        "notes": string("Notes", max=500),
    })
    lines = clean_lines(payload.get("items"))
    can_approve = has_permission(g.user, "purchases", "approve")
    if not can_approve and D(data.get("paidAmount")) > 0:
        raise bad_request("Record the payment after this purchase is approved")

    with transaction() as tx:
        supplier = tx.get("Supplier", data["supplierId"])
        godown = tx.get("Godown", data["godownId"])
        if not supplier or not supplier["isActive"]:
            raise bad_request("Supplier is not available")
        if not godown or godown["status"] != "ACTIVE":
            raise bad_request("Godown is not available")

        totals = totals_for(tx, lines, data.get("discount"))
        if D(data.get("paidAmount")) > totals["totalAmount"]:
            raise bad_request("Amount paid cannot exceed the total")

        settings = get_settings(tx) or {}
        purchase = tx.insert("Purchase", {
            "purchaseNumber": next_number(tx, settings.get("purchasePrefix") or "BST-PUR"),
            "supplierId": data["supplierId"], "godownId": data["godownId"],
            "supplierInvoiceNo": data.get("supplierInvoiceNo") or None, "purchaseOrderId": data.get("purchaseOrderId"),
            "purchaseDate": data.get("purchaseDate") or now(), "createdById": g.user["id"], "subtotal": totals["subtotal"],
            "discount": totals["discount"], "taxAmount": totals["taxAmount"], "totalAmount": totals["totalAmount"],
            "balanceAmount": totals["totalAmount"], "status": "RECEIVED" if can_approve else "DRAFT",
            "approvedById": g.user["id"] if can_approve else None, "approvedAt": now() if can_approve else None,
            "notes": data.get("notes") or None,
        })
        tx.insert_many("PurchaseItem", [{**item, "purchaseId": purchase["id"]} for item in totals["items"]])
        if can_approve:
            receive_purchase(tx, purchase, totals["items"], g.user["id"], data.get("paidAmount"), data.get("method"), data.get("transactionId"))
        if data.get("purchaseOrderId"):
            tx.update("PurchaseOrder", data["purchaseOrderId"], {"status": "COMPLETED"})

    audit("CREATE", "purchases", f"Created purchase {purchase['purchaseNumber']}", purchase["id"])
    message = f"Purchase {purchase['purchaseNumber']} received" if can_approve else f"Purchase {purchase['purchaseNumber']} sent for approval"
    return reply(purchase, message, 201)


@route("/purchases/<id>/approve", "POST", perm=("purchases", "approve"))
def approve_purchase(id):
    purchase_id = int_param(id)
    data = clean(body(), {"paidAmount": decimal("Amount paid", min=0), "method": enum("Payment mode", METHODS)})
    with transaction() as tx:
        existing = tx.get("Purchase", purchase_id, lock=True)
        if not existing:
            raise not_found("Purchase")
        if existing["status"] != "DRAFT":
            raise conflict("Only purchases awaiting approval can be approved")
        if not existing["godownId"]:
            raise bad_request("This purchase has no godown")
        purchase = tx.update("Purchase", purchase_id, {"status": "RECEIVED", "approvedById": g.user["id"], "approvedAt": now()})
        items = tx.all('SELECT * FROM "PurchaseItem" WHERE "purchaseId" = %s', purchase_id)
        receive_purchase(tx, purchase, items, g.user["id"], data.get("paidAmount"), data.get("method"))
    audit("APPROVE", "purchases", f"Approved purchase {purchase['purchaseNumber']}", purchase_id)
    return reply(purchase, "Purchase approved and stock updated")


REASON = {"reason": string("Reason", min=3, max=300, required=True)}


@route("/purchases/<id>/reject", "POST", perm=("purchases", "reject"))
def reject_purchase(id):
    purchase_id = int_param(id)
    reason = clean(body(), REASON)["reason"]
    existing = db.get("Purchase", purchase_id)
    if not existing:
        raise not_found("Purchase")
    if existing["status"] != "DRAFT":
        raise conflict("Only purchases awaiting approval can be rejected")
    purchase = db.update("Purchase", purchase_id, {"status": "CANCELLED", "cancelReason": reason, "balanceAmount": 0})
    audit("REJECT", "purchases", f"Rejected purchase {purchase['purchaseNumber']}: {reason}", purchase_id)
    return reply(purchase, "Purchase rejected")


@route("/purchases/<id>/cancel", "POST", perm=("purchases", "approve"))
def cancel_purchase(id):
    """Fails with a clear message if the goods have already been sold."""
    purchase_id = int_param(id)
    reason = clean(body(), REASON)["reason"]
    with transaction() as tx:
        existing = tx.get("Purchase", purchase_id, lock=True)
        if not existing:
            raise not_found("Purchase")
        if existing["status"] == "CANCELLED":
            raise conflict("Purchase is already cancelled")
        if existing["status"] != "DRAFT":
            for payment in tx.all("""SELECT * FROM "Payment" WHERE "purchaseId" = %s AND status <> 'CANCELLED'""", purchase_id):
                reverse_payment(tx, payment, f"Purchase cancelled: {reason}")
            if existing["godownId"]:
                for item in tx.all('SELECT * FROM "PurchaseItem" WHERE "purchaseId" = %s', purchase_id):
                    move_stock(tx, item["productId"], existing["godownId"], -D(item["quantity"]), "RETURN", "PurchaseCancel",
                               purchase_id, f"Cancelled {existing['purchaseNumber']}", g.user["id"])
            post_supplier(tx, existing["supplierId"], debit=existing["totalAmount"], reference=existing["purchaseNumber"],
                          description=f"Purchase cancelled: {reason}")
        purchase = tx.update("Purchase", purchase_id, {"status": "CANCELLED", "cancelReason": reason, "balanceAmount": 0})
    audit("CANCEL", "purchases", f"Cancelled purchase {purchase['purchaseNumber']}: {reason}", purchase_id)
    return reply(purchase, "Purchase cancelled and reversed")


@route("/purchase-orders", perm=("purchase_orders", "read"))
def list_orders():
    where = Where().search(request.args.get("search"), ["orderNumber"])
    if request.args.get("status"):
        where.eq("status", request.args["status"])
    where.range('t."orderDate"', date_range())
    return send_list("PurchaseOrder", where, "t.id DESC",
                     lambda store, rows: join_one(store, rows, "supplier", "Supplier", "supplierId", "id,name"), "purchase_orders")


@route("/purchase-orders/<id>", perm=("purchase_orders", "read"))
def get_order(id):
    order = db.get("PurchaseOrder", int_param(id))
    if not order:
        raise not_found("Purchase order")
    join_one(db, [order], "supplier", "Supplier", "supplierId")
    join_many(db, [order], "items", "PurchaseOrderItem", "purchaseOrderId")
    join_one(db, order["items"], "product", "Product", "productId", "id,name,sku,unit,taxPercent")
    return reply(order)


@route("/purchase-orders", "POST", perm=("purchase_orders", "create"))
def create_order():
    payload = body()
    data = clean(payload, {
        "supplierId": integer("Supplier", min=1, required=True),
        "expectedDate": date("Expected date"),
        "notes": string("Notes", max=500),
    })
    lines = clean_lines(payload.get("items"))
    with transaction() as tx:
        totals = totals_for(tx, lines, 0)
        order = tx.insert("PurchaseOrder", {
            "orderNumber": next_number(tx, "PO"), "supplierId": data["supplierId"], "expectedDate": data.get("expectedDate"),
            "subtotal": totals["subtotal"], "taxAmount": totals["taxAmount"], "totalAmount": totals["totalAmount"],
            "notes": data.get("notes") or None, "createdById": g.user["id"],
        })
        tx.insert_many("PurchaseOrderItem", [{
            "purchaseOrderId": order["id"], "productId": i["productId"], "quantity": i["quantity"],
            "unitPrice": i["unitCost"], "totalAmount": i["totalAmount"],
        } for i in totals["items"]])
    audit("CREATE", "purchase_orders", f"Created {order['orderNumber']}", order["id"])
    return reply(order, f"{order['orderNumber']} saved", 201)


def decide_order(id, status, action):
    order_id = int_param(id)
    existing = db.get("PurchaseOrder", order_id)
    if not existing:
        raise not_found("Purchase order")
    if existing["status"] != "PENDING":
        raise conflict("Only pending orders can be decided")
    order = db.update("PurchaseOrder", order_id, {"status": status, "approvedById": g.user["id"], "approvedAt": now()})
    audit(action, "purchase_orders", f"{order['orderNumber']} {status.lower()}", order_id)
    return reply(order, f"Order {status.lower()}")


@route("/purchase-orders/<id>/approve", "POST", perm=("purchase_orders", "approve"))
def approve_order(id):
    return decide_order(id, "APPROVED", "APPROVE")


@route("/purchase-orders/<id>/reject", "POST", perm=("purchase_orders", "reject"))
def reject_order(id):
    return decide_order(id, "REJECTED", "REJECT")
