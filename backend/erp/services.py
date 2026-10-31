"""Numbering, stock, ledgers and payments. Every function takes the open transaction."""
from datetime import datetime

from .db import db, now
from .errors import bad_request, conflict, not_found
from .money import D, plain, round2


def next_number(tx, prefix, pad=5, yearly=True):
    """Row-locked counter: two simultaneous sales can never receive the same number."""
    key = f"{prefix}-{datetime.now().year}" if yearly else prefix
    tx.execute(
        'INSERT INTO "DocumentSequence" ("key", "nextValue", "updatedAt") VALUES (%s, 2, %s) '
        'ON DUPLICATE KEY UPDATE "nextValue" = "nextValue" + 1, "updatedAt" = VALUES("updatedAt")',
        key, now(),
    )
    value = tx.value('SELECT "nextValue" FROM "DocumentSequence" WHERE "key" = %s', key)
    return f"{key}-{str(value - 1).zfill(pad)}"


def get_settings(store=db):
    return store.one('SELECT * FROM "ErpSettings" ORDER BY id ASC LIMIT 1')


def move_stock(tx, productId, godownId, delta, type, referenceType, referenceId, notes=None, userId=None):
    """Every stock change goes through here so balance and movement history cannot drift apart.

    The decrement is conditional, so concurrent sales cannot push stock below zero.
    """
    change = D(delta)
    if change >= 0:
        tx.execute(
            'INSERT INTO "StockBalance" ("productId", "godownId", quantity, "updatedAt") VALUES (%s, %s, %s, %s) '
            'ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity), "updatedAt" = VALUES("updatedAt")',
            productId, godownId, change, now(),
        )
    else:
        amount = abs(change)
        count = tx.execute(
            'UPDATE "StockBalance" SET quantity = quantity - %s, "updatedAt" = %s '
            'WHERE "productId" = %s AND "godownId" = %s AND quantity >= %s',
            amount, now(), productId, godownId, amount,
        )
        if count == 0:
            have = tx.value('SELECT quantity FROM "StockBalance" WHERE "productId" = %s AND "godownId" = %s', productId, godownId)
            name = tx.value('SELECT name FROM "Product" WHERE id = %s', productId)
            raise conflict(f"Insufficient stock for {name or f'product {productId}'}. Available: {plain(have)}, required: {plain(amount)}")

    balance = tx.value('SELECT quantity FROM "StockBalance" WHERE "productId" = %s AND "godownId" = %s', productId, godownId)
    return tx.insert("StockMovement", {
        "productId": productId, "godownId": godownId, "type": type, "quantity": abs(change), "delta": change,
        "balanceAfter": balance, "referenceType": referenceType, "referenceId": referenceId, "notes": notes or None,
        "createdById": userId,
    })


def _post(tx, table, ledger, key, party_id, change, debit, credit, kind, reference, description, date):
    if not tx.execute(f'UPDATE "{table}" SET balance = balance + %s, "updatedAt" = %s WHERE id = %s', change, now(), party_id):
        raise not_found("Record")
    balance = tx.value(f'SELECT balance FROM "{table}" WHERE id = %s', party_id)
    return tx.insert(ledger, {
        key: party_id, "date": date or now(), "reference": reference, "description": description, "type": kind,
        "debit": debit, "credit": credit, "balance": balance,
    })


def post_customer(tx, customer_id, debit=0, credit=0, reference=None, description=None, date=None):
    """Customer balance: positive means the customer owes us."""
    if not customer_id:
        return None
    dr, cr = D(debit), D(credit)
    return _post(tx, "Customer", "CustomerLedger", "customerId", customer_id, dr - cr, dr, cr,
                 "DEBIT" if dr > 0 else "CREDIT", reference, description, date)


def post_supplier(tx, supplier_id, debit=0, credit=0, reference=None, description=None, date=None):
    """Supplier balance: positive means we owe the supplier."""
    if not supplier_id:
        return None
    dr, cr = D(debit), D(credit)
    return _post(tx, "Supplier", "SupplierLedger", "supplierId", supplier_id, cr - dr, dr, cr,
                 "CREDIT" if cr > 0 else "DEBIT", reference, description, date)


def _invoice_status(paid, balance):
    return "PAID" if balance <= 0 else "PARTIAL" if paid > 0 else "ISSUED"


def _apply_to_sale(tx, sale_id, amount):
    sale = tx.get("Sale", sale_id, lock=True)
    paid = D(sale["paidAmount"]) + amount
    balance = D(sale["totalAmount"]) - paid
    tx.update("Sale", sale_id, {"paidAmount": paid, "balanceAmount": balance})
    tx.execute(
        'UPDATE "Invoice" SET "paidAmount" = %s, "balanceAmount" = %s, status = %s, "updatedAt" = %s WHERE "saleId" = %s',
        paid, balance, _invoice_status(paid, balance), now(), sale_id,
    )


def _apply_to_purchase(tx, purchase_id, amount):
    purchase = tx.get("Purchase", purchase_id, lock=True)
    paid = D(purchase["paidAmount"]) + amount
    tx.update("Purchase", purchase_id, {"paidAmount": paid, "balanceAmount": D(purchase["totalAmount"]) - paid})


def record_payment(tx, payment, user_id):
    direction = payment["direction"]
    method = payment.get("method") or "CASH"
    transaction_id = payment.get("transactionId")
    notes = payment.get("notes")
    customer_id = payment.get("customerId")
    supplier_id = payment.get("supplierId")
    sale_id = payment.get("saleId")
    purchase_id = payment.get("purchaseId")
    value = round2(payment["amount"])
    if value <= 0:
        raise bad_request("Payment amount must be greater than 0")

    if direction == "IN":
        if sale_id:
            sale = tx.get("Sale", sale_id, lock=True)
            if not sale:
                raise not_found("Sale")
            if sale["status"] == "CANCELLED":
                raise conflict("Cannot pay a cancelled sale")
            if value > D(sale["balanceAmount"]):
                raise bad_request(f"Amount exceeds the balance of {plain(sale['balanceAmount'])}")
            customer_id = customer_id if customer_id is not None else sale["customerId"]
            if sale["customerId"] and customer_id != sale["customerId"]:
                raise bad_request("Sale belongs to a different customer")
        if not customer_id and not sale_id:
            raise bad_request("Select a customer or sale")
    else:
        if purchase_id:
            purchase = tx.get("Purchase", purchase_id, lock=True)
            if not purchase:
                raise not_found("Purchase")
            if purchase["status"] in ("CANCELLED", "DRAFT"):
                raise conflict("This purchase cannot be paid yet")
            if value > D(purchase["balanceAmount"]):
                raise bad_request(f"Amount exceeds the balance of {plain(purchase['balanceAmount'])}")
            supplier_id = supplier_id if supplier_id is not None else purchase["supplierId"]
            if supplier_id != purchase["supplierId"]:
                raise bad_request("Purchase belongs to a different supplier")
        if not supplier_id:
            raise bad_request("Select a supplier")

    number = next_number(tx, "PAY")
    row = tx.insert("Payment", {
        "paymentNumber": number, "direction": direction, "customerId": customer_id, "supplierId": supplier_id,
        "saleId": sale_id, "purchaseId": purchase_id, "amount": value, "method": method, "status": "PAID",
        "transactionId": transaction_id or None, "paymentDate": payment.get("paymentDate") or now(), "notes": notes or None,
        "createdById": user_id,
    })

    if sale_id:
        _apply_to_sale(tx, sale_id, value)
    if purchase_id:
        _apply_to_purchase(tx, purchase_id, value)

    if direction == "IN":
        post_customer(tx, customer_id, credit=value, reference=number, description="Payment received", date=row["paymentDate"])
        if customer_id:
            tx.insert("Receipt", {
                "receiptNumber": next_number(tx, "RCPT"), "customerId": customer_id, "amount": value, "method": method,
                "receiptDate": row["paymentDate"], "reference": transaction_id or number, "notes": notes or None,
                "createdById": user_id, "paymentId": row["id"],
            })
    else:
        post_supplier(tx, supplier_id, debit=value, reference=number, description="Payment made", date=row["paymentDate"])
    return row


def reverse_payment(tx, payment, reason):
    """A cancelled payment stays on record; its effects are reversed by opposite entries."""
    if payment["status"] == "CANCELLED":
        raise conflict("Payment is already cancelled")
    notes = " | ".join(x for x in [payment["notes"], f"Cancelled: {reason}"] if x)
    tx.update("Payment", payment["id"], {"status": "CANCELLED", "notes": notes})
    value = -D(payment["amount"])
    if payment["saleId"]:
        _apply_to_sale(tx, payment["saleId"], value)
    if payment["purchaseId"]:
        _apply_to_purchase(tx, payment["purchaseId"], value)
    entry = {"reference": payment["paymentNumber"], "description": f"Payment cancelled: {reason}"}
    if payment["direction"] == "IN":
        post_customer(tx, payment["customerId"], debit=payment["amount"], **entry)
    else:
        post_supplier(tx, payment["supplierId"], credit=payment["amount"], **entry)
