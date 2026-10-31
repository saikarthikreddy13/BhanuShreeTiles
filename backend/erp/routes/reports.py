import calendar
from datetime import datetime

from flask import g, request

from ..db import Where, db, join_one
from ..errors import forbidden, not_found
from ..permissions import has_permission
from ..web import audit, date_range, reply, route, send_list
from .stock import low_stock_products

LIVE_SALE = "('CONFIRMED', 'COMPLETED')"
LIVE_PURCHASE = "('RECEIVED', 'PARTIAL', 'COMPLETED')"


def n(value):
    return float(value or 0)


def defaults():
    today = datetime.now()
    start = request.args.get("from") or today.replace(day=1).strftime("%Y-%m-%d")
    end = request.args.get("to") or today.strftime("%Y-%m-%d")
    return start, end, date_range({"from": start, "to": end})


def in_range(expression, rng):
    return Where().range(expression, rng)


def and_sql(where):
    return (" AND " + " AND ".join(where.parts)) if where.parts else ""


def profit_and_loss(rng):
    """Cost of goods sold uses each product's average received purchase cost,
    falling back to the product's current purchase price."""
    sold = in_range('s."saleDate"', rng)
    items = db.all(
        'SELECT i."productId", i.quantity, i."totalAmount", i."taxAmount", p."purchasePrice" '
        'FROM "SaleItem" i JOIN "Sale" s ON s.id = i."saleId" JOIN "Product" p ON p.id = i."productId" '
        f"WHERE s.status IN {LIVE_SALE}{and_sql(sold)}",
        *sold.params,
    )
    notes_w = in_range('"noteDate"', rng)
    credit_notes = n(db.value(
        f"""SELECT SUM(amount) AS v FROM "CreditDebitNote" WHERE type = 'CREDIT' AND status = 'ACTIVE'{and_sql(notes_w)}""", *notes_w.params
    ))
    income_w = in_range('"incomeDate"', rng)
    other_income = n(db.value(f'SELECT SUM(amount) AS v FROM "Income" WHERE TRUE{and_sql(income_w)}', *income_w.params))
    expense_w = in_range('"expenseDate"', rng)
    expenses = db.all(
        f"""SELECT category, SUM(amount) AS amount FROM "Expense" WHERE status IN ('APPROVED', 'PAID'){and_sql(expense_w)} GROUP BY category""",
        *expense_w.params,
    )
    payroll_w = in_range('"paidAt"', rng)
    salaries = n(db.value(f"""SELECT SUM("netPay") AS v FROM "Payroll" WHERE status = 'PAID'{and_sql(payroll_w)}""", *payroll_w.params))
    costs = db.all(
        'SELECT i."productId", SUM(i.quantity * i."unitCost") / NULLIF(SUM(i.quantity), 0) AS avg '
        'FROM "PurchaseItem" i JOIN "Purchase" p ON p.id = i."purchaseId" '
        f'WHERE p.status IN {LIVE_PURCHASE} GROUP BY i."productId"'
    )
    average = {c["productId"]: n(c["avg"]) for c in costs}
    revenue = 0.0
    cogs = 0.0
    for item in items:
        revenue += n(item["totalAmount"]) - n(item["taxAmount"])
        cogs += n(item["quantity"]) * average.get(item["productId"], n(item["purchasePrice"]))
    net_revenue = revenue - credit_notes
    expense_total = sum(n(e["amount"]) for e in expenses)
    gross_profit = net_revenue - cogs
    return {
        "revenue": revenue, "creditNotes": credit_notes, "netRevenue": net_revenue, "cogs": cogs, "grossProfit": gross_profit,
        "otherIncome": other_income, "salaries": salaries, "expenseTotal": expense_total,
        "netProfit": gross_profit + other_income - expense_total - salaries,
        "expenses": [{"category": e["category"], "amount": n(e["amount"])} for e in expenses],
    }


def col(key, label, type=None):
    out = {"key": key, "label": label}
    if type:
        out["type"] = type
    return out


def sales_report(rng):
    w = in_range('t."saleDate"', rng)
    rows = db.all(f'SELECT t.* FROM "Sale" t{w.sql} ORDER BY t."saleDate" DESC', *w.params)
    join_one(db, rows, "customer", "Customer", "customerId", "name")
    join_one(db, rows, "salesperson", "User", "salespersonId", "name")
    return {
        "columns": [col("date", "Date", "date"), col("invoice", "Invoice"), col("customer", "Customer"), col("salesperson", "Salesperson"),
                    col("taxable", "Taxable", "money"), col("tax", "GST", "money"), col("total", "Total", "money"), col("paid", "Paid", "money"),
                    col("balance", "Balance", "money"), col("status", "Status")],
        "rows": [{
            "date": s["saleDate"], "invoice": s["invoiceNumber"], "customer": (s["customer"] or {}).get("name") or "Walk-in",
            "salesperson": (s["salesperson"] or {}).get("name") or "", "taxable": n(s["totalAmount"]) - n(s["taxAmount"]), "tax": n(s["taxAmount"]),
            "total": n(s["totalAmount"]), "paid": n(s["paidAmount"]), "balance": n(s["balanceAmount"]), "status": s["status"],
        } for s in rows],
        "totals": ["taxable", "tax", "total", "paid", "balance"],
        "exclude": lambda row: row["status"] == "CANCELLED",
    }


def purchases_report(rng):
    w = in_range('t."purchaseDate"', rng)
    rows = db.all(f'SELECT t.* FROM "Purchase" t{w.sql} ORDER BY t."purchaseDate" DESC', *w.params)
    join_one(db, rows, "supplier", "Supplier", "supplierId", "name")
    return {
        "columns": [col("date", "Date", "date"), col("number", "Purchase"), col("supplier", "Supplier"), col("invoice", "Supplier invoice"),
                    col("tax", "GST", "money"), col("total", "Total", "money"), col("paid", "Paid", "money"), col("balance", "Balance", "money"),
                    col("status", "Status")],
        "rows": [{
            "date": p["purchaseDate"], "number": p["purchaseNumber"], "supplier": p["supplier"]["name"], "invoice": p["supplierInvoiceNo"] or "",
            "tax": n(p["taxAmount"]), "total": n(p["totalAmount"]), "paid": n(p["paidAmount"]), "balance": n(p["balanceAmount"]), "status": p["status"],
        } for p in rows],
        "totals": ["tax", "total", "paid", "balance"],
        "exclude": lambda row: row["status"] in ("CANCELLED", "DRAFT"),
    }


def stock_report(rng):
    rows = db.all(
        'SELECT b.quantity, p.sku, p.name AS product, p."reorderLevel", p."purchasePrice", g.name AS godown '
        'FROM "StockBalance" b JOIN "Product" p ON p.id = b."productId" JOIN "Godown" g ON g.id = b."godownId" ORDER BY p.name ASC'
    )
    return {
        "columns": [col("sku", "SKU"), col("product", "Product"), col("godown", "Godown"), col("quantity", "Quantity", "number"),
                    col("minimum", "Minimum", "number"), col("rate", "Cost", "money"), col("value", "Value", "money")],
        "rows": [{
            "sku": b["sku"], "product": b["product"], "godown": b["godown"], "quantity": n(b["quantity"]), "minimum": b["reorderLevel"],
            "rate": n(b["purchasePrice"]), "value": n(b["quantity"]) * n(b["purchasePrice"]),
        } for b in rows],
        "totals": ["quantity", "value"],
    }


def products_report(rng):
    w = in_range('s."saleDate"', rng)
    rows = db.all(
        'SELECT p.sku, p.name AS product, SUM(i.quantity) AS quantity, SUM(i."totalAmount") AS revenue '
        'FROM "SaleItem" i JOIN "Sale" s ON s.id = i."saleId" JOIN "Product" p ON p.id = i."productId" '
        f"WHERE s.status IN {LIVE_SALE}{and_sql(w)} GROUP BY p.id ORDER BY revenue DESC",
        *w.params,
    )
    return {
        "columns": [col("sku", "SKU"), col("product", "Product"), col("quantity", "Sold", "number"), col("revenue", "Revenue", "money")],
        "rows": [{"sku": r["sku"], "product": r["product"], "quantity": n(r["quantity"]), "revenue": n(r["revenue"])} for r in rows],
        "totals": ["quantity", "revenue"],
    }


def party_totals(rng, table, parent_key, date_column, live):
    w = in_range(f'x."{date_column}"', rng)
    rows = db.all(
        f'SELECT x."{parent_key}" AS id, COUNT(*) AS bills, SUM(x."totalAmount") AS total FROM "{table}" x '
        f'WHERE x.status IN {live}{and_sql(w)} GROUP BY 1',
        *w.params,
    )
    return {r["id"]: r for r in rows}


def customers_report(rng):
    totals = party_totals(rng, "Sale", "customerId", "saleDate", LIVE_SALE)
    return {
        "columns": [col("code", "Code"), col("name", "Customer"), col("phone", "Contact number"), col("bills", "Bills", "number"),
                    col("sales", "Sales", "money"), col("balance", "Outstanding", "money")],
        "rows": [{
            "code": c["customerCode"], "name": c["name"], "phone": c["phone"] or "", "bills": totals.get(c["id"], {}).get("bills", 0),
            "sales": n(totals.get(c["id"], {}).get("total")), "balance": n(c["balance"]),
        } for c in db.all('SELECT * FROM "Customer" ORDER BY name ASC')],
        "totals": ["sales", "balance"],
    }


def suppliers_report(rng):
    totals = party_totals(rng, "Purchase", "supplierId", "purchaseDate", LIVE_PURCHASE)
    return {
        "columns": [col("code", "Code"), col("name", "Supplier"), col("phone", "Contact number"), col("bills", "Bills", "number"),
                    col("purchases", "Purchases", "money"), col("balance", "Payable", "money")],
        "rows": [{
            "code": s["supplierCode"], "name": s["name"], "phone": s["phone"] or "", "bills": totals.get(s["id"], {}).get("bills", 0),
            "purchases": n(totals.get(s["id"], {}).get("total")), "balance": n(s["balance"]),
        } for s in db.all('SELECT * FROM "Supplier" ORDER BY name ASC')],
        "totals": ["purchases", "balance"],
    }


def employees_report(rng):
    return {
        "columns": [col("code", "Code"), col("name", "Employee"), col("department", "Department"), col("designation", "Designation"),
                    col("salary", "Salary", "money"), col("status", "Status")],
        "rows": [{
            "code": e["employeeCode"], "name": e["name"], "department": e["department"] or "", "designation": e["designation"] or "",
            "salary": n(e["salary"]), "status": e["status"],
        } for e in db.all('SELECT * FROM "Employee" ORDER BY name ASC')],
        "totals": ["salary"],
    }


def expenses_report(rng):
    w = in_range('t."expenseDate"', rng)
    rows = db.all(f'SELECT t.* FROM "Expense" t{w.sql} ORDER BY t."expenseDate" DESC', *w.params)
    return {
        "columns": [col("date", "Date", "date"), col("number", "Number"), col("category", "Category"), col("description", "Description"),
                    col("method", "Mode"), col("amount", "Amount", "money"), col("status", "Status")],
        "rows": [{
            "date": e["expenseDate"], "number": e["expenseNumber"], "category": e["category"], "description": e["description"] or "",
            "method": e["method"], "amount": n(e["amount"]), "status": e["status"],
        } for e in rows],
        "totals": ["amount"],
        "exclude": lambda row: row["status"] == "CANCELLED",
    }


def gst_report(rng):
    def group(item_table, parent, fk, date_column, live):
        w = in_range(f'x."{date_column}"', rng)
        return db.all(
            f'SELECT i."taxPercent", SUM(i."totalAmount") AS total, SUM(i."taxAmount") AS tax FROM "{item_table}" i '
            f'JOIN "{parent}" x ON x.id = i."{fk}" WHERE x.status IN {live}{and_sql(w)} GROUP BY i."taxPercent"',
            *w.params,
        )

    sales = group("SaleItem", "Sale", "saleId", "saleDate", LIVE_SALE)
    purchases = group("PurchaseItem", "Purchase", "purchaseId", "purchaseDate", LIVE_PURCHASE)

    def row(kind, r):
        return {"type": kind, "rate": n(r["taxPercent"]), "taxable": n(r["total"]) - n(r["tax"]), "cgst": n(r["tax"]) / 2, "sgst": n(r["tax"]) / 2, "tax": n(r["tax"])}

    output = sum(n(r["tax"]) for r in sales)
    input_tax = sum(n(r["tax"]) for r in purchases)
    return {
        "columns": [col("type", "Type"), col("rate", "GST %", "number"), col("taxable", "Taxable", "money"), col("cgst", "CGST", "money"),
                    col("sgst", "SGST", "money"), col("tax", "Total GST", "money")],
        "rows": [*[row("Output (sales)", r) for r in sales], *[row("Input (purchases)", r) for r in purchases]],
        "summary": {"Output GST": output, "Input GST": input_tax, "Net GST payable": output - input_tax},
    }


def profit_loss_report(rng):
    p = profit_and_loss(rng)

    def line(particular, amount):
        return {"particular": particular, "amount": amount}

    return {
        "columns": [col("particular", "Particular"), col("amount", "Amount", "money")],
        "rows": [
            line("Sales revenue (before GST)", p["revenue"]), line("Less: credit notes", -p["creditNotes"]), line("Net revenue", p["netRevenue"]),
            line("Less: cost of goods sold", -p["cogs"]), line("Gross profit", p["grossProfit"]), line("Other income", p["otherIncome"]),
            *[line(f"Expense: {e['category']}", -e["amount"]) for e in p["expenses"]],
            line("Salaries paid", -p["salaries"]), line("Net profit", p["netProfit"]),
        ],
        "summary": {"Net revenue": p["netRevenue"], "Gross profit": p["grossProfit"], "Net profit": p["netProfit"]},
    }


def payments_report(rng):
    w = in_range('t."paymentDate"', rng)
    rows = db.all(f'SELECT t.* FROM "Payment" t{w.sql} ORDER BY t."paymentDate" DESC', *w.params)
    join_one(db, rows, "customer", "Customer", "customerId", "name")
    join_one(db, rows, "supplier", "Supplier", "supplierId", "name")
    return {
        "columns": [col("date", "Date", "date"), col("number", "Number"), col("direction", "Type"), col("party", "Party"), col("method", "Mode"),
                    col("amount", "Amount", "money"), col("status", "Status")],
        "rows": [{
            "date": p["paymentDate"], "number": p["paymentNumber"], "direction": "Received" if p["direction"] == "IN" else "Paid",
            "party": (p["customer"] or {}).get("name") or (p["supplier"] or {}).get("name") or "Walk-in",
            "method": p["method"], "amount": n(p["amount"]), "status": p["status"],
        } for p in rows],
    }


def outstanding_report(rng):
    customers = db.all('SELECT * FROM "Customer" WHERE balance <> 0 ORDER BY balance DESC')
    suppliers = db.all('SELECT * FROM "Supplier" WHERE balance <> 0 ORDER BY balance DESC')
    return {
        "columns": [col("type", "Type"), col("code", "Code"), col("name", "Name"), col("phone", "Contact number"), col("balance", "Amount due", "money")],
        "rows": [
            *[{"type": "To collect", "code": c["customerCode"], "name": c["name"], "phone": c["phone"] or "", "balance": n(c["balance"])} for c in customers],
            *[{"type": "To pay", "code": s["supplierCode"], "name": s["name"], "phone": s["phone"] or "", "balance": n(s["balance"])} for s in suppliers],
        ],
        "summary": {"To collect from customers": sum(n(c["balance"]) for c in customers), "To pay to suppliers": sum(n(s["balance"]) for s in suppliers)},
    }


REPORTS = {
    "sales": ("sales", sales_report), "purchases": ("purchases", purchases_report), "stock": ("stock", stock_report),
    "products": ("products", products_report), "customers": ("customers", customers_report), "suppliers": ("suppliers", suppliers_report),
    "employees": ("employees", employees_report), "expenses": ("expenses", expenses_report), "gst": ("invoices", gst_report),
    "profit-loss": ("finance", profit_loss_report), "payments": ("payments", payments_report), "outstanding": ("finance", outstanding_report),
}


@route("/reports", perm=("reports", "read"))
def list_reports():
    return reply([key for key, (module, _) in REPORTS.items() if has_permission(g.user, module, "read")])


@route("/reports/<type>", perm=("reports", "read"))
def run_report(type):
    if type not in REPORTS:
        raise not_found("Report")
    module, run = REPORTS[type]
    if not has_permission(g.user, module, "read"):
        raise forbidden()
    exporting = request.args.get("export") == "1"
    if exporting and not has_permission(g.user, "reports", "export"):
        raise forbidden()
    start, end, rng = defaults()
    result = run(rng)
    exclude = result.get("exclude")
    included = [r for r in result["rows"] if not (exclude and exclude(r))]
    summary = result.get("summary") or {}
    for key in result.get("totals") or []:
        label = next(c["label"] for c in result["columns"] if c["key"] == key)
        summary[f"Total {label}"] = sum(n(r[key]) for r in included)
    if exporting:
        audit("EXPORT", "reports", f"Exported {type} report")
    return reply({"columns": result["columns"], "rows": result["rows"], "summary": summary, "from": start, "to": end})


def monthly(table, date_column, live):
    today = datetime.now()
    index = today.year * 12 + today.month - 1 - 11
    start = datetime(index // 12, index % 12 + 1, 1)
    rows = db.all(
        f"""SELECT DATE_FORMAT("{date_column}", '%%Y-%%m') AS month, CAST(SUM("totalAmount") AS DOUBLE) AS total """
        f'FROM "{table}" WHERE "{date_column}" >= %s AND status IN {live} GROUP BY 1 ORDER BY 1',
        start,
    )
    by_month = {r["month"]: r["total"] for r in rows}
    out = []
    for i in range(12):
        year, month = (index + i) // 12, (index + i) % 12 + 1
        key = f"{year}-{month:02d}"
        out.append({"month": key, "label": calendar.month_abbr[month], "total": by_month.get(key, 0)})
    return out


@route("/dashboard", perm=("dashboard", "read"))
def dashboard():
    """Each block is only computed and returned for users allowed to see that data."""
    user = g.user

    def see(module):
        return has_permission(user, module, "read")

    kpis = []
    data = {"kpis": kpis, "recent": [], "charts": {}, "lowStock": []}

    def add(label, value, type="number", link=None):
        kpis.append({"label": label, "value": value, "type": type, "link": link})

    today = datetime.now()
    month_start = datetime(today.year, today.month, 1)
    year = {"gte": datetime(today.year, 1, 1)}

    if see("sales"):
        add("Sales this month", n(db.value(f'SELECT SUM("totalAmount") AS v FROM "Sale" WHERE status IN {LIVE_SALE} AND "saleDate" >= %s', month_start)), "money", "sales.html")
        add("Total sales", n(db.value(f'SELECT SUM("totalAmount") AS v FROM "Sale" WHERE status IN {LIVE_SALE}')), "money", "sales.html")
        data["charts"]["sales"] = monthly("Sale", "saleDate", LIVE_SALE)
    if see("purchases"):
        add("Total purchases", n(db.value(f'SELECT SUM("totalAmount") AS v FROM "Purchase" WHERE status IN {LIVE_PURCHASE}')), "money", "purchases.html")
        data["charts"]["purchases"] = monthly("Purchase", "purchaseDate", LIVE_PURCHASE)
        if has_permission(user, "purchases", "approve"):
            add("Purchases awaiting approval", db.value("""SELECT COUNT(*) AS v FROM "Purchase" WHERE status = 'DRAFT'"""), "number", "purchases.html")
    if see("customers"):
        add("Customers", db.value('SELECT COUNT(*) AS v FROM "Customer" WHERE "isActive"'), "number", "customers.html")
        add("To collect from customers", n(db.value('SELECT SUM(balance) AS v FROM "Customer" WHERE balance > 0')), "money", "outstanding.html")
    if see("suppliers"):
        add("Suppliers", db.value('SELECT COUNT(*) AS v FROM "Supplier" WHERE "isActive"'), "number", "suppliers.html")
        add("To pay to suppliers", n(db.value('SELECT SUM(balance) AS v FROM "Supplier" WHERE balance > 0')), "money", "outstanding.html")
    if see("employees"):
        add("Employees", db.value("""SELECT COUNT(*) AS v FROM "Employee" WHERE status <> 'INACTIVE'"""), "number", "employees.html")
    if see("products"):
        add("Products", db.value("""SELECT COUNT(*) AS v FROM "Product" WHERE status = 'ACTIVE'"""), "number", "products.html")
    if see("stock"):
        value = db.value('SELECT CAST(COALESCE(SUM(b.quantity * p."purchasePrice"), 0) AS DOUBLE) AS v FROM "StockBalance" b JOIN "Product" p ON p.id = b."productId"')
        add("Stock value", value, "money", "stock.html")
        data["lowStock"] = low_stock_products(8)
        add("Low stock items", len(low_stock_products()), "number", "stock.html")
    if see("expenses"):
        total = db.value("""SELECT SUM(amount) AS v FROM "Expense" WHERE status IN ('APPROVED', 'PAID') AND "expenseDate" >= %s""", year["gte"])
        add("Expenses this year", n(total), "money", "expenses.html")
    if see("finance"):
        p = profit_and_loss(year)
        add("Revenue this year", p["netRevenue"], "money", "profit-loss.html")
        add("Gross profit this year", p["grossProfit"], "money", "profit-loss.html")
        add("Net profit this year", p["netProfit"], "money", "profit-loss.html")
    if see("sales"):
        recent = db.all('SELECT * FROM "Sale" ORDER BY id DESC LIMIT 8')
        join_one(db, recent, "customer", "Customer", "customerId", "name")
        data["recent"] += [{
            "type": "Sale", "date": s["saleDate"], "reference": s["invoiceNumber"], "party": (s["customer"] or {}).get("name") or "Walk-in",
            "amount": n(s["totalAmount"]), "status": s["status"],
        } for s in recent]
    if see("purchases"):
        recent = db.all('SELECT * FROM "Purchase" ORDER BY id DESC LIMIT 8')
        join_one(db, recent, "supplier", "Supplier", "supplierId", "name")
        data["recent"] += [{
            "type": "Purchase", "date": p["purchaseDate"], "reference": p["purchaseNumber"], "party": p["supplier"]["name"],
            "amount": n(p["totalAmount"]), "status": p["status"],
        } for p in recent]
    data["recent"] = sorted(data["recent"], key=lambda r: r["date"], reverse=True)[:10]
    return reply(data)


@route("/notifications")
def notifications():
    """Worked out live, so an alert disappears as soon as the problem is fixed."""
    def see(module, action="read"):
        return has_permission(g.user, module, action)

    items = []
    if see("stock"):
        for p in low_stock_products(5):
            items.append({"type": "stock", "title": "Low stock", "message": f"{p['name']}: {p['quantity']:g} left", "link": "stock.html"})
    if see("invoices"):
        overdue = db.value("""SELECT COUNT(*) AS v FROM "Invoice" WHERE status IN ('ISSUED', 'PARTIAL') AND "dueDate" < UTC_TIMESTAMP()""")
        if overdue:
            items.append({"type": "invoice", "title": "Overdue invoices", "message": f"{overdue} invoice(s) past due", "link": "outstanding.html"})
    for module, table, status, kind, text, link in [
        ("purchases", "Purchase", "DRAFT", "purchase", "purchase(s) awaiting approval", "purchases.html"),
        ("expenses", "Expense", "PENDING", "expense", "expense(s) awaiting approval", "expenses.html"),
        ("leave", "LeaveRequest", "PENDING", "leave", "leave request(s) pending", "leave.html"),
    ]:
        if see(module, "approve"):
            pending = db.value(f'SELECT COUNT(*) AS v FROM "{table}" WHERE status = %s', status)
            if pending:
                items.append({"type": kind, "title": "Approvals", "message": f"{pending} {text}", "link": link})
    return reply(items)
