-- Bhanu Shree Tiles schema for MySQL 8. Text compares exactly, as usernames and codes need.

CREATE TABLE "Attendance" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "employeeId" INT NOT NULL,
  "date" DATE NOT NULL,
  "status" ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY') NOT NULL,
  "checkIn" TEXT NULL,
  "checkOut" TEXT NULL,
  "notes" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  KEY "Attendance_date_idx" ("date"),
  UNIQUE KEY "Attendance_employeeId_date_key" ("employeeId", "date")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "AuditLog" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "userId" INT NULL,
  "action" ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PAYMENT', 'STOCK_IN', 'STOCK_OUT', 'STOCK_TRANSFER', 'APPROVE', 'CANCEL', 'OTHER', 'REJECT', 'PERMISSION_CHANGE', 'EXPORT', 'PASSWORD', 'BACKUP') NOT NULL,
  "module" VARCHAR(191) NOT NULL,
  "description" TEXT NULL,
  "entityId" INT NULL,
  "ipAddress" TEXT NULL,
  "userAgent" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  KEY "AuditLog_userId_idx" ("userId"),
  KEY "AuditLog_module_idx" ("module"),
  KEY "AuditLog_action_idx" ("action"),
  KEY "AuditLog_createdAt_idx" ("createdAt")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "BackupRecord" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "fileName" VARCHAR(191) NOT NULL,
  "sizeBytes" INT NOT NULL,
  "rowCount" INT NOT NULL,
  "createdById" INT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  UNIQUE KEY "BackupRecord_fileName_key" ("fileName")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Brand" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "name" VARCHAR(191) NOT NULL,
  "description" TEXT NULL,
  "status" ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Brand_name_key" ("name")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Category" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "name" VARCHAR(191) NOT NULL,
  "description" TEXT NULL,
  "status" ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Category_name_key" ("name")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "CreditDebitNote" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "noteNumber" VARCHAR(191) NOT NULL,
  "type" ENUM('CREDIT', 'DEBIT') NOT NULL,
  "customerId" INT NULL,
  "supplierId" INT NULL,
  "saleId" INT NULL,
  "purchaseId" INT NULL,
  "noteDate" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "amount" DECIMAL(14,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  "createdById" INT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  UNIQUE KEY "CreditDebitNote_noteNumber_key" ("noteNumber"),
  KEY "CreditDebitNote_type_idx" ("type"),
  KEY "CreditDebitNote_noteDate_idx" ("noteDate")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Customer" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "customerCode" VARCHAR(191) NOT NULL,
  "name" VARCHAR(191) NOT NULL,
  "phone" VARCHAR(191) NULL,
  "email" TEXT NULL,
  "address" TEXT NULL,
  "city" TEXT NULL,
  "state" TEXT NULL,
  "pincode" TEXT NULL,
  "gstNumber" TEXT NULL,
  "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "isActive" TINYINT(1) NOT NULL DEFAULT 1,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "shippingAddress" TEXT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Customer_customerCode_key" ("customerCode"),
  KEY "Customer_name_idx" ("name"),
  KEY "Customer_phone_idx" ("phone")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "CustomerLedger" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "customerId" INT NOT NULL,
  "date" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "reference" TEXT NULL,
  "description" TEXT NULL,
  "type" ENUM('DEBIT', 'CREDIT') NOT NULL,
  "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  KEY "CustomerLedger_customerId_idx" ("customerId"),
  KEY "CustomerLedger_date_idx" ("date")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "DamagedStock" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "damageNo" VARCHAR(191) NOT NULL,
  "godownId" INT NOT NULL,
  "reason" TEXT NOT NULL,
  "notes" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "createdById" INT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "DamagedStock_damageNo_key" ("damageNo")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "DamagedStockItem" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "damagedStockId" INT NOT NULL,
  "productId" INT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  "value" DECIMAL(12,2) NULL,
  PRIMARY KEY ("id")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "DocumentSequence" (
  "key" VARCHAR(191) NOT NULL,
  "nextValue" INT NOT NULL DEFAULT 1,
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("key")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Employee" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "employeeCode" VARCHAR(191) NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NULL,
  "email" TEXT NULL,
  "department" TEXT NULL,
  "designation" TEXT NULL,
  "joiningDate" DATETIME(3) NULL,
  "salary" DECIMAL(14,2) NULL,
  "status" ENUM('ACTIVE', 'INACTIVE', 'ON_LEAVE') NOT NULL DEFAULT 'ACTIVE',
  "address" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Employee_employeeCode_key" ("employeeCode")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "ErpSettings" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "companyName" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "gstin" TEXT NOT NULL,
  "pan" TEXT NOT NULL,
  "website" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "invoicePrefix" TEXT NOT NULL,
  "purchasePrefix" TEXT NOT NULL,
  "tax" DOUBLE NOT NULL DEFAULT 18,
  "dueDays" INT NOT NULL DEFAULT 30,
  "invoiceFooter" TEXT NOT NULL,
  "paymentMode" TEXT NOT NULL,
  "roundOff" TEXT NOT NULL,
  "lowStock" INT NOT NULL DEFAULT 20,
  "lowStockAlert" TINYINT(1) NOT NULL DEFAULT 1,
  "saleAlert" TINYINT(1) NOT NULL DEFAULT 1,
  "purchaseAlert" TINYINT(1) NOT NULL DEFAULT 1,
  "paymentAlert" TINYINT(1) NOT NULL DEFAULT 1,
  "expenseAlert" TINYINT(1) NOT NULL DEFAULT 1,
  "twoFactor" TINYINT(1) NOT NULL DEFAULT 0,
  "loginAlert" TINYINT(1) NOT NULL DEFAULT 1,
  "sessionTimeout" TINYINT(1) NOT NULL DEFAULT 1,
  "timezone" TEXT NOT NULL,
  "dateFormat" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "dashboard" TEXT NOT NULL,
  "theme" TEXT NOT NULL,
  "pageSize" INT NOT NULL DEFAULT 25,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  "maxLoginAttempts" INT NOT NULL DEFAULT 5,
  "sessionHours" INT NOT NULL DEFAULT 8,
  "backupEnabled" TINYINT(1) NOT NULL DEFAULT 1,
  "backupKeepCount" INT NOT NULL DEFAULT 14,
  PRIMARY KEY ("id")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Expense" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "expenseNumber" VARCHAR(191) NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT', 'OTHER') NOT NULL,
  "expenseDate" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "status" ENUM('PENDING', 'APPROVED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  "createdById" INT NULL,
  "approvedById" INT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Expense_expenseNumber_key" ("expenseNumber"),
  KEY "Expense_expenseDate_idx" ("expenseDate"),
  KEY "Expense_status_idx" ("status")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Godown" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "name" VARCHAR(191) NOT NULL,
  "code" VARCHAR(191) NOT NULL,
  "location" TEXT NULL,
  "address" TEXT NULL,
  "managerName" TEXT NULL,
  "phone" TEXT NULL,
  "capacity" DECIMAL(12,2) NULL,
  "status" ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Godown_name_key" ("name"),
  UNIQUE KEY "Godown_code_key" ("code")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Income" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "incomeNumber" VARCHAR(191) NOT NULL,
  "source" TEXT NOT NULL,
  "description" TEXT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT', 'OTHER') NOT NULL,
  "incomeDate" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "createdById" INT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Income_incomeNumber_key" ("incomeNumber"),
  KEY "Income_incomeDate_idx" ("incomeDate")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Invoice" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "invoiceNumber" VARCHAR(191) NOT NULL,
  "saleId" INT NOT NULL,
  "customerId" INT NULL,
  "invoiceDate" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "dueDate" DATETIME(3) NULL,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balanceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" ENUM('DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'CANCELLED', 'OVERDUE') NOT NULL DEFAULT 'ISSUED',
  "notes" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Invoice_invoiceNumber_key" ("invoiceNumber"),
  UNIQUE KEY "Invoice_saleId_key" ("saleId"),
  KEY "Invoice_customerId_idx" ("customerId"),
  KEY "Invoice_invoiceDate_idx" ("invoiceDate"),
  KEY "Invoice_status_idx" ("status")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "LeaveRequest" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "employeeId" INT NOT NULL,
  "leaveType" TEXT NOT NULL,
  "fromDate" DATE NOT NULL,
  "toDate" DATE NOT NULL,
  "days" DECIMAL(5,1) NOT NULL,
  "reason" TEXT NULL,
  "status" ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  "approvedById" INT NULL,
  "decidedAt" DATETIME(3) NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  KEY "LeaveRequest_employeeId_idx" ("employeeId"),
  KEY "LeaveRequest_status_idx" ("status")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "LoginHistory" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "userId" INT NULL,
  "identifier" TEXT NOT NULL,
  "success" TINYINT(1) NOT NULL,
  "reason" TEXT NULL,
  "ipAddress" TEXT NULL,
  "userAgent" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  KEY "LoginHistory_userId_idx" ("userId"),
  KEY "LoginHistory_createdAt_idx" ("createdAt")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "PasswordResetToken" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "userId" INT NOT NULL,
  "tokenHash" VARCHAR(191) NOT NULL,
  "expiresAt" DATETIME(3) NOT NULL,
  "usedAt" DATETIME(3) NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  UNIQUE KEY "PasswordResetToken_tokenHash_key" ("tokenHash"),
  KEY "PasswordResetToken_userId_idx" ("userId")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Payment" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "paymentNumber" VARCHAR(191) NOT NULL,
  "customerId" INT NULL,
  "saleId" INT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT', 'OTHER') NOT NULL,
  "status" ENUM('PENDING', 'PARTIAL', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'PAID',
  "transactionId" TEXT NULL,
  "paymentDate" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "notes" TEXT NULL,
  "createdById" INT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "direction" ENUM('IN', 'OUT') NOT NULL DEFAULT 'IN',
  "purchaseId" INT NULL,
  "supplierId" INT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Payment_paymentNumber_key" ("paymentNumber"),
  KEY "Payment_customerId_idx" ("customerId"),
  KEY "Payment_paymentDate_idx" ("paymentDate"),
  KEY "Payment_supplierId_idx" ("supplierId"),
  KEY "Payment_saleId_idx" ("saleId"),
  KEY "Payment_purchaseId_idx" ("purchaseId")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Payroll" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "employeeId" INT NOT NULL,
  "month" INT NOT NULL,
  "year" INT NOT NULL,
  "basic" DECIMAL(14,2) NOT NULL,
  "allowances" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "netPay" DECIMAL(14,2) NOT NULL,
  "method" ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT', 'OTHER') NOT NULL DEFAULT 'BANK_TRANSFER',
  "status" ENUM('DRAFT', 'APPROVED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  "paidAt" DATETIME(3) NULL,
  "notes" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  KEY "Payroll_year_month_idx" ("year", "month"),
  UNIQUE KEY "Payroll_employeeId_month_year_key" ("employeeId", "month", "year")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Permission" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "name" VARCHAR(191) NOT NULL,
  "description" TEXT NULL,
  "module" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  UNIQUE KEY "Permission_name_key" ("name")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Product" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "sku" VARCHAR(191) NOT NULL,
  "barcode" VARCHAR(191) NULL,
  "name" VARCHAR(191) NOT NULL,
  "description" TEXT NULL,
  "categoryId" INT NOT NULL,
  "brandId" INT NULL,
  "unit" TEXT NOT NULL DEFAULT ('BOX'),
  "size" TEXT NULL,
  "color" TEXT NULL,
  "finish" TEXT NULL,
  "purchasePrice" DECIMAL(12,2) NOT NULL,
  "sellingPrice" DECIMAL(12,2) NOT NULL,
  "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
  "reorderLevel" INT NOT NULL DEFAULT 0,
  "status" ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  "createdById" INT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  "imageUrl" TEXT NULL,
  "maxStock" INT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Product_sku_key" ("sku"),
  UNIQUE KEY "Product_barcode_key" ("barcode"),
  KEY "Product_categoryId_idx" ("categoryId"),
  KEY "Product_brandId_idx" ("brandId"),
  KEY "Product_name_idx" ("name")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Purchase" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "purchaseNumber" VARCHAR(191) NOT NULL,
  "supplierId" INT NOT NULL,
  "createdById" INT NULL,
  "purchaseDate" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "subtotal" DECIMAL(14,2) NOT NULL,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balanceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" ENUM('DRAFT', 'ORDERED', 'RECEIVED', 'PARTIAL', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'RECEIVED',
  "notes" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  "approvedAt" DATETIME(3) NULL,
  "approvedById" INT NULL,
  "cancelReason" TEXT NULL,
  "godownId" INT NULL,
  "purchaseOrderId" INT NULL,
  "supplierInvoiceNo" TEXT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Purchase_purchaseNumber_key" ("purchaseNumber"),
  KEY "Purchase_supplierId_idx" ("supplierId"),
  KEY "Purchase_purchaseDate_idx" ("purchaseDate"),
  KEY "Purchase_status_idx" ("status")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "PurchaseItem" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "purchaseId" INT NOT NULL,
  "productId" INT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  "unitCost" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  PRIMARY KEY ("id")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "PurchaseOrder" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "orderNumber" VARCHAR(191) NOT NULL,
  "supplierId" INT NOT NULL,
  "orderDate" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "expectedDate" DATETIME(3) NULL,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "status" ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  "notes" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  "approvedAt" DATETIME(3) NULL,
  "approvedById" INT NULL,
  "createdById" INT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "PurchaseOrder_orderNumber_key" ("orderNumber"),
  KEY "PurchaseOrder_supplierId_idx" ("supplierId"),
  KEY "PurchaseOrder_status_idx" ("status")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "PurchaseOrderItem" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "purchaseOrderId" INT NOT NULL,
  "productId" INT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  PRIMARY KEY ("id")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Receipt" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "receiptNumber" VARCHAR(191) NOT NULL,
  "customerId" INT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT', 'OTHER') NOT NULL,
  "receiptDate" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "reference" TEXT NULL,
  "notes" TEXT NULL,
  "createdById" INT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "paymentId" INT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Receipt_receiptNumber_key" ("receiptNumber"),
  UNIQUE KEY "Receipt_paymentId_key" ("paymentId"),
  KEY "Receipt_customerId_idx" ("customerId"),
  KEY "Receipt_receiptDate_idx" ("receiptDate")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Role" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "name" VARCHAR(191) NOT NULL,
  "description" TEXT NULL,
  "isSystem" TINYINT(1) NOT NULL DEFAULT 0,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Role_name_key" ("name")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "RolePermission" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "roleId" INT NOT NULL,
  "permissionId" INT NOT NULL,
  "canView" TINYINT(1) NOT NULL DEFAULT 0,
  "canCreate" TINYINT(1) NOT NULL DEFAULT 0,
  "canUpdate" TINYINT(1) NOT NULL DEFAULT 0,
  "canDelete" TINYINT(1) NOT NULL DEFAULT 0,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "canApprove" TINYINT(1) NOT NULL DEFAULT 0,
  "canExport" TINYINT(1) NOT NULL DEFAULT 0,
  "canPrint" TINYINT(1) NOT NULL DEFAULT 0,
  "canReject" TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY ("id"),
  UNIQUE KEY "RolePermission_roleId_permissionId_key" ("roleId", "permissionId")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Sale" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "invoiceNumber" VARCHAR(191) NOT NULL,
  "customerId" INT NULL,
  "createdById" INT NULL,
  "godownId" INT NULL,
  "saleDate" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "subtotal" DECIMAL(14,2) NOT NULL,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balanceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" ENUM('DRAFT', 'CONFIRMED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'CONFIRMED',
  "notes" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  "cancelReason" TEXT NULL,
  "salespersonId" INT NULL,
  "sourceDocumentId" INT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Sale_invoiceNumber_key" ("invoiceNumber"),
  KEY "Sale_customerId_idx" ("customerId"),
  KEY "Sale_saleDate_idx" ("saleDate"),
  KEY "Sale_status_idx" ("status"),
  KEY "Sale_salespersonId_idx" ("salespersonId")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "SaleItem" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "saleId" INT NOT NULL,
  "productId" INT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  PRIMARY KEY ("id")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "SalesDocument" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "documentNo" VARCHAR(191) NOT NULL,
  "type" ENUM('QUOTATION', 'SALES_ORDER') NOT NULL,
  "customerId" INT NOT NULL,
  "godownId" INT NULL,
  "documentDate" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "validUntil" DATETIME(3) NULL,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "status" ENUM('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT NULL,
  "createdById" INT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "SalesDocument_documentNo_key" ("documentNo"),
  KEY "SalesDocument_type_status_idx" ("type", "status"),
  KEY "SalesDocument_customerId_idx" ("customerId")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "SalesDocumentItem" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "documentId" INT NOT NULL,
  "productId" INT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  PRIMARY KEY ("id")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "SalesTeamMember" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "userId" INT NOT NULL,
  "target" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "month" INT NOT NULL,
  "year" INT NOT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  UNIQUE KEY "SalesTeamMember_userId_month_year_key" ("userId", "month", "year")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Session" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "userId" INT NOT NULL,
  "tokenHash" VARCHAR(191) NOT NULL,
  "expiresAt" DATETIME(3) NOT NULL,
  "revokedAt" DATETIME(3) NULL,
  "ipAddress" TEXT NULL,
  "userAgent" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "lastSeenAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  UNIQUE KEY "Session_tokenHash_key" ("tokenHash"),
  KEY "Session_userId_idx" ("userId"),
  KEY "Session_expiresAt_idx" ("expiresAt")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "StockAdjustment" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "adjustmentNo" VARCHAR(191) NOT NULL,
  "godownId" INT NOT NULL,
  "type" ENUM('INCREASE', 'DECREASE') NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" INT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  UNIQUE KEY "StockAdjustment_adjustmentNo_key" ("adjustmentNo")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "StockAdjustmentItem" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "adjustmentId" INT NOT NULL,
  "productId" INT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  PRIMARY KEY ("id")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "StockBalance" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "productId" INT NOT NULL,
  "godownId" INT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "reserved" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "updatedAt" DATETIME(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "StockBalance_productId_godownId_key" ("productId", "godownId")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "StockIn" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "stockInNo" VARCHAR(191) NOT NULL,
  "godownId" INT NOT NULL,
  "supplierId" INT NULL,
  "purchaseId" INT NULL,
  "notes" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  "createdById" INT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "StockIn_stockInNo_key" ("stockInNo")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "StockInItem" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "stockInId" INT NOT NULL,
  "productId" INT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  "unitCost" DECIMAL(12,2) NULL,
  PRIMARY KEY ("id")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "StockMovement" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "productId" INT NOT NULL,
  "godownId" INT NOT NULL,
  "type" ENUM('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'DAMAGED', 'RETURN') NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  "referenceType" TEXT NULL,
  "referenceId" INT NULL,
  "notes" TEXT NULL,
  "createdById" INT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "balanceAfter" DECIMAL(14,2) NULL,
  "delta" DECIMAL(14,2) NULL,
  PRIMARY KEY ("id"),
  KEY "StockMovement_productId_idx" ("productId"),
  KEY "StockMovement_godownId_idx" ("godownId"),
  KEY "StockMovement_type_idx" ("type"),
  KEY "StockMovement_createdAt_idx" ("createdAt")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "StockOut" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "stockOutNo" VARCHAR(191) NOT NULL,
  "godownId" INT NOT NULL,
  "saleId" INT NULL,
  "reason" TEXT NULL,
  "notes" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  "createdById" INT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "StockOut_stockOutNo_key" ("stockOutNo")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "StockOutItem" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "stockOutId" INT NOT NULL,
  "productId" INT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  PRIMARY KEY ("id")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "StockTransfer" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "transferNo" VARCHAR(191) NOT NULL,
  "fromGodownId" INT NOT NULL,
  "toGodownId" INT NOT NULL,
  "status" ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'COMPLETED',
  "notes" TEXT NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  "createdById" INT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "StockTransfer_transferNo_key" ("transferNo")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "StockTransferItem" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "transferId" INT NOT NULL,
  "productId" INT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  PRIMARY KEY ("id")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "Supplier" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "supplierCode" VARCHAR(191) NOT NULL,
  "name" VARCHAR(191) NOT NULL,
  "contactPerson" TEXT NULL,
  "phone" TEXT NULL,
  "email" TEXT NULL,
  "address" TEXT NULL,
  "city" TEXT NULL,
  "state" TEXT NULL,
  "pincode" TEXT NULL,
  "gstNumber" TEXT NULL,
  "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "isActive" TINYINT(1) NOT NULL DEFAULT 1,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY ("id"),
  UNIQUE KEY "Supplier_supplierCode_key" ("supplierCode"),
  KEY "Supplier_name_idx" ("name")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "SupplierLedger" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "supplierId" INT NOT NULL,
  "date" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "reference" TEXT NULL,
  "description" TEXT NULL,
  "type" ENUM('DEBIT', 'CREDIT') NOT NULL,
  "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY ("id"),
  KEY "SupplierLedger_supplierId_idx" ("supplierId"),
  KEY "SupplierLedger_date_idx" ("date")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE "User" (
  "id" INT NOT NULL AUTO_INCREMENT,
  "name" TEXT NOT NULL,
  "email" VARCHAR(191) NOT NULL,
  "phone" TEXT NULL,
  "username" VARCHAR(191) NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "status" ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  "roleId" INT NOT NULL,
  "lastLoginAt" DATETIME(3) NULL,
  "createdAt" DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updatedAt" DATETIME(3) NOT NULL,
  "failedLogins" INT NOT NULL DEFAULT 0,
  "lockedUntil" DATETIME(3) NULL,
  "mustChangePassword" TINYINT(1) NOT NULL DEFAULT 0,
  "passwordChangedAt" DATETIME(3) NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "User_email_key" ("email"),
  UNIQUE KEY "User_username_key" ("username")
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BackupRecord" ADD CONSTRAINT "BackupRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerLedger" ADD CONSTRAINT "CustomerLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DamagedStockItem" ADD CONSTRAINT "DamagedStockItem_damagedStockId_fkey" FOREIGN KEY ("damagedStockId") REFERENCES "DamagedStock" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DamagedStockItem" ADD CONSTRAINT "DamagedStockItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DamagedStock" ADD CONSTRAINT "DamagedStock_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Income" ADD CONSTRAINT "Income_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SalesDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesDocumentItem" ADD CONSTRAINT "SalesDocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SalesDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesDocumentItem" ADD CONSTRAINT "SalesDocumentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesTeamMember" ADD CONSTRAINT "SalesTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "StockAdjustment" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockInItem" ADD CONSTRAINT "StockInItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockInItem" ADD CONSTRAINT "StockInItem_stockInId_fkey" FOREIGN KEY ("stockInId") REFERENCES "StockIn" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockIn" ADD CONSTRAINT "StockIn_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockIn" ADD CONSTRAINT "StockIn_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockIn" ADD CONSTRAINT "StockIn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockOutItem" ADD CONSTRAINT "StockOutItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockOutItem" ADD CONSTRAINT "StockOutItem_stockOutId_fkey" FOREIGN KEY ("stockOutId") REFERENCES "StockOut" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockOut" ADD CONSTRAINT "StockOut_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockOut" ADD CONSTRAINT "StockOut_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromGodownId_fkey" FOREIGN KEY ("fromGodownId") REFERENCES "Godown" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toGodownId_fkey" FOREIGN KEY ("toGodownId") REFERENCES "Godown" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierLedger" ADD CONSTRAINT "SupplierLedger_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The audit log cannot be changed. Restoring a backup sets @erp_restore for its own connection.
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON "AuditLog" FOR EACH ROW
BEGIN
  IF @erp_restore IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log entries cannot be changed';
  END IF;
END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON "AuditLog" FOR EACH ROW
BEGIN
  IF @erp_restore IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log entries cannot be changed';
  END IF;
END;
