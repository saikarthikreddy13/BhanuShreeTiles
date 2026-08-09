# Bhanu Shree Tiles & Taps — ERP + Company Website

Minimal scaffolding for backend and auth. This repo will house the frontend static site in `frontend/` and an Express + MongoDB backend in `backend/`.

Getting started

1. Copy `.env.example` to `.env` and fill in `MONGODB_URI` and `JWT_SECRET`.
2. Install dependencies from project root:

```bash
npm install
cd backend
npm install
```

3. Start the server (from project root):

```bash
npm run dev
```

4. Open `http://localhost:5000` to view the frontend.

What's included so far

- `backend/server.js` — express server and static file serving
- `backend/config/db.js` — mongoose connection helper
- `backend/models/User.js` — user model with password hashing
- `backend/controllers/AuthController.js` — register/login/me
- `backend/routes/authRoutes.js` — auth routes
- `backend/middleware/auth.js` — JWT auth middleware
- `frontend/login.html` — login page that talks to `/api/auth/login`

Next steps

- Implement ERP modules: products, customers, suppliers, purchases, sales, stock, reports.
- Build frontend pages and dashboard.
- Add file uploads, PDF/Excel exports, email integration.
