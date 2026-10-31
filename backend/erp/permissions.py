ACTIONS = ["create", "read", "update", "delete", "approve", "reject", "export", "print"]

ACTION_COLUMNS = {
    "create": "canCreate",
    "read": "canView",
    "update": "canUpdate",
    "delete": "canDelete",
    "approve": "canApprove",
    "reject": "canReject",
    "export": "canExport",
    "print": "canPrint",
}

MODULES = [
    ("dashboard", "Dashboard"),
    ("users", "Users"),
    ("roles", "Roles & Permissions"),
    ("products", "Products"),
    ("categories", "Categories"),
    ("brands", "Brands"),
    ("godowns", "Godowns"),
    ("stock", "Stock"),
    ("customers", "Customers"),
    ("suppliers", "Suppliers"),
    ("sales", "Sales"),
    ("quotations", "Quotations & Sales Orders"),
    ("invoices", "Invoices"),
    ("purchases", "Purchases"),
    ("purchase_orders", "Purchase Orders"),
    ("payments", "Payments"),
    ("receipts", "Receipts"),
    ("expenses", "Expenses"),
    ("income", "Income"),
    ("finance", "Cash & Bank, P&L"),
    ("employees", "Employees"),
    ("attendance", "Attendance"),
    ("leave", "Leave"),
    ("payroll", "Payroll"),
    ("reports", "Reports"),
    ("settings", "Settings"),
    ("backup", "Backup"),
]

R = ["read"]
RE = ["read", "export", "print"]
CRU = ["create", "read", "update", "export", "print"]
FULL = ["create", "read", "update", "delete", "export", "print"]
DECIDE = [*FULL, "approve", "reject"]


def _all(actions, exclude=()):
    return {m: actions for m, _ in MODULES if m not in exclude}


# Starting templates only. The seed never overwrites a role that already has permissions,
# so changes made in the permission matrix survive.
ROLE_TEMPLATES = {
    "SUPER_ADMIN": {"description": "Head of the business: complete access to the ERP", "perms": _all(ACTIONS)},
    "ADMIN": {
        "description": "Deputy head: runs sales, purchasing, stock and staff, and sees the accounts",
        "perms": {
            "dashboard": R, "sales": DECIDE, "quotations": DECIDE, "invoices": RE, "purchases": DECIDE, "purchase_orders": DECIDE,
            "customers": CRU, "suppliers": CRU, "products": CRU, "categories": CRU, "brands": CRU, "godowns": CRU, "stock": DECIDE,
            "employees": CRU, "attendance": CRU, "leave": DECIDE, "expenses": DECIDE, "payments": RE, "receipts": RE, "finance": RE,
            "reports": RE,
        },
    },
    "MANAGER": {
        "description": "Runs daily sales, purchasing, stock and attendance",
        "perms": {
            "dashboard": R, "sales": CRU, "quotations": CRU, "invoices": RE, "purchases": CRU, "purchase_orders": CRU, "customers": CRU,
            "suppliers": CRU, "products": CRU, "categories": CRU, "brands": CRU, "godowns": CRU, "stock": CRU, "employees": R,
            "attendance": CRU, "expenses": ["create", "read", "update"], "reports": RE,
        },
    },
    "ACCOUNTANT": {
        "description": "Manages billing, payments, accounts and payroll",
        "perms": {
            "dashboard": R, "customers": R, "suppliers": R, "sales": RE, "purchases": RE, "invoices": CRU, "payments": DECIDE,
            "receipts": CRU, "expenses": DECIDE, "income": CRU, "finance": RE, "payroll": DECIDE, "reports": RE,
        },
    },
}

# Roles from the earlier seed keep working with the closest new template.
LEGACY_ROLE_TEMPLATES = {
    "SALES_MANAGER": "MANAGER",
    "BILLING_STAFF": "ACCOUNTANT",
    "STORE_KEEPER": "INVENTORY_MANAGER",
    "SALES_STAFF": "SALES_EXECUTIVE",
}

OWN_RECORDS_ROLES = ["SALES_EXECUTIVE", "SALES_STAFF"]


def has_permission(user, module, action):
    return bool(user and (user["isSuperAdmin"] or action in user["permissions"].get(module, [])))


def own_records_only(user):
    return user["role"]["name"] in OWN_RECORDS_ROLES
