from datetime import timedelta

from flask import g, request

from ..db import Where, db, join_child, join_many, join_one, name_match, now, transaction
from ..errors import bad_request, conflict, forbidden, not_found
from ..money import D, compute_totals
from ..permissions import has_permission, own_records_only
from ..services import get_settings, move_stock, next_number, post_customer, record_payment, reverse_payment
from ..validate import clean, date, decimal, enum, int_param, integer, query_int, string
from ..web import audit, body, date_range, reply, route, send_list

METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]
OPEN = ["DRAFT", "SENT", "ACCEPTED"]

HEADER = {
    "customerId": integer("Customer", min=1),
    "godownId": integer("Godown", min=1),
    "discount": decimal("Discount", min=0),
    "notes": string("Notes", max=500),
}


def clean_items(items):
    if not isinstance(items, list) or not items:
        raise bad_request("Add at least one product")
    return [clean(item, {
        "productId": integer("Product", min=1, required=True),
        "quantity": decimal("Quantity", min=0.01, required=True),
        "unitPrice": decimal("Price", min=0),
        "discount": decimal("Item discount", min=0),
    }) for item in items]


def price_lines(tx, items, user):
    """Prices and GST come from the product record. Changing a price needs the sales approve permission."""
    ids = list({i["productId"] for i in items})
    products = {p["id"]: p for p in tx.all("""SELECT * FROM "Product" WHERE id IN %s AND status = 'ACTIVE'""", ids)}
    lines = []
    for item in items:
        product = products.get(item["productId"])
        if not product:
            raise bad_request(f"Product {item['productId']} is not available")
        unit_price = item.get("unitPrice")
        custom = unit_price is not None and D(unit_price) != D(product["sellingPrice"])
        if custom and not has_permission(user, "sales", "approve"):
            raise forbidden(f"You cannot change the price of {product['name']}")
        lines.append({
            "productId": item["productId"], "quantity": D(item["quantity"]),
            "unitPrice": D(unit_price) if custom else product["sellingPrice"],
            "discount": D(item.get("discount")), "taxPercent": product["taxPercent"],
        })
    return lines


def create_sale(tx, data, user):
    customer_id = data.get("customerId")
    godown_id = data.get("godownId")
    if not godown_id:
        raise bad_request("Godown is required")
    godown = tx.get("Godown", godown_id)
    if not godown or godown["status"] != "ACTIVE":
        raise bad_request("Godown is not available")
    if customer_id:
        customer = tx.get("Customer", customer_id)
        if not customer or not customer["isActive"]:
            raise bad_request("Customer is not available")

    totals = compute_totals(price_lines(tx, data["items"], user), data.get("discount"))
    paid = D(data.get("paidAmount"))
    if paid < 0 or paid > totals["totalAmount"]:
        raise bad_request("Amount paid cannot exceed the grand total")
    if not customer_id and paid != totals["totalAmount"]:
        raise bad_request("Select a customer for a sale on credit. Walk-in sales must be paid in full")

    settings = get_settings(tx) or {}
    invoice_number = next_number(tx, settings.get("invoicePrefix") or "BST-INV")
    when = data.get("saleDate") or now()
    money = {k: totals[k] for k in ("subtotal", "discount", "taxAmount", "totalAmount")}

    sale = tx.insert("Sale", {
        "invoiceNumber": invoice_number, "customerId": customer_id or None, "godownId": godown_id, "createdById": user["id"],
        "salespersonId": data.get("salespersonId") or user["id"], "sourceDocumentId": data.get("sourceDocumentId"),
        "saleDate": when, **money, "paidAmount": 0, "balanceAmount": totals["totalAmount"], "status": "CONFIRMED",
        "notes": data.get("notes") or None,
    })
    tx.insert_many("SaleItem", [{**item, "saleId": sale["id"]} for item in totals["items"]])
    due_days = settings.get("dueDays")
    tx.insert("Invoice", {
        "invoiceNumber": invoice_number, "saleId": sale["id"], "customerId": customer_id or None, "invoiceDate": when,
        "dueDate": when + timedelta(days=30 if due_days is None else due_days), **money, "balanceAmount": totals["totalAmount"],
    })

    for item in totals["items"]:
        move_stock(tx, item["productId"], godown_id, -item["quantity"], "OUT", "Sale", sale["id"], f"Sale {invoice_number}", user["id"])
    stock_out = tx.insert("StockOut", {
        "stockOutNo": next_number(tx, "SO"), "godownId": godown_id, "saleId": sale["id"], "reason": "Customer sale", "createdById": user["id"],
    })
    tx.insert_many("StockOutItem", [
        {"stockOutId": stock_out["id"], "productId": i["productId"], "quantity": i["quantity"]} for i in totals["items"]
    ])

    post_customer(tx, customer_id, debit=totals["totalAmount"], reference=invoice_number, description="Sale invoice", date=when)
    if paid > 0:
        record_payment(tx, {
            "direction": "IN", "amount": paid, "method": data.get("method") or "CASH", "transactionId": data.get("transactionId"),
            "paymentDate": when, "customerId": customer_id or None, "saleId": sale["id"], "notes": f"Payment for {invoice_number}",
        }, user["id"])
    return sale


def list_include(store, rows):
    join_one(store, rows, "customer", "Customer", "customerId", "id,name,phone")
    join_one(store, rows, "godown", "Godown", "godownId", "id,name")
    join_one(store, rows, "salesperson", "User", "salespersonId", "id,name")
    join_child(store, rows, "invoice", "Invoice", "saleId", "id")


def lines_with_product(store, rows, table, fk):
    join_many(store, rows, "items", table, fk)
    join_one(store, [i for r in rows for i in r["items"]], "product", "Product", "productId", "name,sku,unit")


@route("/sales", perm=("sales", "read"))
def list_sales():
    where = Where()
    if own_records_only(g.user):
        where.eq("salespersonId", g.user["id"])
    where.search(request.args.get("search"), ["invoiceNumber"], [name_match("Customer", "customerId")])
    if request.args.get("status"):
        where.eq("status", request.args["status"])
    if request.args.get("payment") == "due":
        where.raw('t."balanceAmount" > 0')
    if request.args.get("customerId"):
        where.eq("customerId", query_int(request.args["customerId"]))
    where.range('t."saleDate"', date_range())
    return send_list("Sale", where, "t.id DESC", list_include, "sales")


@route("/sales/<id>", perm=("sales", "read"))
def get_sale(id):
    sale = db.get("Sale", int_param(id))
    if not sale or (own_records_only(g.user) and sale["salespersonId"] != g.user["id"]):
        raise not_found("Sale")
    list_include(db, [sale])
    join_many(db, [sale], "payments", "Payment", "saleId", order="id DESC")
    lines_with_product(db, [sale], "SaleItem", "saleId")
    return reply(sale)


@route("/sales", "POST", perm=("sales", "create"))
def post_sale():
    payload = body()
    data = clean(payload, {
        **HEADER,
        "godownId": integer("Godown", min=1, required=True),
        "saleDate": date("Sale date"),
        "paidAmount": decimal("Amount paid", min=0),
        "method": enum("Payment mode", METHODS),
        "transactionId": string("Reference", max=80),
        "salespersonId": integer("Salesperson", min=1),
    })
    items = clean_items(payload.get("items"))
    with transaction() as tx:
        sale = create_sale(tx, {**data, "items": items}, g.user)
    audit("CREATE", "sales", f"Created sale {sale['invoiceNumber']}", sale["id"])
    return reply(sale, f"Sale {sale['invoiceNumber']} saved", 201)


@route("/sales/<id>/cancel", "POST", perm=("sales", "approve"))
def cancel_sale(id):
    """Cancelling keeps the sale and reverses stock, ledger and payments."""
    sale_id = int_param(id)
    reason = clean(body(), {"reason": string("Reason", min=3, max=300, required=True)})["reason"]
    with transaction() as tx:
        existing = tx.get("Sale", sale_id, lock=True)
        if not existing:
            raise not_found("Sale")
        if existing["status"] == "CANCELLED":
            raise conflict("Sale is already cancelled")
        for payment in tx.all("""SELECT * FROM "Payment" WHERE "saleId" = %s AND status <> 'CANCELLED'""", sale_id):
            reverse_payment(tx, payment, f"Sale cancelled: {reason}")
        if existing["godownId"]:
            for item in tx.all('SELECT * FROM "SaleItem" WHERE "saleId" = %s', sale_id):
                move_stock(tx, item["productId"], existing["godownId"], item["quantity"], "RETURN", "SaleCancel", sale_id,
                           f"Cancelled {existing['invoiceNumber']}", g.user["id"])
        post_customer(tx, existing["customerId"], credit=existing["totalAmount"], reference=existing["invoiceNumber"],
                      description=f"Sale cancelled: {reason}")
        tx.execute("""UPDATE "Invoice" SET status = 'CANCELLED', "balanceAmount" = 0, "updatedAt" = %s WHERE "saleId" = %s""", now(), sale_id)
        sale = tx.update("Sale", sale_id, {"status": "CANCELLED", "balanceAmount": 0, "cancelReason": reason})
    audit("CANCEL", "sales", f"Cancelled sale {sale['invoiceNumber']}: {reason}", sale_id)
    return reply(sale, "Sale cancelled and reversed")


def document_include(store, rows):
    join_one(store, rows, "customer", "Customer", "customerId", "id,name")
    join_one(store, rows, "godown", "Godown", "godownId", "id,name")


@route("/sales-documents", perm=("quotations", "read"))
def list_documents():
    where = Where().search(request.args.get("search"), ["documentNo"])
    if request.args.get("type"):
        where.eq("type", request.args["type"])
    if request.args.get("status"):
        where.eq("status", request.args["status"])
    where.range('t."documentDate"', date_range())
    return send_list("SalesDocument", where, "t.id DESC", document_include, "quotations")


@route("/sales-documents/<id>", perm=("quotations", "read"))
def get_document(id):
    doc = db.get("SalesDocument", int_param(id))
    if not doc:
        raise not_found("Document")
    join_one(db, [doc], "customer", "Customer", "customerId")
    join_one(db, [doc], "godown", "Godown", "godownId", "id,name")
    lines_with_product(db, [doc], "SalesDocumentItem", "documentId")
    return reply(doc)


@route("/sales-documents", "POST", perm=("quotations", "create"))
def create_document():
    payload = body()
    data = clean(payload, {
        **HEADER,
        "customerId": integer("Customer", min=1, required=True),
        "type": enum("Type", ["QUOTATION", "SALES_ORDER"], required=True),
        "documentDate": date("Date"),
        "validUntil": date("Valid until"),
    })
    items = clean_items(payload.get("items"))
    with transaction() as tx:
        totals = compute_totals(price_lines(tx, items, g.user), data.get("discount"))
        doc = tx.insert("SalesDocument", {
            "documentNo": next_number(tx, "QUO" if data["type"] == "QUOTATION" else "ORD"), "type": data["type"],
            "customerId": data["customerId"], "godownId": data.get("godownId"), "documentDate": data.get("documentDate") or now(),
            "validUntil": data.get("validUntil"), "subtotal": totals["subtotal"], "discount": totals["discount"],
            "taxAmount": totals["taxAmount"], "totalAmount": totals["totalAmount"], "notes": data.get("notes") or None,
            "createdById": g.user["id"],
        })
        tx.insert_many("SalesDocumentItem", [{**item, "documentId": doc["id"]} for item in totals["items"]])
    audit("CREATE", "quotations", f"Created {doc['documentNo']}", doc["id"])
    return reply(doc, f"{doc['documentNo']} saved", 201)


@route("/sales-documents/<id>/status", "POST", perm=("quotations", "update"))
def document_status(id):
    doc_id = int_param(id)
    status = clean(body(), {
        "status": enum("Status", ["SENT", "ACCEPTED", "REJECTED", "CANCELLED"], required=True),
    })["status"]
    doc = db.get("SalesDocument", doc_id)
    if not doc:
        raise not_found("Document")
    if doc["status"] not in OPEN:
        raise conflict(f"This document is already {doc['status'].lower()}")
    updated = db.update("SalesDocument", doc_id, {"status": status})
    audit("UPDATE", "quotations", f"{doc['documentNo']} marked {status}", doc_id)
    return reply(updated, f"Marked {status.lower()}")


@route("/sales-documents/<id>/convert", "POST", perm=("sales", "create"))
def convert_document(id):
    doc_id = int_param(id)
    data = clean(body(), {
        "godownId": integer("Godown", min=1),
        "paidAmount": decimal("Amount paid", min=0),
        "method": enum("Payment mode", METHODS),
    })
    with transaction() as tx:
        doc = tx.get("SalesDocument", doc_id, lock=True)
        if not doc:
            raise not_found("Document")
        if doc["status"] not in OPEN:
            raise conflict(f"This document is already {doc['status'].lower()}")
        items = tx.all('SELECT * FROM "SalesDocumentItem" WHERE "documentId" = %s', doc_id)
        sale = create_sale(tx, {
            "customerId": doc["customerId"], "godownId": data.get("godownId") or doc["godownId"], "discount": 0,
            "notes": f"From {doc['documentNo']}", "paidAmount": data.get("paidAmount"), "method": data.get("method"),
            "sourceDocumentId": doc["id"],
            "items": [{"productId": i["productId"], "quantity": i["quantity"], "discount": i["discount"]} for i in items],
        }, g.user)
        tx.update("SalesDocument", doc_id, {"status": "CONVERTED"})
    audit("CREATE", "sales", f"Converted document {doc_id} to sale {sale['invoiceNumber']}", sale["id"])
    return reply(sale, f"Sale {sale['invoiceNumber']} created", 201)
