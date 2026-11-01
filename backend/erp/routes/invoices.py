from io import BytesIO

from flask import Response, g, request
from xml.sax.saxutils import escape

from ..db import Where, db, join_many, join_one, name_match, now
from ..errors import not_found
from ..money import D, plain
from ..permissions import own_records_only
from ..services import get_settings
from ..validate import int_param
from ..web import audit, date_range, reply, route, send_list


def scoped(where):
    if own_records_only(g.user):
        where.raw('EXISTS (SELECT 1 FROM "Sale" s WHERE s.id = t."saleId" AND s."salespersonId" = %s)', g.user["id"])
    return where


def with_overdue(invoice):
    invoice["overdue"] = invoice["status"] in ("ISSUED", "PARTIAL") and bool(invoice["dueDate"] and invoice["dueDate"] < now())
    return invoice


def list_include(store, rows):
    join_one(store, rows, "customer", "Customer", "customerId", "id,name,phone")
    for row in rows:
        with_overdue(row)


@route("/invoices", perm=("invoices", "read"))
def list_invoices():
    where = scoped(Where()).search(request.args.get("search"), ["invoiceNumber"], [name_match("Customer", "customerId")])
    if request.args.get("status"):
        where.eq("status", request.args["status"])
    if request.args.get("outstanding") == "1":
        where.raw('t."balanceAmount" > 0')
    where.range('t."invoiceDate"', date_range())
    return send_list("Invoice", where, "t.id DESC", list_include, "invoices")


def load_invoice(id):
    where = scoped(Where().eq("id", int_param(id)))
    invoice = db.one(f'SELECT t.* FROM "Invoice" t{where.sql}', *where.params)
    if not invoice:
        raise not_found("Invoice")
    join_one(db, [invoice], "customer", "Customer", "customerId")
    join_one(db, [invoice], "sale", "Sale", "saleId")
    sale = invoice["sale"]
    join_one(db, [sale], "godown", "Godown", "godownId", "name")
    join_one(db, [sale], "salesperson", "User", "salespersonId", "name")
    join_many(db, [sale], "items", "SaleItem", "saleId")
    join_one(db, sale["items"], "product", "Product", "productId", "name,sku,unit,size")
    join_many(db, [sale], "payments", "Payment", "saleId", where="AND status <> 'CANCELLED'")
    return invoice


@route("/invoices/<id>", perm=("invoices", "read"))
def get_invoice(id):
    return reply(with_overdue(load_invoice(id)))


def rupees(value):
    """Indian digit grouping: 1,23,456.00"""
    number = f"{abs(D(value)):.2f}"
    whole, cents = number.split(".")
    head, tail = whole[:-3], whole[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    grouped = ",".join([*groups, tail])
    return f"{'-' if D(value) < 0 else ''}Rs. {grouped}.{cents}"


def short_date(value):
    return f"{value.day}/{value.month}/{value.year}"


@route("/invoices/<id>/pdf", perm=("invoices", "print"))
def invoice_pdf(id):
    # Loaded here because the PDF library is slow to import and only this route uses it.
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    invoice = load_invoice(id)
    company = get_settings() or {}
    base = ParagraphStyle("base", fontName="Helvetica", fontSize=9, leading=12)
    right = ParagraphStyle("right", parent=base, alignment=TA_RIGHT)
    bold_right = ParagraphStyle("boldRight", parent=right, fontName="Helvetica-Bold")
    text = lambda value, style=base: Paragraph(escape(str(value)), style)  # noqa: E731

    story = [Paragraph(escape(company.get("companyName") or "Bhanu Shree Tiles"), ParagraphStyle("h", parent=base, fontSize=18, leading=22))]
    for line in [company.get("address"), "  |  ".join(x for x in [company.get("phone"), company.get("email")] if x)]:
        if line:
            story.append(text(line))
    if company.get("gstin"):
        story.append(text(f"GSTIN: {company['gstin']}"))
    story += [Spacer(1, 10), Paragraph("TAX INVOICE", ParagraphStyle("t", parent=right, fontSize=14, leading=18))]
    story += [text(f"Invoice: {invoice['invoiceNumber']}", right), text(f"Date: {short_date(invoice['invoiceDate'])}", right)]
    if invoice["dueDate"]:
        story.append(text(f"Due: {short_date(invoice['dueDate'])}", right))

    customer = invoice["customer"] or {}
    story += [Spacer(1, 10), Paragraph(escape(f"Bill to: {customer.get('name') or 'Walk-in customer'}"), ParagraphStyle("b", parent=base, fontSize=10))]
    if customer.get("address"):
        story.append(text(customer["address"]))
    if customer.get("phone"):
        story.append(text(f"Phone: {customer['phone']}"))
    if customer.get("gstNumber"):
        story.append(text(f"GSTIN: {customer['gstNumber']}"))
    story.append(Spacer(1, 10))

    rows = [["Item", "Qty", "Rate", "Disc", "GST", "Total"]]
    for item in invoice["sale"]["items"]:
        rows.append([
            text(item["product"]["name"]), plain(item["quantity"]), f"{D(item['unitPrice']):.2f}", f"{D(item['discount']):.2f}",
            f"{D(item['taxAmount']):.2f}", f"{D(item['totalAmount']):.2f}",
        ])
    table = Table(rows, colWidths=[210, 50, 70, 60, 55, 70], repeatRows=1)
    table.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story += [table, Spacer(1, 12)]

    half = D(invoice["taxAmount"]) / 2
    for label, value, style in [
        ("Subtotal", invoice["subtotal"], right), ("Discount", invoice["discount"], right), ("CGST", half, right), ("SGST", half, right),
        ("Grand total", invoice["totalAmount"], bold_right), ("Paid", invoice["paidAmount"], right), ("Balance", invoice["balanceAmount"], right),
    ]:
        story.append(text(f"{label}: {rupees(value)}", style))
    if company.get("invoiceFooter"):
        story += [Spacer(1, 12), text(company["invoiceFooter"], ParagraphStyle("c", parent=base, alignment=TA_CENTER))]

    buffer = BytesIO()
    SimpleDocTemplate(buffer, pagesize=A4, leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40).build(story)
    audit("EXPORT", "invoices", f"Downloaded PDF {invoice['invoiceNumber']}", invoice["id"])
    return Response(buffer.getvalue(), headers={
        "Content-Type": "application/pdf",
        "Content-Disposition": f'attachment; filename="{invoice["invoiceNumber"]}.pdf"',
    })
