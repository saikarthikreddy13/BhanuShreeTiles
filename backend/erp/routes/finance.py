"""Expenses, income, cash/bank book, employees' attendance, leave and payroll."""
import calendar
from datetime import datetime, timedelta, timezone
from math import ceil

from flask import g, jsonify, request

from ..db import Where, db, join_one, now, transaction
from ..errors import bad_request, conflict, not_found
from ..money import D, round2
from ..services import next_number
from ..validate import clean, date, decimal, enum, int_param, integer, parse_date, query_int, string
from ..web import audit, body, crud, date_range, page_params, reply, route
from .sales import METHODS

METHOD = enum("Payment mode", METHODS, required=True)
ATTENDANCE = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "HOLIDAY"]
EMPLOYEE_FIELDS = "id,name,employeeCode,department"


def set_expense_status(id, allowed, to, action):
    expense_id = int_param(id)
    expense = db.get("Expense", expense_id)
    if not expense:
        raise not_found("Expense")
    if expense["status"] not in allowed:
        raise conflict(f"This expense is already {expense['status'].lower()}")
    data = {"status": to}
    if to == "APPROVED":
        data["approvedById"] = g.user["id"]
    updated = db.update("Expense", expense_id, data)
    audit(action, "expenses", f"Expense {expense['expenseNumber']} {to.lower()}", expense_id)
    return reply(updated, f"Expense {to.lower()}")


@route("/expenses/<id>/approve", "POST", perm=("expenses", "approve"))
def approve_expense(id):
    return set_expense_status(id, ["PENDING"], "APPROVED", "APPROVE")


@route("/expenses/<id>/reject", "POST", perm=("expenses", "reject"))
def reject_expense(id):
    return set_expense_status(id, ["PENDING"], "CANCELLED", "REJECT")


@route("/expenses/<id>/pay", "POST", perm=("expenses", "approve"))
def pay_expense(id):
    return set_expense_status(id, ["APPROVED"], "PAID", "PAYMENT")


def expense_prepare(tx, data, mode, id):
    if mode == "create":
        data["expenseNumber"] = next_number(tx, "EXP")
        data["createdById"] = g.user["id"]
    else:
        existing = tx.get("Expense", id)
        if not existing:
            raise not_found("Expense")
        if existing["status"] != "PENDING":
            raise conflict("Only pending expenses can be edited")
    return data


def expense_include(store, rows):
    join_one(store, rows, "createdBy", "User", "createdById", "name")
    join_one(store, rows, "approvedBy", "User", "approvedById", "name")


crud("/expenses", "Expense", "expenses", "Expense", {
    "category": string("Category", min=2, max=80, required=True),
    "description": string("Description", max=300),
    "amount": decimal("Amount", min=0.01, required=True),
    "method": METHOD,
    "expenseDate": date("Date"),
}, search=["expenseNumber", "category", "description"], date_field="expenseDate", filters={
    "status": lambda w, v: w.eq("status", v), "category": lambda w, v: w.eq("category", v),
}, describe=lambda r: r["expenseNumber"], no_delete=True, include=expense_include, prepare=expense_prepare)


def income_prepare(tx, data, mode, id):
    if mode == "create":
        data["incomeNumber"] = next_number(tx, "INC")
        data["createdById"] = g.user["id"]
    return data


crud("/income", "Income", "income", "Income", {
    "source": string("Source", min=2, max=120, required=True),
    "description": string("Description", max=300),
    "amount": decimal("Amount", min=0.01, required=True),
    "method": METHOD,
    "incomeDate": date("Date"),
}, search=["incomeNumber", "source", "description"], date_field="incomeDate", describe=lambda r: r["incomeNumber"],
     no_delete=True, include=lambda store, rows: join_one(store, rows, "createdBy", "User", "createdById", "name"), prepare=income_prepare)


@route("/finance/cashbook", perm=("finance", "read"))
def cashbook():
    """Combined cash and bank book built from the source records, so it can never disagree with them."""
    rng = date_range()
    account = request.args.get("account")

    def source(table, date_column, first, *params):
        where = Where().raw(first, *params) if first else Where()
        if account == "cash":
            where.raw("t.method = 'CASH'")
        elif account == "bank":
            where.raw("t.method <> 'CASH'")
        where.range(f't."{date_column}"', rng)
        return db.all(f'SELECT t.* FROM "{table}" t{where.sql}', *where.params)

    payments = source("Payment", "paymentDate", "t.status <> 'CANCELLED'" + ("" if account in ("cash", "bank") else " AND t.method <> 'CREDIT'"))
    join_one(db, payments, "customer", "Customer", "customerId", "name")
    join_one(db, payments, "supplier", "Supplier", "supplierId", "name")
    expenses = source("Expense", "expenseDate", "t.status = 'PAID'")
    income = source("Income", "incomeDate", "")
    payroll = source("Payroll", "paidAt", "t.status = 'PAID'")
    join_one(db, payroll, "employee", "Employee", "employeeId", "name")

    rows = []
    for p in payments:
        received = p["direction"] == "IN"
        party = (p["customer"] or {}).get("name") or "walk-in" if received else (p["supplier"] or {}).get("name") or ""
        rows.append({
            "date": p["paymentDate"], "reference": p["paymentNumber"], "method": p["method"],
            "description": f"Received from {party}" if received else f"Paid to {party}",
            "inflow": float(p["amount"]) if received else 0, "outflow": 0 if received else float(p["amount"]),
        })
    for e in expenses:
        rows.append({"date": e["expenseDate"], "reference": e["expenseNumber"], "method": e["method"],
                     "description": f"Expense: {e['category']}", "inflow": 0, "outflow": float(e["amount"])})
    for i in income:
        rows.append({"date": i["incomeDate"], "reference": i["incomeNumber"], "method": i["method"],
                     "description": f"Income: {i['source']}", "inflow": float(i["amount"]), "outflow": 0})
    for p in payroll:
        rows.append({"date": p["paidAt"], "reference": f"PAYROLL-{p['year']}-{p['month']}", "method": p["method"],
                     "description": f"Salary: {p['employee']['name']}", "inflow": 0, "outflow": float(p["netPay"])})
    rows.sort(key=lambda r: r["date"], reverse=True)

    total_in = sum(r["inflow"] for r in rows)
    total_out = sum(r["outflow"] for r in rows)
    page, limit, skip = page_params()
    return jsonify({
        "success": True,
        "data": rows if request.args.get("export") == "1" else rows[skip:skip + limit],
        "summary": {"totalIn": total_in, "totalOut": total_out, "net": total_in - total_out},
        "pagination": {"page": page, "limit": limit, "total": len(rows), "pages": max(ceil(len(rows) / limit), 1)},
    })


def employee_include(store, rows):
    join_one(store, rows, "employee", "Employee", "employeeId", EMPLOYEE_FIELDS)


def save_attendance(store, employee_id, day, status, check_in=None, check_out=None, notes=None):
    store.execute(
        'INSERT INTO "Attendance" ("employeeId", date, status, "checkIn", "checkOut", notes, "updatedAt") VALUES (%s, %s, %s, %s, %s, %s, %s) '
        'ON DUPLICATE KEY UPDATE status = VALUES(status), "checkIn" = COALESCE(VALUES("checkIn"), "checkIn"), '
        '"checkOut" = COALESCE(VALUES("checkOut"), "checkOut"), notes = COALESCE(VALUES(notes), notes), '
        '"updatedAt" = VALUES("updatedAt")',
        employee_id, day, status, check_in, check_out, notes, now(),
    )


@route("/attendance/day", perm=("attendance", "read"))
def attendance_day():
    text = request.args.get("date") or datetime.now(timezone.utc).date().isoformat()
    try:
        day = parse_date(text).date()
    except ValueError:
        raise bad_request("Invalid date") from None
    employees = db.all(
        """SELECT id, name, "employeeCode", department FROM "Employee" WHERE status <> 'INACTIVE' ORDER BY name ASC"""
    )
    marks = {m["employeeId"]: m for m in db.all('SELECT * FROM "Attendance" WHERE date = %s', day)}
    return reply([{**e, "attendance": marks.get(e["id"])} for e in employees])


@route("/attendance/bulk", "POST", perm=("attendance", "create"))
def attendance_bulk():
    payload = body()
    day = clean(payload, {"date": date("Date", required=True)})["date"].date()
    rows = payload.get("rows")
    if not isinstance(rows, list) or not rows:
        raise bad_request("No attendance to save")
    cleaned = [clean(r, {
        "employeeId": integer("Employee", min=1, required=True),
        "status": enum("Status", ATTENDANCE, required=True),
        "checkIn": string("Check in", max=10),
        "checkOut": string("Check out", max=10),
        "notes": string("Notes", max=200),
    }) for r in rows]
    with transaction() as tx:
        for r in cleaned:
            save_attendance(tx, r["employeeId"], day, r["status"], r.get("checkIn"), r.get("checkOut"), r.get("notes"))
    audit("UPDATE", "attendance", f"Saved attendance for {len(cleaned)} employees")
    return reply(message="Attendance saved")


def attendance_prepare(tx, data, mode, id):
    if data.get("date"):
        data["date"] = data["date"].date()
    return data


crud("/attendance", "Attendance", "attendance", "Attendance", {
    "employeeId": integer("Employee", min=1, required=True),
    "date": date("Date", required=True),
    "status": enum("Status", ATTENDANCE, required=True),
}, date_field="date", filters={
    "employeeId": lambda w, v: w.eq("employeeId", query_int(v)), "status": lambda w, v: w.eq("status", v),
}, order="t.date DESC", include=employee_include, no_delete=True, prepare=attendance_prepare)


def decide_leave(id, status, action):
    leave_id = int_param(id)
    with transaction() as tx:
        existing = tx.get("LeaveRequest", leave_id, lock=True)
        if not existing:
            raise not_found("Leave request")
        if existing["status"] != "PENDING":
            raise conflict(f"Request is already {existing['status'].lower()}")
        if status == "APPROVED":
            day = existing["fromDate"]
            while day <= existing["toDate"]:
                save_attendance(tx, existing["employeeId"], day, "LEAVE")
                day += timedelta(days=1)
        leave = tx.update("LeaveRequest", leave_id, {"status": status, "approvedById": g.user["id"], "decidedAt": now()})
    audit(action, "leave", f"Leave request {leave_id} {status.lower()}", leave_id)
    return reply(leave, f"Leave {status.lower()}")


@route("/leave/<id>/approve", "POST", perm=("leave", "approve"))
def approve_leave(id):
    return decide_leave(id, "APPROVED", "APPROVE")


@route("/leave/<id>/reject", "POST", perm=("leave", "reject"))
def reject_leave(id):
    return decide_leave(id, "REJECTED", "REJECT")


def leave_prepare(tx, data, mode, id):
    existing = tx.get("LeaveRequest", id) if mode == "update" else {}
    if existing is None:
        raise not_found("Leave request")
    start = data["fromDate"].date() if data.get("fromDate") else existing["fromDate"]
    end = data["toDate"].date() if data.get("toDate") else existing["toDate"]
    if end < start:
        raise bad_request("To date cannot be before from date")
    data.update(fromDate=start, toDate=end, days=(end - start).days + 1)
    return data


def leave_include(store, rows):
    employee_include(store, rows)
    join_one(store, rows, "approvedBy", "User", "approvedById", "name")


crud("/leave", "LeaveRequest", "leave", "Leave request", {
    "employeeId": integer("Employee", min=1, required=True),
    "leaveType": string("Leave type", max=40, required=True),
    "fromDate": date("From", required=True),
    "toDate": date("To", required=True),
    "reason": string("Reason", max=300),
}, search=["leaveType", "reason"], filters={
    "status": lambda w, v: w.eq("status", v), "employeeId": lambda w, v: w.eq("employeeId", query_int(v)),
}, include=leave_include, no_delete=True, describe=lambda r: r["id"], prepare=leave_prepare)


@route("/payroll/generate", "POST", perm=("payroll", "create"))
def generate_payroll():
    """Pay for a month is salary minus a day's pay per absent day (half for a half day)."""
    data = clean(body(), {
        "month": integer("Month", min=1, max=12, required=True),
        "year": integer("Year", min=2000, max=2100, required=True),
    })
    month, year = data["month"], data["year"]
    days_in_month = calendar.monthrange(year, month)[1]
    start = datetime(year, month, 1).date()
    end = datetime(year, month, days_in_month).date()
    employees = db.all("""SELECT * FROM "Employee" WHERE status <> 'INACTIVE' AND salary > 0""")
    marks = db.all(
        """SELECT * FROM "Attendance" WHERE date >= %s AND date <= %s AND status IN ('ABSENT', 'HALF_DAY')""", start, end
    )
    created = 0
    with transaction() as tx:
        for employee in employees:
            missed = sum(1 if m["status"] == "ABSENT" else D("0.5") for m in marks if m["employeeId"] == employee["id"])
            basic = D(employee["salary"])
            deductions = round2(basic / days_in_month * missed)
            if tx.value('SELECT id FROM "Payroll" WHERE "employeeId" = %s AND month = %s AND year = %s', employee["id"], month, year):
                continue
            tx.insert("Payroll", {
                "employeeId": employee["id"], "month": month, "year": year, "basic": basic, "deductions": deductions,
                "netPay": basic - deductions,
            })
            created += 1
    audit("CREATE", "payroll", f"Generated payroll for {month}/{year}: {created} employees")
    return reply({"created": created}, f"Payroll created for {created} employee(s)", 201)


def payroll_step(id, allowed, to, action):
    payroll_id = int_param(id)
    row = db.get("Payroll", payroll_id)
    if not row:
        raise not_found("Payroll")
    if row["status"] not in allowed:
        raise conflict(f"This payroll is already {row['status'].lower()}")
    data = {"status": to}
    if to == "PAID":
        data["paidAt"] = now()
    updated = db.update("Payroll", payroll_id, data)
    audit(action, "payroll", f"Payroll {payroll_id} {to.lower()}", payroll_id)
    return reply(updated, f"Payroll {to.lower()}")


@route("/payroll/<id>/approve", "POST", perm=("payroll", "approve"))
def approve_payroll(id):
    return payroll_step(id, ["DRAFT"], "APPROVED", "APPROVE")


@route("/payroll/<id>/pay", "POST", perm=("payroll", "approve"))
def pay_payroll(id):
    return payroll_step(id, ["APPROVED"], "PAID", "PAYMENT")


@route("/payroll/<id>/reject", "POST", perm=("payroll", "reject"))
def reject_payroll(id):
    return payroll_step(id, ["DRAFT", "APPROVED"], "CANCELLED", "REJECT")


def payroll_prepare(tx, data, mode, id):
    if mode == "create":
        raise bad_request("Use Generate to create payroll")
    row = tx.get("Payroll", id)
    if not row:
        raise not_found("Payroll")
    if row["status"] != "DRAFT":
        raise conflict("Only draft payroll can be edited")
    allowances = data.get("allowances") if data.get("allowances") is not None else row["allowances"]
    deductions = data.get("deductions") if data.get("deductions") is not None else row["deductions"]
    data.update(allowances=allowances, deductions=deductions, netPay=D(row["basic"]) + D(allowances) - D(deductions))
    if "method" in data and data["method"] is None:
        del data["method"]
    return data


crud("/payroll", "Payroll", "payroll", "Payroll", {
    "allowances": decimal("Allowances", min=0),
    "deductions": decimal("Deductions", min=0),
    "method": enum("Payment mode", METHODS),
    "notes": string("Notes", max=300),
}, filters={
    "month": lambda w, v: w.eq("month", query_int(v)), "year": lambda w, v: w.eq("year", query_int(v)),
    "status": lambda w, v: w.eq("status", v),
}, include=employee_include, no_delete=True, order="t.year DESC, t.month DESC, t.id ASC", prepare=payroll_prepare)
