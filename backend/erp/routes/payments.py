from flask import g, request

from ..db import Where, db, join_child, join_one, transaction
from ..errors import forbidden, not_found
from ..money import plain
from ..permissions import own_records_only
from ..services import record_payment, reverse_payment
from ..validate import clean, date, decimal, enum, int_param, integer, query_int, string
from ..web import audit, body, date_range, reply, route, send_list
from .sales import METHODS


def list_include(store, rows):
    join_one(store, rows, "customer", "Customer", "customerId", "id,name")
    join_one(store, rows, "supplier", "Supplier", "supplierId", "id,name")
    join_one(store, rows, "sale", "Sale", "saleId", "id,invoiceNumber")
    join_one(store, rows, "purchase", "Purchase", "purchaseId", "id,purchaseNumber")
    join_child(store, rows, "receipt", "Receipt", "paymentId", "id,receiptNumber")


@route("/payments", perm=("payments", "read"))
def list_payments():
    where = Where().search(request.args.get("search"), ["paymentNumber", "transactionId"])
    for key in ("direction", "method", "status"):
        if request.args.get(key):
            where.eq(key, request.args[key])
    for key in ("customerId", "supplierId"):
        if request.args.get(key):
            where.eq(key, query_int(request.args[key]))
    if own_records_only(g.user):
        where.eq("createdById", g.user["id"])
    where.range('t."paymentDate"', date_range())
    return send_list("Payment", where, "t.id DESC", list_include, "payments")


@route("/payments/<id>", perm=("payments", "read"))
def get_payment(id):
    payment = db.get("Payment", int_param(id))
    if not payment:
        raise not_found("Payment")
    join_one(db, [payment], "customer", "Customer", "customerId")
    join_one(db, [payment], "supplier", "Supplier", "supplierId")
    join_one(db, [payment], "sale", "Sale", "saleId")
    join_one(db, [payment], "purchase", "Purchase", "purchaseId")
    join_child(db, [payment], "receipt", "Receipt", "paymentId")
    return reply(payment)


@route("/payments", "POST", perm=("payments", "create"))
def create_payment():
    data = clean(body(), {
        "direction": enum("Direction", ["IN", "OUT"], required=True),
        "customerId": integer("Customer", min=1),
        "supplierId": integer("Supplier", min=1),
        "saleId": integer("Sale", min=1),
        "purchaseId": integer("Purchase", min=1),
        "amount": decimal("Amount", min=0.01, required=True),
        "method": enum("Payment mode", METHODS, required=True),
        "transactionId": string("Reference", max=80),
        "paymentDate": date("Date"),
        "notes": string("Notes", max=300),
    })
    if data["direction"] == "OUT" and own_records_only(g.user):
        raise forbidden()
    with transaction() as tx:
        payment = record_payment(tx, data, g.user["id"])
    audit("PAYMENT", "payments", f"Recorded {payment['paymentNumber']} for {plain(payment['amount'])}", payment["id"])
    return reply(payment, f"{payment['paymentNumber']} saved", 201)


@route("/payments/<id>/cancel", "POST", perm=("payments", "approve"))
def cancel_payment(id):
    """Payments are financial records: they are cancelled and reversed, never deleted."""
    payment_id = int_param(id)
    reason = clean(body(), {"reason": string("Reason", min=3, max=300, required=True)})["reason"]
    with transaction() as tx:
        payment = tx.get("Payment", payment_id, lock=True)
        if not payment:
            raise not_found("Payment")
        reverse_payment(tx, payment, reason)
    audit("CANCEL", "payments", f"Cancelled {payment['paymentNumber']}: {reason}", payment_id)
    return reply(message="Payment cancelled and reversed")


def receipt_include(store, rows):
    join_one(store, rows, "customer", "Customer", "customerId", "id,name")
    join_one(store, rows, "payment", "Payment", "paymentId", "status")


@route("/receipts", perm=("receipts", "read"))
def list_receipts():
    where = Where().search(request.args.get("search"), ["receiptNumber", "reference"])
    if request.args.get("customerId"):
        where.eq("customerId", query_int(request.args["customerId"]))
    where.range('t."receiptDate"', date_range())
    return send_list("Receipt", where, "t.id DESC", receipt_include, "receipts")


@route("/receipts/<id>", perm=("receipts", "read"))
def get_receipt(id):
    receipt = db.get("Receipt", int_param(id))
    if not receipt:
        raise not_found("Receipt")
    join_one(db, [receipt], "customer", "Customer", "customerId")
    join_one(db, [receipt], "payment", "Payment", "paymentId")
    if receipt["payment"]:
        join_one(db, [receipt["payment"]], "sale", "Sale", "saleId", "invoiceNumber")
    return reply(receipt)
