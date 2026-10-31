# Bhanu Shree Tiles ERP

Business management system: inventory, stock, sales, invoicing, purchases, finance, HR, reports and role-based access, plus the public website.

- Frontend: HTML, CSS, JavaScript in `frontend/`
- Backend: Python, Flask and plain SQL on MySQL 8 in `backend/`

## Start the app (PowerShell, from the project folder)

1. Start the database, website and API together:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start.ps1
   ```
2. Open http://localhost:3000/login.html

On this PC the project has its own MySQL database on port 3307, with its files in `%LOCALAPPDATA%\BhanuShreeERP\mysql`. `start.ps1` starts it when needed. It does not touch the other MySQL on port 3306.

Stop with `Ctrl+C`.

## Share a temporary public link

Keep the app running, and in a second PowerShell window run:

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:5001
```

It prints a new `trycloudflare.com` link each time. `Ctrl+C` closes the link.

## First-time setup on a new computer

1. Install Python 3.14 and MySQL 8, and create an empty database with `CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`.
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`.
3. Run `powershell -ExecutionPolicy Bypass -File .\setup.ps1`. It installs packages, applies the SQL migrations and seeds roles.
4. The seed prints the first `admin` password once. You must change it at first login.

Running `backend\.venv\Scripts\python.exe backend\scripts\seed.py` again is safe: it never changes passwords, customised permissions or settings.

## Project layout

```
backend/
  server.py            starts the website and API
  requirements.txt     Python packages
  erp/app.py           application, sign-in gate, security headers, error handling
  erp/db.py            database access, plain SQL
  erp/services.py      numbering, stock, ledgers, payments
  erp/web.py           routes, sessions, lists, standard screens
  erp/routes/          request handling by business area
  migrations/          SQL files that build the database
  scripts/             migrate, seed, backup, restore
frontend/
  js/erp.js            shared engine: API, session, sidebar, tables, forms
  js/pages.js          definition of every ERP screen
  css/erp.css          theme
```

Each ERP `.html` file is a thin page that names its screen. To change a screen, edit `frontend/js/pages.js`.

## Business rules

- All stock changes go through `move_stock`, inside a database transaction, and leave a movement record. Stock cannot go below zero.
- Sale: reduces stock, creates the invoice, updates the customer ledger, and records any payment with a receipt.
- Purchase: users with the approve permission receive it at once. Others create a draft, and stock changes only when it is approved.
- Sales, purchases, payments, transfers and notes are cancelled and reversed, never deleted.
- Prices and GST on sales come from the product record. Changing a price needs the Sales approve permission.

## Roles and permissions

There are four roles. The Managing Director (Super Admin) always has everything. The Deputy Director, Manager and Accountant see only their own work, and can be changed in Roles & Permissions by module and action. The server checks permissions on every API call.

Accounts are created by an administrator in Users. There is no public registration.

## Backup and restore

Backups run daily while the server is on, and can be created on the Backup page or with `backend\.venv\Scripts\python.exe backend\scripts\backup.py`. Files are in `backend/backups`. Copy them to another location regularly.

Restore replaces ALL current data. A safety backup is taken first:

```powershell
backend\.venv\Scripts\python.exe backend\scripts\restore.py <backup-file-name> --confirm
```

## Updating an existing database

Back up first. Then point `DATABASE_URL` at it and run:

```powershell
backend\.venv\Scripts\python.exe backend\scripts\migrate.py
backend\.venv\Scripts\python.exe backend\scripts\seed.py
```

## Going live

- Set `APP_ENV=production` and serve over HTTPS, otherwise the login cookie will not be sent.
- Set `FRONTEND_ORIGIN` to your real website address.
- Set `TRUST_PROXY=1` when running behind a proxy or tunnel.
- Set the `SMTP_*` values so password reset emails are sent. Without them, the link prints in the server window.
