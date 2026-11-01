"""Products, categories, brands, godowns, customers, suppliers and employees."""
import uuid
from flask import g, request

from ..config import UPLOAD_DIR
from ..db import Where, db, join_many, join_one
from ..errors import AppError, bad_request
from ..services import next_number
from ..validate import boolean, date, decimal, email, enum, gstin, int_param, integer, phone, query_int, string
from ..web import audit, crud, date_range, reply, route, send_list

PRODUCT_STATUS = enum("Status", ["ACTIVE", "INACTIVE"])
MAX_IMAGE_BYTES = 2 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def status_filter(where, value):
    where.eq("status", value)


def active_filter(where, value):
    where.eq("isActive", value == "true")


def dues_filter(where, value):
    where.raw("t.balance > 0")


def drop_nulls(data, *keys):
    for key in keys:
        if key in data and data[key] is None:
            del data[key]
    return data


def counted(column):
    def include(store, rows):
        ids = [r["id"] for r in rows]
        counts = {}
        if ids:
            counts = {
                r["key"]: r["n"]
                for r in store.all(f'SELECT "{column}" AS "key", COUNT(*) AS n FROM "Product" WHERE "{column}" IN %s GROUP BY 1', ids)
            }
        for row in rows:
            row["_count"] = {"products": counts.get(row["id"], 0)}
    return include


NAMED = {
    "name": string("Name", min=2, max=120, required=True),
    "description": string("Description", max=500),
    "status": PRODUCT_STATUS,
}


def named_prepare(tx, data, mode, id):
    return drop_nulls(data, "status")


crud("/categories", "Category", "categories", "Category", NAMED, search=["name"], filters={"status": status_filter},
     order="t.name ASC", soft_delete={"status": "INACTIVE"}, include=counted("categoryId"), prepare=named_prepare)

crud("/brands", "Brand", "brands", "Brand", NAMED, search=["name"], filters={"status": status_filter},
     order="t.name ASC", soft_delete={"status": "INACTIVE"}, include=counted("brandId"), prepare=named_prepare)

crud("/godowns", "Godown", "godowns", "Godown", {
    "name": NAMED["name"],
    "code": string("Code", min=2, max=20, required=True),
    "location": string("Location", max=120),
    "address": string("Address", max=300),
    "managerName": string("Manager", max=120),
    "phone": phone(),
    "capacity": decimal("Capacity", min=0),
    "status": PRODUCT_STATUS,
}, search=["name", "code", "location"], filters={"status": status_filter}, order="t.name ASC",
     soft_delete={"status": "INACTIVE"}, prepare=named_prepare)


def product_include(store, rows):
    join_one(store, rows, "category", "Category", "categoryId", "id,name")
    join_one(store, rows, "brand", "Brand", "brandId", "id,name")
    join_many(store, rows, "stockBalances", "StockBalance", "productId", fields="quantity,godownId")


def product_prepare(tx, data, mode, id):
    drop_nulls(data, "unit", "taxPercent", "reorderLevel", "status")
    if mode == "create":
        data["createdById"] = g.user["id"]
    return data


@route("/products/options", perm=("products", "read"))
def product_options():
    """Only what the product picker needs, because the full list is large."""
    return reply(db.all(
        'SELECT id, name, sku, size, "sellingPrice", "purchasePrice", "taxPercent" FROM "Product" '
        "WHERE status = 'ACTIVE' ORDER BY name ASC"
    ))


@route("/products/<id>/image", "POST", perm=("products", "update"))
def upload_image(id):
    product_id = int_param(id)
    file = request.files.get("image")
    if not file:
        raise bad_request("Choose an image to upload")
    extension = IMAGE_TYPES.get(file.mimetype)
    if not extension:
        raise bad_request("Upload a JPG, PNG or WEBP image")
    content = file.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise AppError(413, "The upload is too large")
    if not db.get("Product", product_id):
        raise AppError(404, "Record not found")
    name = f"{uuid.uuid4()}{extension}"
    (UPLOAD_DIR / name).write_bytes(content)
    product = db.update("Product", product_id, {"imageUrl": f"/uploads/{name}"})
    audit("UPDATE", "products", f"Updated image for {product['name']}", product["id"])
    return reply(product, "Image uploaded")


crud("/products", "Product", "products", "Product", {
    "sku": string("SKU", min=2, max=50, required=True),
    "barcode": string("Barcode", max=60),
    "name": string("Name", min=2, max=160, required=True),
    "description": string("Description", max=1000),
    "categoryId": integer("Category", min=1, required=True),
    "brandId": integer("Brand", min=1),
    "unit": string("Unit", max=20),
    "size": string("Size", max=40),
    "color": string("Colour", max=40),
    "finish": string("Finish", max=40),
    "purchasePrice": decimal("Purchase price", min=0, required=True),
    "sellingPrice": decimal("Selling price", min=0, required=True),
    "taxPercent": decimal("GST %", min=0, max=100),
    "reorderLevel": integer("Minimum stock", min=0),
    "maxStock": integer("Maximum stock", min=0),
    "status": PRODUCT_STATUS,
}, search=["name", "sku", "barcode", "size", "color"], filters={
    "status": status_filter,
    "categoryId": lambda w, v: w.eq("categoryId", query_int(v)),
    "brandId": lambda w, v: w.eq("brandId", query_int(v)),
}, include=product_include, prepare=product_prepare, soft_delete={"status": "INACTIVE"})

PARTY_FIELDS = {
    "name": string("Name", min=2, max=160, required=True),
    "phone": phone(),
    "email": email(),
    "address": string("Billing address", max=400),
    "city": string("City", max=80),
    "state": string("State", max=80),
    "pincode": string("Pincode", max=10),
    "gstNumber": gstin(),
    "isActive": boolean("Active"),
}


def opening_balance(tx, data, mode, prefix, code_field):
    drop_nulls(data, "isActive")
    if mode == "create":
        data[code_field] = next_number(tx, prefix, pad=4, yearly=False)
        data["openingBalance"] = data.get("openingBalance") or 0
        data["balance"] = data["openingBalance"]
    # Opening balance is fixed after creation; later changes go through the ledger.
    if mode == "update":
        data.pop("openingBalance", None)
    return data


def customer_prepare(tx, data, mode, id):
    drop_nulls(data, "creditLimit")
    return opening_balance(tx, data, mode, "CUST", "customerCode")


crud("/customers", "Customer", "customers", "Customer", {
    **PARTY_FIELDS,
    "shippingAddress": string("Shipping address", max=400),
    "creditLimit": decimal("Credit limit", min=0),
    "openingBalance": decimal("Opening balance"),
}, search=["name", "phone", "email", "customerCode", "gstNumber"],
     filters={"active": active_filter, "dues": dues_filter}, soft_delete={"isActive": False}, prepare=customer_prepare)


def supplier_prepare(tx, data, mode, id):
    return opening_balance(tx, data, mode, "SUP", "supplierCode")


crud("/suppliers", "Supplier", "suppliers", "Supplier", {
    **PARTY_FIELDS,
    "contactPerson": string("Contact person", max=120),
    "openingBalance": decimal("Opening balance"),
}, search=["name", "phone", "email", "supplierCode", "gstNumber", "contactPerson"],
     filters={"active": active_filter, "dues": dues_filter}, soft_delete={"isActive": False}, prepare=supplier_prepare)


def ledger(table, module, key, id):
    where = Where().eq(key, int_param(id)).range('t."date"', date_range())
    return send_list(table, where, "t.date DESC, t.id DESC", None, module)


@route("/customers/<id>/ledger", perm=("customers", "read"))
def customer_ledger(id):
    return ledger("CustomerLedger", "customers", "customerId", id)


@route("/suppliers/<id>/ledger", perm=("suppliers", "read"))
def supplier_ledger(id):
    return ledger("SupplierLedger", "suppliers", "supplierId", id)


def employee_prepare(tx, data, mode, id):
    drop_nulls(data, "status")
    if mode == "create":
        data["employeeCode"] = next_number(tx, "EMP", pad=4, yearly=False)
    return data


crud("/employees", "Employee", "employees", "Employee", {
    "name": string("Name", min=2, max=120, required=True),
    "phone": phone(),
    "email": email(),
    "department": string("Department", max=80),
    "designation": string("Designation", max=80),
    "joiningDate": date("Joining date"),
    "salary": decimal("Salary", min=0),
    "status": enum("Status", ["ACTIVE", "INACTIVE", "ON_LEAVE"]),
    "address": string("Address", max=400),
}, search=["name", "employeeCode", "phone", "email", "department", "designation"],
     filters={"status": status_filter, "department": lambda w, v: w.eq("department", v)},
     soft_delete={"status": "INACTIVE"}, prepare=employee_prepare)
