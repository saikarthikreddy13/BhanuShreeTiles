// Every ERP screen is defined here and rendered by erp.js.
const { esc, $, $$, fmt, badge, api, can, toast, confirmDialog, buildForm, openForm, modal, stateHtml, tableHtml, download, toCsv, cellText, listPage, API_BASE } = window.ERP;

const METHODS = [["CASH", "Cash"], ["UPI", "UPI"], ["CARD", "Card"], ["BANK_TRANSFER", "Bank transfer"], ["CHEQUE", "Cheque"], ["CREDIT", "Pay later (credit)"], ["OTHER", "Other"]];
const ACTIVE = ["ACTIVE", "INACTIVE"];
const today = () => new Date().toLocaleDateString("en-CA");

const SRC = {
  categories: "/categories?status=ACTIVE&limit=1000",
  brands: "/brands?status=ACTIVE&limit=1000",
  godowns: "/godowns?status=ACTIVE&limit=1000",
  customers: "/customers?active=true&limit=1000",
  suppliers: "/suppliers?active=true&limit=1000",
  employees: "/employees?limit=1000",
  roles: "/roles/options",
};

const GODOWN = { k: "godownId", l: "Godown", type: "select", source: SRC.godowns, req: true, quick: { page: "godowns", module: "godowns", name: "godown" } };
const CUSTOMER = { k: "customerId", l: "Customer", type: "select", source: SRC.customers, text: (r) => `${r.name}${r.phone ? ` (${r.phone})` : ""}`, quick: { page: "customers", module: "customers", name: "customer" } };
const SUPPLIER = { k: "supplierId", l: "Supplier", type: "select", source: SRC.suppliers, req: true, quick: { page: "suppliers", module: "suppliers", name: "supplier" } };

// Details asked for depend on how the money moved. They are saved together as the payment reference.
const whenMethod = (...methods) => (v) => methods.includes(v.method);
const moneyMoved = (v) => Number(v.paidAmount ?? v.amount ?? 0) > 0;
const PAYMENT_DETAILS = [
  { k: "upiId", l: "UPI ID", showIf: whenMethod("UPI") },
  { k: "upiTxn", l: "UPI transaction ID", showIf: whenMethod("UPI"), reqIf: moneyMoved },
  { k: "cardLast4", l: "Card last 4 digits", showIf: whenMethod("CARD") },
  { k: "cardApproval", l: "Approval code", showIf: whenMethod("CARD") },
  { k: "chequeNo", l: "Cheque number", showIf: whenMethod("CHEQUE"), reqIf: moneyMoved },
  { k: "bankName", l: "Bank name", showIf: whenMethod("CHEQUE", "BANK_TRANSFER") },
  { k: "chequeDate", l: "Cheque date", type: "date", showIf: whenMethod("CHEQUE") },
  { k: "utr", l: "UTR number", showIf: whenMethod("BANK_TRANSFER"), reqIf: moneyMoved },
  { k: "transactionId", l: "Reference number", showIf: whenMethod("OTHER") },
];
const paymentMethodFields = (extra = {}) => [{ k: "method", l: "Payment method", type: "select", options: METHODS, def: "CASH", ...extra }, ...PAYMENT_DETAILS];
function withPayment({ upiId, upiTxn, cardLast4, cardApproval, chequeNo, bankName, chequeDate, utr, ...data }) {
  const parts = {
    UPI: [upiId && `UPI ID ${upiId}`, upiTxn && `Txn ${upiTxn}`],
    CARD: [cardLast4 && `Card ending ${cardLast4}`, cardApproval && `Approval ${cardApproval}`],
    CHEQUE: [chequeNo && `Cheque ${chequeNo}`, bankName, chequeDate && `dated ${fmt.date(chequeDate)}`],
    BANK_TRANSFER: [utr && `UTR ${utr}`, bankName],
  }[data.method];
  return parts ? { ...data, transactionId: parts.filter(Boolean).join(", ").slice(0, 80) } : data;
}
const EMPLOYEE = { k: "employeeId", l: "Employee", type: "select", source: SRC.employees, req: true, text: (r) => `${r.name} (${r.employeeCode})` };
const dateFilters = [{ k: "from", l: "From", type: "date" }, { k: "to", l: "To", type: "date" }];
const QTY_LINES = { k: "items", l: "Products", type: "lines", req: true, cols: [{ k: "productId", l: "Product" }, { k: "quantity", l: "Quantity", def: 1 }] };
const itemsText = (r) => (r.items || []).map((i) => `${i.product?.name} × ${fmt.num(i.quantity)}`).join(", ");
const ITEMS_COL = { k: "items", l: "Products", f: (r) => esc(itemsText(r)), x: itemsText };

function financeTotals(lines, editor, overall, priceKey) {
  let taxable = 0, tax = 0;
  const rows = lines.map((l) => {
    const p = editor.product(l.productId);
    const value = Number(l.quantity || 0) * Number(l[priceKey] || 0) - Number(l.discount || 0);
    return { value, pct: Number(l.taxPercent ?? p?.taxPercent ?? 0) };
  });
  const base = rows.reduce((s, r) => s + r.value, 0);
  for (const r of rows) {
    const net = base ? r.value - (r.value / base) * overall : 0;
    taxable += net;
    tax += (net * r.pct) / 100;
  }
  return { taxable, tax, total: taxable + tax };
}

// Full-page bill entry shared by sales, purchases, quotations, orders.
function billPage({ title, fields, cols, priceKey, post, toBody, afterSave, intro, showDiscount = true }) {
  return {
    title,
    render(root) {
      root.innerHTML = `<div class="page-head"><div><h1>${esc(title)}</h1>${intro ? `<p>${esc(intro)}</p>` : ""}</div></div>
        <div class="card"><div data-form></div><div class="totals" data-totals></div>
        <div class="row-actions" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-save>Save</button></div></div>`;
      let form;
      const recalc = () => {
        const data = form.read();
        const t = financeTotals(data.items, form.editors.items, Number(data.discount || 0), priceKey);
        $("[data-totals]", root).innerHTML = `<div><span>Amount before GST</span><span>${fmt.money(t.taxable)}</span></div>
          <div><span>GST</span><span>${fmt.money(t.tax)}</span></div><div class="grand"><span>Grand total</span><span>${fmt.money(t.total)}</span></div>`;
      };
      const lines = { k: "items", l: "Products", type: "lines", req: true, full: true, cols, onChange: () => recalc() };
      const all = [...fields, ...(showDiscount ? [{ k: "discount", l: "Discount on bill (₹)", type: "number", min: 0 }] : []), lines];
      form = buildForm($("[data-form]", root), all);
      form.editors.items.setRows([{}]).then(recalc);
      $("[data-form]", root).addEventListener("input", recalc);
      const save = $("[data-save]", root);
      save.addEventListener("click", async () => {
        const data = form.read();
        if (!form.validate(data)) return toast("Fill in the required fields", true);
        save.disabled = true;
        try {
          const result = await api(post, { method: "POST", body: toBody ? toBody(data) : data });
          toast(result.message);
          setTimeout(() => ERP.go(afterSave(result.data)), 500);
        } catch (error) {
          form.showErrors(error);
          toast(error.message, true);
          save.disabled = false;
        }
      });
    },
  };
}

const documentHeader = async () => (await api("/settings/company")).data;

function renderBillDoc(company, heading, rows) {
  return `<div class="doc-head"><div><h1>${esc(company.companyName)}</h1><div>${esc(company.address)}</div>
    <div>${esc([company.phone, company.email].filter(Boolean).join(" | "))}</div>${company.gstin ? `<div>GSTIN: ${esc(company.gstin)}</div>` : ""}</div>
    <div style="text-align:right">${heading}</div></div>${rows}`;
}

const itemTable = (items, priceKey = "unitPrice") => tableHtml([
  { k: "name", l: "Item", f: (i) => esc(i.product.name) }, { k: "quantity", l: "Qty", t: "num" }, { k: priceKey, l: "Price", t: "money" },
  { k: "discount", l: "Discount", t: "money" }, { k: "taxPercent", l: "GST %", t: "num" }, { k: "taxAmount", l: "GST", t: "money" }, { k: "totalAmount", l: "Total", t: "money" },
], items);

const totalsBlock = (d, extra = "") => `<div class="totals"><div><span>Subtotal</span><span>${fmt.money(d.subtotal)}</span></div>
  <div><span>Discount</span><span>${fmt.money(d.discount)}</span></div>
  <div><span>CGST</span><span>${fmt.money(d.taxAmount / 2)}</span></div><div><span>SGST</span><span>${fmt.money(d.taxAmount / 2)}</span></div>
  <div class="grand"><span>Grand total</span><span>${fmt.money(d.totalAmount)}</span></div>${extra}</div>`;

function detailPage(title, module, load) {
  return {
    title, module,
    async render(root) {
      const id = new URLSearchParams(location.search).get("id");
      if (!id) { root.innerHTML = stateHtml("empty", "Open this page from a list."); return; }
      const show = async () => {
        root.innerHTML = stateHtml("loading");
        try { await load(root, id, show); }
        catch (error) { root.innerHTML = stateHtml(error.status === 404 ? "empty" : "error", error.message); }
      };
      root.addEventListener("click", (e) => { if (e.target.dataset.retry !== undefined) show(); });
      await show();
    },
  };
}

const paymentForm = (direction, preset, onDone) => {
  const fields = [
    { k: "amount", l: "Amount", type: "number", req: true, min: 0.01, def: preset.amount },
    ...paymentMethodFields({ req: true }),
    { k: "paymentDate", l: "Date", type: "date", def: today() },
    { k: "notes", l: "Notes", type: "textarea" },
  ];
  openForm({ title: "Record payment", fields, submit: (d) => api("/payments", { method: "POST", body: { ...withPayment(d), direction, ...preset, amount: d.amount } }), onDone });
};

function ledgerPage(title, module, listUrl, apiBase, idLabel) {
  return {
    title, module,
    async render(root) {
      const initial = new URLSearchParams(location.search).get("id") || "";
      root.innerHTML = `<div class="page-head"><h1>${esc(title)}</h1></div>
        <div class="toolbar"><div><label>${esc(idLabel)}</label><select data-party><option value="">Select</option></select></div>
        <div><label>From</label><input type="date" data-from></div><div><label>To</label><input type="date" data-to></div></div><div data-out>${stateHtml("empty", `Select a ${idLabel.toLowerCase()}.`)}</div>`;
      const party = $("[data-party]", root);
      const rows = await ERP.loadSource(listUrl);
      party.insertAdjacentHTML("beforeend", rows.map((r) => `<option value="${r.id}" ${String(r.id) === initial ? "selected" : ""}>${esc(r.name)}</option>`).join(""));
      const load = async () => {
        const out = $("[data-out]", root);
        if (!party.value) return;
        out.innerHTML = stateHtml("loading");
        const q = new URLSearchParams({ limit: 200 });
        if ($("[data-from]", root).value) q.set("from", $("[data-from]", root).value);
        if ($("[data-to]", root).value) q.set("to", $("[data-to]", root).value);
        try {
          const res = await api(`${apiBase}/${party.value}/ledger?${q}`);
          const selected = rows.find((r) => String(r.id) === party.value);
          out.innerHTML = `<div class="grid kpis" style="margin-bottom:12px"><div class="kpi"><small>Opening balance</small><b>${fmt.money(selected.openingBalance)}</b></div>
            <div class="kpi"><small>Current balance</small><b>${fmt.money(selected.balance)}</b></div></div>` + (res.data.length
            ? tableHtml([{ k: "date", l: "Date", t: "date" }, { k: "reference", l: "Reference" }, { k: "description", l: "Description" }, { k: "debit", l: "Debit", t: "money" }, { k: "credit", l: "Credit", t: "money" }, { k: "balance", l: "Balance", t: "money" }], res.data)
            : stateHtml("empty", "No ledger entries."));
        } catch (error) { out.innerHTML = stateHtml("error", error.message); }
      };
      $$("select,input", root).forEach((el) => el.addEventListener("change", load));
      root.addEventListener("click", (e) => { if (e.target.dataset.retry !== undefined) load(); });
      load();
    },
  };
}

function reportView(root, type, locked, { rowAction, noDates } = {}) {
  const start = today().slice(0, 8) + "01";
  root.innerHTML = `<div class="toolbar">${locked ? "" : `<div><label>Report</label><select data-type></select></div>`}
    <div ${noDates ? "hidden" : ""}><label>From</label><input type="date" data-from value="${start}"></div><div ${noDates ? "hidden" : ""}><label>To</label><input type="date" data-to value="${today()}"></div>
    <div><label>Search</label><input data-find placeholder="Search by name or contact number"></div>
    <button class="btn" data-csv>Export CSV</button><button class="btn" data-print>Print / PDF</button></div><div data-sum></div><div data-out></div>`;
  const out = $("[data-out]", root);
  let report = null;
  const NAMES = { sales: "Sales", purchases: "Purchases", stock: "Stock", products: "Products", customers: "Customers", suppliers: "Suppliers", employees: "Employees", expenses: "Expenses", gst: "GST", "profit-loss": "Profit & loss", payments: "Payments", outstanding: "Payments due" };
  const columns = () => report.columns.map((c) => ({ k: c.key, l: c.label, t: c.type === "money" ? "money" : c.type === "number" ? "num" : c.type === "date" ? "date" : undefined, ...(c.key === "status" ? { t: "badge" } : {}) }));
  const visible = () => {
    const needle = $("[data-find]", root).value.trim().toLowerCase();
    return needle ? report.rows.filter((r) => Object.values(r).join(" ").toLowerCase().includes(needle)) : report.rows;
  };
  const draw = () => { const rows = visible(); out.innerHTML = rows.length ? tableHtml(columns(), rows, rowAction && ((r, i) => rowAction.html(r, i))) : stateHtml("empty", rowAction?.empty || "No data for this period."); };
  async function load() {
    out.innerHTML = stateHtml("loading");
    $("[data-sum]", root).innerHTML = "";
    const t = locked || $("[data-type]", root).value;
    try {
      const res = await api(`/reports/${t}?from=${$("[data-from]", root).value}&to=${$("[data-to]", root).value}`);
      report = res.data;
      $("[data-sum]", root).innerHTML = `<div class="grid kpis" style="margin-bottom:12px">${Object.entries(report.summary).map(([k, v]) => `<div class="kpi"><small>${esc(k)}</small><b>${fmt.money(v)}</b></div>`).join("")}</div>`;
      draw();
    } catch (error) { out.innerHTML = stateHtml("error", error.message); }
  }
  (async () => {
    if (!locked) {
      const list = (await api("/reports")).data;
      $("[data-type]", root).innerHTML = list.map((k) => `<option value="${k}" ${k === type ? "selected" : ""}>${esc(NAMES[k] || k)}</option>`).join("");
    }
    load();
  })().catch((error) => { out.innerHTML = stateHtml("error", error.message); });
  $$("[data-type],[data-from],[data-to]", root).forEach((el) => el.addEventListener("change", load));
  $("[data-find]", root).addEventListener("input", () => report && draw());
  root.addEventListener("click", async (e) => {
    const d = e.target.dataset;
    if (d.retry !== undefined) load();
    if (d.print !== undefined) window.print();
    if (d.row !== undefined) rowAction.run(visible()[d.row]);
    if (d.csv !== undefined && report) {
      try {
        const t = locked || $("[data-type]", root).value;
        await api(`/reports/${t}?export=1&from=${$("[data-from]", root).value}&to=${$("[data-to]", root).value}`);
        const cols = columns();
        download(`${t}-report.csv`, toCsv(cols.map((c) => c.l), visible().map((r) => cols.map((c) => cellText(c, r)))));
      } catch (error) { toast(error.message, true); }
    }
  });
}

const reportPage = (title, type, locked, module = "reports") => ({
  title, module,
  render(root) {
    root.innerHTML = `<div class="page-head"><h1>${esc(title)}</h1></div><div data-r></div>`;
    reportView($("[data-r]", root), type, locked);
  },
});

// Opens WhatsApp with the reminder ready to send. Nothing is sent until the user presses send there.
async function whatsAppReminder({ name = "", amount = "", phone = "" } = {}) {
  const company = await documentHeader().catch(() => ({}));
  const shop = company.companyName || "Bhanu Shree Tiles";
  const contact = company.phone || "91772 14787";
  const message = (who, due) => `Dear ${who || "Customer"},\n\nThis is a friendly reminder from ${shop} that ${due > 0 ? fmt.money(due) : "a balance"} is due on your account. Please arrange the payment at your earliest convenience.\n\nIf you have already paid, please ignore this message.\n\nThank you,\n${shop}\n${contact}`;
  const body = document.createElement("div");
  const fields = [
    { k: "name", l: "Customer name", req: true },
    { k: "amount", l: "Amount due", type: "number", min: 0, req: true },
    { k: "phone", l: "WhatsApp number", req: true },
    { k: "text", l: "Message", type: "textarea", rows: 11, req: true },
  ];
  const form = buildForm(body, fields, { name, amount, phone, text: message(name, Number(amount)) });
  const text = $('[name="text"]', body);
  let edited = false;
  text.addEventListener("input", () => { edited = true; });
  body.addEventListener("input", (event) => {
    if (edited || event.target === text) return;
    const d = form.read();
    text.value = message(d.name, Number(d.amount));
  });
  modal({
    title: "Send WhatsApp reminder", body, submitLabel: "Open WhatsApp",
    onSubmit: (close) => {
      const data = form.read();
      if (!form.validate(data)) return;
      let digits = data.phone.replace(/\D/g, "").replace(/^0+/, "");
      if (digits.length === 10) digits = `91${digits}`;
      if (digits.length < 11 || digits.length > 15) {
        $('[data-field="phone"] .err', body).textContent = "Enter a valid WhatsApp number with 10 digits";
        return;
      }
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(data.text)}`, "_blank", "noopener");
      close();
    },
  });
}

function barChart(rows, alt) {
  if (!rows.some((r) => Number(r.total) > 0)) return stateHtml("empty", "Nothing recorded yet.");
  const max = Math.max(...rows.map((r) => r.total), 1);
  return `<div class="chart">${rows.map((r) => `<div class="col" title="${esc(r.label)}: ${esc(fmt.money(r.total))}"><div class="bar${alt ? " alt" : ""}" style="height:${(r.total / max) * 100}%"></div><small>${esc(r.label)}</small></div>`).join("")}</div>`;
}

const stockDocs = (title, api_, numberKey, extraCols, fields) => ({
  title, module: "stock", api: api_, addLabel: `New ${title.toLowerCase().replace(/s$/, "")}`, wide: true, noEdit: true, filters: dateFilters,
  columns: [{ k: "createdAt", l: "Date", t: "date" }, { k: numberKey, l: "Number" }, ...extraCols, ITEMS_COL],
  form: fields,
});

window.ERP_PAGES = {
  dashboard: {
    title: "Dashboard", module: "dashboard",
    async render(root) {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      const actions = [["New purchase", "new-purchase.html", "purchases", ""], ["New sale", "new-sale.html", "sales", " primary"]].filter(([, , m]) => can(m, "create"));
      root.innerHTML = `<div class="page-head"><div><h1>${greeting}, ${esc(ERP.user.name)}</h1><p>${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div><div class="row-actions">${actions.map(([l, href, , c]) => `<a class="btn${c}" href="${href}">${l}</a>`).join("")}</div></div><div data-d>${stateHtml("loading")}</div>`;
      const load = async () => {
        const box = $("[data-d]", root);
        try {
          const { data } = await api("/dashboard");
          box.innerHTML = `<div class="grid kpis">${data.kpis.map((k) => `<a class="kpi" href="${esc(k.link)}"><small>${esc(k.label)}</small><b>${k.type === "money" ? fmt.money(k.value) : fmt.num(k.value)}</b></a>`).join("") || `<div class="state">Nothing to show for your role yet.</div>`}</div>
          <div class="grid two">
            ${data.charts.sales ? `<div class="card"><h2>Monthly sales</h2>${barChart(data.charts.sales)}</div>` : ""}
            ${data.charts.purchases ? `<div class="card"><h2>Monthly purchases</h2>${barChart(data.charts.purchases, true)}</div>` : ""}
          </div>
          <div class="grid two">
            ${can("sales") || can("purchases") ? `<div><h2 style="margin-bottom:8px">Recent transactions</h2>${data.recent.length ? tableHtml([{ k: "date", l: "Date", t: "date" }, { k: "type", l: "Type" }, { k: "reference", l: "Reference" }, { k: "party", l: "Party" }, { k: "amount", l: "Amount", t: "money" }], data.recent) : stateHtml("empty", "No transactions yet.")}</div>` : ""}
            ${can("stock") ? `<div><h2 style="margin-bottom:8px">Low stock alerts</h2>${data.lowStock.length ? tableHtml([{ k: "name", l: "Product" }, { k: "sku", l: "SKU" }, { k: "quantity", l: "In stock", t: "num" }, { k: "reorderLevel", l: "Minimum", t: "num" }], data.lowStock) : stateHtml("empty", "All products are above minimum stock.")}</div>` : ""}
          </div>`;
        } catch (error) { box.innerHTML = stateHtml("error", error.message); }
      };
      root.addEventListener("click", (e) => { if (e.target.dataset.retry !== undefined) load(); });
      load();
    },
  },

  users: {
    title: "Users", module: "users", api: "/users", addLabel: "Add user", deleteLabel: "Delete",
    filters: [{ k: "status", l: "Status", options: ["ACTIVE", "INACTIVE", "SUSPENDED"] }],
    columns: [{ k: "name", l: "Name" }, { k: "username", l: "Username" }, { k: "email", l: "Email" }, { k: "phone", l: "Contact number" }, { k: "role.name", l: "Role", f: (r) => esc(fmt.label(r.role.name)) }, { k: "status", l: "Status", t: "badge" }, { k: "lastLoginAt", l: "Last login", t: "datetime" }],
    form: [
      { k: "name", l: "Name", req: true }, { k: "username", l: "Username", req: true }, { k: "email", l: "Email", type: "email", req: true }, { k: "phone", l: "Contact number" },
      { k: "roleId", l: "Role", type: "select", source: SRC.roles, req: true, text: (r) => fmt.label(r.name) },
      { k: "status", l: "Status", type: "select", options: ["ACTIVE", "INACTIVE", "SUSPENDED"], def: "ACTIVE" },
      { k: "password", l: "Temporary password", type: "password", req: true },
    ],
    editFields: [
      { k: "name", l: "Name", req: true }, { k: "email", l: "Email", type: "email", req: true }, { k: "phone", l: "Contact number" },
      { k: "roleId", l: "Role", type: "select", source: SRC.roles, req: true, text: (r) => fmt.label(r.name) },
      { k: "status", l: "Status", type: "select", options: ["ACTIVE", "INACTIVE", "SUSPENDED"] },
    ],
    actions: [{
      l: "Reset password", perm: "update",
      run: (row, ctx) => openForm({
        title: `Reset password: ${row.username}`, fields: [{ k: "password", l: "New temporary password", type: "password", req: true }],
        submit: (d) => api(`/users/${row.id}/reset-password`, { method: "POST", body: d }), onDone: ctx.reload,
      }),
    }],
  },

  "login-history": {
    title: "Login History", module: "users", api: "/users/login-history", filters: [{ k: "success", l: "Result", options: [["true", "Success"], ["false", "Failed"]] }, ...dateFilters],
    columns: [{ k: "createdAt", l: "Time", t: "datetime" }, { k: "identifier", l: "Login used" }, { k: "user.name", l: "User" }, { k: "success", l: "Result", f: (r) => badge(r.success ? "Yes" : "No"), x: (r) => (r.success ? "Success" : "Failed") }, { k: "reason", l: "Reason" }, { k: "ipAddress", l: "IP" }],
  },

  "roles-permissions": {
    title: "Roles & Permissions", module: "roles",
    async render(root) {
      root.innerHTML = `<div class="page-head"><div><h1>Roles & Permissions</h1><p>Permissions apply on the next page load, and the server enforces them on every request.</p></div>
        <div class="row-actions">${can("roles", "create") ? `<button class="btn" data-new>New role</button>` : ""}<button class="btn primary" data-save>Save permissions</button></div></div>
        <div class="toolbar"><div><label>Role</label><select data-role></select></div></div><div data-m>${stateHtml("loading")}</div>`;
      const select = $("[data-role]", root);
      let matrix;
      const loadRoles = async () => {
        const roles = (await api("/roles")).data;
        select.innerHTML = roles.map((r) => `<option value="${r.id}" ${r.id === ERP.user.roleId ? "" : ""}>${esc(fmt.label(r.name))} (${r._count.users} users)</option>`).join("");
      };
      const load = async () => {
        const box = $("[data-m]", root);
        box.innerHTML = stateHtml("loading");
        try {
          matrix = (await api(`/roles/${select.value}/permissions`)).data;
          const locked = matrix.role.name === "SUPER_ADMIN" || !can("roles", "update");
          $("[data-save]", root).disabled = locked;
          box.innerHTML = `<div class="table-wrap"><table class="matrix"><thead><tr><th>Module</th>${matrix.actions.map((a) => `<th>${esc(fmt.label(a))}</th>`).join("")}</tr></thead>
            <tbody>${matrix.matrix.map((row, i) => `<tr><td>${esc(row.label)}</td>${matrix.actions.map((a) => `<td><input type="checkbox" aria-label="${esc(row.label)} ${a}" data-i="${i}" data-a="${a}" ${row.actions[a] ? "checked" : ""} ${locked ? "disabled" : ""}></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
        } catch (error) { box.innerHTML = stateHtml("error", error.message); }
      };
      await loadRoles();
      await load();
      select.addEventListener("change", load);
      root.addEventListener("click", async (e) => {
        const d = e.target.dataset;
        if (d.retry !== undefined) load();
        if (d.new !== undefined) {
          openForm({ title: "New role", fields: [{ k: "name", l: "Role name", req: true }, { k: "description", l: "Description" }], submit: (b) => api("/roles", { method: "POST", body: b }), onDone: async () => { await loadRoles(); load(); } });
        }
        if (d.save !== undefined) {
          $$("[data-i]", root).forEach((c) => { matrix.matrix[c.dataset.i].actions[c.dataset.a] = c.checked; });
          try { toast((await api(`/roles/${select.value}/permissions`, { method: "PUT", body: { matrix: matrix.matrix } })).message); }
          catch (error) { toast(error.message, true); }
        }
      });
    },
  },

  products: {
    title: "Products", module: "products", api: "/products", addLabel: "Add product", deleteLabel: "Deactivate", wide: true,
    filters: [{ k: "status", l: "Status", options: ACTIVE }, { k: "categoryId", l: "Category", source: SRC.categories }, { k: "brandId", l: "Brand", source: SRC.brands }],
    columns: [
      { k: "imageUrl", l: "Image", f: (r) => (r.imageUrl ? `<img src="${esc(API_BASE + r.imageUrl)}" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:6px">` : ""), x: () => "" },
      { k: "sku", l: "SKU" }, { k: "name", l: "Name" }, { k: "category.name", l: "Category" }, { k: "brand.name", l: "Brand" }, { k: "size", l: "Size" },
      { k: "stock", l: "Stock", t: "num", f: (r) => fmt.num(r.stockBalances.reduce((s, b) => s + Number(b.quantity), 0)), x: (r) => r.stockBalances.reduce((s, b) => s + Number(b.quantity), 0) },
      { k: "purchasePrice", l: "Cost", t: "money" }, { k: "sellingPrice", l: "Price", t: "money" }, { k: "taxPercent", l: "GST %", t: "num" }, { k: "status", l: "Status", t: "badge" },
    ],
    form: [
      { k: "sku", l: "SKU", req: true }, { k: "barcode", l: "Barcode" }, { k: "name", l: "Name", req: true },
      { k: "categoryId", l: "Category", type: "select", source: SRC.categories, req: true }, { k: "brandId", l: "Brand", type: "select", source: SRC.brands },
      { k: "unit", l: "Unit", def: "BOX" }, { k: "size", l: "Size" }, { k: "color", l: "Colour" }, { k: "finish", l: "Finish" },
      { k: "purchasePrice", l: "Purchase price", type: "number", req: true, min: 0 }, { k: "sellingPrice", l: "Selling price", type: "number", req: true, min: 0 },
      { k: "taxPercent", l: "GST %", type: "number", def: 18, min: 0 }, { k: "reorderLevel", l: "Minimum stock", type: "number", def: 0, min: 0, step: 1 }, { k: "maxStock", l: "Maximum stock", type: "number", min: 0, step: 1 },
      { k: "status", l: "Status", type: "select", options: ACTIVE, def: "ACTIVE" }, { k: "description", l: "Description", type: "textarea" },
    ],
    actions: [{
      l: "Image", perm: "update",
      run: (row, ctx) => {
        const m = modal({
          title: `Image: ${row.name}`, body: `<div class="field"><label>JPG, PNG or WEBP, up to 2 MB</label><input type="file" accept="image/jpeg,image/png,image/webp"></div>`, submitLabel: "Upload",
          onSubmit: async (close) => {
            const file = $("input[type=file]", m.overlay).files[0];
            if (!file) return toast("Choose an image", true);
            const form = new FormData();
            form.append("image", file);
            try { toast((await api(`/products/${row.id}/image`, { method: "POST", form })).message); close(); ctx.reload(); }
            catch (error) { toast(error.message, true); }
          },
        });
      },
    }],
  },

  categories: {
    title: "Categories", module: "categories", api: "/categories", addLabel: "Add category", deleteLabel: "Deactivate", filters: [{ k: "status", l: "Status", options: ACTIVE }],
    columns: [{ k: "name", l: "Name" }, { k: "description", l: "Description" }, { k: "_count.products", l: "Products", t: "num" }, { k: "status", l: "Status", t: "badge" }],
    form: [{ k: "name", l: "Name", req: true }, { k: "status", l: "Status", type: "select", options: ACTIVE, def: "ACTIVE" }, { k: "description", l: "Description", type: "textarea" }],
  },
  brands: {
    title: "Brands", module: "brands", api: "/brands", addLabel: "Add brand", deleteLabel: "Deactivate", filters: [{ k: "status", l: "Status", options: ACTIVE }],
    columns: [{ k: "name", l: "Name" }, { k: "description", l: "Description" }, { k: "_count.products", l: "Products", t: "num" }, { k: "status", l: "Status", t: "badge" }],
    form: [{ k: "name", l: "Name", req: true }, { k: "status", l: "Status", type: "select", options: ACTIVE, def: "ACTIVE" }, { k: "description", l: "Description", type: "textarea" }],
  },
  godowns: {
    title: "Godowns", module: "godowns", api: "/godowns", addLabel: "Add godown", deleteLabel: "Deactivate", filters: [{ k: "status", l: "Status", options: ACTIVE }],
    columns: [{ k: "code", l: "Code" }, { k: "name", l: "Name", f: (r) => `<a href="godown-details.html?id=${r.id}">${esc(r.name)}</a>`, x: (r) => r.name }, { k: "location", l: "Location" }, { k: "managerName", l: "Manager" }, { k: "phone", l: "Contact number" }, { k: "status", l: "Status", t: "badge" }],
    form: [{ k: "name", l: "Name", req: true }, { k: "code", l: "Code", req: true }, { k: "location", l: "Location" }, { k: "managerName", l: "Manager" }, { k: "phone", l: "Contact number" }, { k: "capacity", l: "Capacity", type: "number", min: 0 }, { k: "status", l: "Status", type: "select", options: ACTIVE, def: "ACTIVE" }, { k: "address", l: "Address", type: "textarea" }],
  },
  "godown-details": detailPage("Godown", "godowns", async (root, id) => {
    const g = (await api(`/godowns/${id}`)).data;
    root.innerHTML = `<div class="page-head"><div><h1>${esc(g.name)}</h1><p>${esc([g.code, g.location, g.managerName, g.phone].filter(Boolean).join(" · "))}</p></div><a class="btn" href="godowns.html">Back</a></div><div data-b></div>`;
    if (!can("stock")) return;
    const rows = (await api(`/stock/balances?godownId=${id}&limit=200`)).data;
    $("[data-b]", root).innerHTML = rows.length ? tableHtml([{ k: "product.sku", l: "SKU" }, { k: "product.name", l: "Product" }, { k: "quantity", l: "Quantity", t: "num" }, { k: "value", l: "Value", t: "money", f: (r) => fmt.money(r.quantity * r.product.purchasePrice) }], rows) : stateHtml("empty", "No stock in this godown.");
  }),

  stock: {
    title: "Stock Overview", module: "stock", api: "/stock/balances", filters: [{ k: "godownId", l: "Godown", source: SRC.godowns }],
    columns: [{ k: "product.sku", l: "SKU" }, { k: "product.name", l: "Product" }, { k: "godown.name", l: "Godown" }, { k: "quantity", l: "Quantity", t: "num" }, { k: "product.reorderLevel", l: "Minimum", t: "num" },
      { k: "cost", l: "Cost value", t: "money", f: (r) => fmt.money(r.quantity * r.product.purchasePrice), x: (r) => r.quantity * r.product.purchasePrice },
      { k: "flag", l: "Level", f: (r) => (Number(r.quantity) <= r.product.reorderLevel && r.product.reorderLevel > 0 ? badge("LOW") .replace("info", "bad") : badge("ACTIVE").replace("Active", "OK")), x: (r) => (Number(r.quantity) <= r.product.reorderLevel ? "Low" : "OK") }],
    tools: [{
      l: "Valuation by godown",
      run: async () => {
        try {
          const rows = (await api("/stock/valuation")).data;
          modal({ title: "Stock valuation", wide: true, hideSubmit: true, body: rows.length ? tableHtml([{ k: "godown", l: "Godown" }, { k: "products", l: "Products", t: "num" }, { k: "units", l: "Units", t: "num" }, { k: "costValue", l: "Cost value", t: "money" }, { k: "saleValue", l: "Sale value", t: "money" }], rows) : stateHtml("empty", "No godowns yet.") });
        } catch (error) { toast(error.message, true); }
      },
    }],
  },
  "stock-in": stockDocs("Stock In", "/stock/in", "stockInNo", [{ k: "godown.name", l: "Godown" }, { k: "supplier.name", l: "Supplier" }], [GODOWN, { ...SUPPLIER, req: false, l: "Supplier (optional)" }, { k: "notes", l: "Notes", type: "textarea" }, { ...QTY_LINES, cols: [...QTY_LINES.cols, { k: "unitCost", l: "Unit cost", from: "purchasePrice" }] }]),
  "stock-out": stockDocs("Stock Out", "/stock/out", "stockOutNo", [{ k: "godown.name", l: "Godown" }, { k: "reason", l: "Reason" }], [GODOWN, { k: "reason", l: "Reason", req: true }, { k: "notes", l: "Notes", type: "textarea" }, QTY_LINES]),
  "stock-transfer": {
    ...stockDocs("Stock Transfer", "/stock/transfers", "transferNo", [{ k: "fromGodown.name", l: "From" }, { k: "toGodown.name", l: "To" }, { k: "status", l: "Status", t: "badge" }], [
      { ...GODOWN, k: "fromGodownId", l: "From godown" }, { ...GODOWN, k: "toGodownId", l: "To godown" }, { k: "notes", l: "Notes", type: "textarea" }, QTY_LINES,
    ]),
    addLabel: "New transfer",
    actions: [{ l: "Cancel", danger: true, perm: "approve", show: (r) => r.status !== "CANCELLED", post: (r) => `/stock/transfers/${r.id}/cancel`, confirm: "Move this stock back to the source godown?" }],
  },
  "stock-adjustment": { ...stockDocs("Adjustments", "/stock/adjustments", "adjustmentNo", [{ k: "godown.name", l: "Godown" }, { k: "type", l: "Type", t: "badge" }, { k: "reason", l: "Reason" }, { k: "createdBy.name", l: "By" }], [GODOWN, { k: "type", l: "Type", type: "select", options: ["INCREASE", "DECREASE"], req: true }, { k: "reason", l: "Reason", req: true }, QTY_LINES]), addLabel: "New adjustment" },
  "damaged-stock": { ...stockDocs("Damaged Stock", "/stock/damaged", "damageNo", [{ k: "godown.name", l: "Godown" }, { k: "reason", l: "Reason" }], [GODOWN, { k: "reason", l: "Reason", req: true }, { k: "notes", l: "Notes", type: "textarea" }, QTY_LINES]), addLabel: "Record damage" },
  "stock-movements": {
    title: "Stock Movements", module: "stock", api: "/stock/movements", filters: [{ k: "type", l: "Type", options: ["IN", "OUT", "TRANSFER", "ADJUSTMENT", "DAMAGED", "RETURN"] }, { k: "godownId", l: "Godown", source: SRC.godowns }, ...dateFilters],
    columns: [{ k: "createdAt", l: "Time", t: "datetime" }, { k: "product.name", l: "Product" }, { k: "godown.name", l: "Godown" }, { k: "type", l: "Type", t: "badge" }, { k: "delta", l: "Change", t: "num" }, { k: "balanceAfter", l: "Balance", t: "num" }, { k: "notes", l: "Notes" }, { k: "createdBy.name", l: "By" }],
  },

  customers: {
    title: "Customers", module: "customers", api: "/customers", addLabel: "Add customer", deleteLabel: "Deactivate", wide: true,
    filters: [{ k: "active", l: "Status", options: [["true", "Active"], ["false", "Inactive"]] }, { k: "dues", l: "Balance", options: [["1", "With dues"]] }],
    columns: [{ k: "customerCode", l: "Code" }, { k: "name", l: "Name", f: (r) => `<a href="customer-details.html?id=${r.id}">${esc(r.name)}</a>`, x: (r) => r.name }, { k: "phone", l: "Contact number" }, { k: "city", l: "City" }, { k: "gstNumber", l: "GSTIN" }, { k: "balance", l: "Outstanding", t: "money" }, { k: "isActive", l: "Status", f: (r) => badge(r.isActive ? "ACTIVE" : "INACTIVE"), x: (r) => (r.isActive ? "Active" : "Inactive") }],
    form: [{ k: "name", l: "Name", req: true }, { k: "phone", l: "Contact number" }, { k: "email", l: "Email", type: "email" }, { k: "gstNumber", l: "GSTIN" }, { k: "city", l: "City" }, { k: "state", l: "State" }, { k: "pincode", l: "Pincode" }, { k: "creditLimit", l: "Credit limit", type: "number", min: 0 }, { k: "openingBalance", l: "Opening balance", type: "number" }, { k: "address", l: "Billing address", type: "textarea" }, { k: "shippingAddress", l: "Shipping address", type: "textarea" }, { k: "isActive", l: "Active", type: "check", def: true }],
  },
  "customer-details": detailPage("Customer", "customers", async (root, id, show) => {
    const c = (await api(`/customers/${id}`)).data;
    const payments = can("payments") ? (await api(`/payments?customerId=${id}&limit=50`)).data : [];
    const sales = can("sales") ? (await api(`/sales?customerId=${id}&limit=50`)).data : [];
    root.innerHTML = `<div class="page-head"><div><h1>${esc(c.name)}</h1><p>${esc(c.customerCode)} · ${esc(c.phone || "No contact number")} · ${esc(c.email || "No email")}</p></div>
      <div class="row-actions"><a class="btn" href="customer-ledger.html?id=${c.id}">Ledger</a>${can("payments", "create") ? `<button class="btn primary" data-pay>Record payment</button>` : ""}</div></div>
      <div class="grid kpis"><div class="kpi"><small>Outstanding</small><b>${fmt.money(c.balance)}</b></div><div class="kpi"><small>Credit limit</small><b>${fmt.money(c.creditLimit)}</b></div><div class="kpi"><small>GSTIN</small><b>${esc(c.gstNumber || "-")}</b></div></div>
      <div class="grid two"><div class="card"><h3>Billing address</h3>${esc(c.address || "-")}</div><div class="card"><h3>Shipping address</h3>${esc(c.shippingAddress || "-")}</div></div>
      <h2 style="margin:16px 0 8px">Sales</h2>${sales.length ? tableHtml([{ k: "saleDate", l: "Date", t: "date" }, { k: "invoiceNumber", l: "Invoice" }, { k: "totalAmount", l: "Total", t: "money" }, { k: "balanceAmount", l: "Balance", t: "money" }, { k: "status", l: "Status", t: "badge" }], sales) : stateHtml("empty", "No sales.")}
      <h2 style="margin:16px 0 8px">Payment history</h2>${payments.length ? tableHtml([{ k: "paymentDate", l: "Date", t: "date" }, { k: "paymentNumber", l: "Number" }, { k: "method", l: "Payment method" }, { k: "amount", l: "Amount", t: "money" }, { k: "status", l: "Status", t: "badge" }], payments) : stateHtml("empty", "No payments.")}`;
    $("[data-pay]", root)?.addEventListener("click", () => paymentForm("IN", { customerId: c.id }, show));
  }),
  "customer-ledger": ledgerPage("Customer Ledger", "customers", SRC.customers, "/customers", "Customer"),

  suppliers: {
    title: "Suppliers", module: "suppliers", api: "/suppliers", addLabel: "Add supplier", deleteLabel: "Deactivate", wide: true,
    filters: [{ k: "active", l: "Status", options: [["true", "Active"], ["false", "Inactive"]] }, { k: "dues", l: "Balance", options: [["1", "With dues"]] }],
    columns: [{ k: "supplierCode", l: "Code" }, { k: "name", l: "Name", f: (r) => `<a href="supplier-details.html?id=${r.id}">${esc(r.name)}</a>`, x: (r) => r.name }, { k: "contactPerson", l: "Contact" }, { k: "phone", l: "Contact number" }, { k: "gstNumber", l: "GSTIN" }, { k: "balance", l: "Payable", t: "money" }, { k: "isActive", l: "Status", f: (r) => badge(r.isActive ? "ACTIVE" : "INACTIVE"), x: (r) => (r.isActive ? "Active" : "Inactive") }],
    form: [{ k: "name", l: "Name", req: true }, { k: "contactPerson", l: "Contact person" }, { k: "phone", l: "Contact number" }, { k: "email", l: "Email", type: "email" }, { k: "gstNumber", l: "GSTIN" }, { k: "city", l: "City" }, { k: "state", l: "State" }, { k: "pincode", l: "Pincode" }, { k: "openingBalance", l: "Opening balance", type: "number" }, { k: "address", l: "Address", type: "textarea" }, { k: "isActive", l: "Active", type: "check", def: true }],
  },
  "supplier-details": detailPage("Supplier", "suppliers", async (root, id, show) => {
    const s = (await api(`/suppliers/${id}`)).data;
    const purchases = can("purchases") ? (await api(`/purchases?supplierId=${id}&limit=50`)).data : [];
    const payments = can("payments") ? (await api(`/payments?supplierId=${id}&limit=50`)).data : [];
    root.innerHTML = `<div class="page-head"><div><h1>${esc(s.name)}</h1><p>${esc(s.supplierCode)} · ${esc(s.contactPerson || "")} ${esc(s.phone || "")}</p></div>
      <div class="row-actions"><a class="btn" href="supplier-ledger.html?id=${s.id}">Ledger</a>${can("payments", "create") ? `<button class="btn primary" data-pay>Record payment</button>` : ""}</div></div>
      <div class="grid kpis"><div class="kpi"><small>Payable</small><b>${fmt.money(s.balance)}</b></div><div class="kpi"><small>GSTIN</small><b>${esc(s.gstNumber || "-")}</b></div></div>
      <h2 style="margin:16px 0 8px">Purchase history</h2>${purchases.length ? tableHtml([{ k: "purchaseDate", l: "Date", t: "date" }, { k: "purchaseNumber", l: "Number", f: (r) => `<a href="purchase-details.html?id=${r.id}">${esc(r.purchaseNumber)}</a>` }, { k: "totalAmount", l: "Total", t: "money" }, { k: "balanceAmount", l: "Balance", t: "money" }, { k: "status", l: "Status", t: "badge" }], purchases) : stateHtml("empty", "No purchases.")}
      <h2 style="margin:16px 0 8px">Payments</h2>${payments.length ? tableHtml([{ k: "paymentDate", l: "Date", t: "date" }, { k: "paymentNumber", l: "Number" }, { k: "method", l: "Payment method" }, { k: "amount", l: "Amount", t: "money" }, { k: "status", l: "Status", t: "badge" }], payments) : stateHtml("empty", "No payments.")}`;
    $("[data-pay]", root)?.addEventListener("click", () => paymentForm("OUT", { supplierId: s.id }, show));
  }),
  "supplier-ledger": ledgerPage("Supplier Ledger", "suppliers", SRC.suppliers, "/suppliers", "Supplier"),

  "new-sale": {
    module: "sales", perm: "create",
    ...billPage({
      title: "New Sale", post: "/sales", priceKey: "unitPrice", toBody: withPayment, afterSave: () => "sales.html", intro: "Prices and GST come from the product record.",
      fields: [
        { ...CUSTOMER, blank: "Walk-in customer" }, GODOWN, { k: "saleDate", l: "Sale date", type: "date", def: today() },
        { k: "paidAmount", l: "Amount received now", type: "number", min: 0 }, ...paymentMethodFields(), { k: "notes", l: "Notes", type: "textarea" },
      ],
      cols: [{ k: "productId", l: "Product" }, { k: "quantity", l: "Quantity", def: 1 }, { k: "unitPrice", l: "Price", from: "sellingPrice" }, { k: "discount", l: "Discount ₹" }],
    }),
  },
  sales: {
    title: "Sales", module: "sales", api: "/sales", addLabel: "New sale", addHref: "new-sale.html", noEdit: true,
    filters: [{ k: "status", l: "Status", options: ["CONFIRMED", "COMPLETED", "CANCELLED"] }, { k: "payment", l: "Payment", options: [["due", "With balance"]] }, ...dateFilters],
    columns: [{ k: "saleDate", l: "Date", t: "date" }, { k: "invoiceNumber", l: "Invoice" }, { k: "customer.name", l: "Customer", f: (r) => esc(r.customer?.name || "Walk-in"), x: (r) => r.customer?.name || "Walk-in" }, { k: "salesperson.name", l: "Salesperson" }, { k: "godown.name", l: "Godown" }, { k: "totalAmount", l: "Total", t: "money" }, { k: "paidAmount", l: "Paid", t: "money" }, { k: "balanceAmount", l: "Balance", t: "money" }, { k: "status", l: "Status", t: "badge" }],
    actions: [
      { l: "Invoice", module: "invoices", perm: "read", show: (r) => r.invoice, href: (r) => `invoice.html?id=${r.invoice.id}` },
      { l: "Receive", module: "payments", perm: "create", show: (r) => Number(r.balanceAmount) > 0 && r.status !== "CANCELLED", run: (r, ctx) => paymentForm("IN", { saleId: r.id, amount: r.balanceAmount }, ctx.reload) },
      { l: "Cancel", danger: true, perm: "approve", show: (r) => r.status !== "CANCELLED", post: (r) => `/sales/${r.id}/cancel`, reason: true, confirm: "Cancel this sale? Stock, ledger and payments will be reversed." },
    ],
  },
  quotations: docList("Quotations", "QUOTATION", "new-quotation.html"),
  "new-quotation": newDoc("New Quotation", "QUOTATION", "quotations.html"),
  document: detailPage("Document", "quotations", async (root, id) => {
    const [d, company] = await Promise.all([api(`/sales-documents/${id}`).then((r) => r.data), documentHeader()]);
    root.innerHTML = `<div class="page-head no-print"><a class="btn" href="quotations.html">Back</a><button class="btn" onclick="window.print()">Print</button></div>
      <div class="doc">${renderBillDoc(company, `<h2>${d.type === "QUOTATION" ? "QUOTATION" : "SALES ORDER"}</h2><div>${esc(d.documentNo)}</div><div>${fmt.date(d.documentDate)}</div>`, `<p><b>To:</b> ${esc(d.customer.name)}</p>${itemTable(d.items)}${totalsBlock(d)}${d.notes ? `<p>${esc(d.notes)}</p>` : ""}`)}</div>`;
  }),

  invoices: {
    title: "Invoices", module: "invoices", api: "/invoices", filters: [{ k: "status", l: "Status", options: ["ISSUED", "PARTIAL", "PAID", "CANCELLED"] }, { k: "outstanding", l: "Balance", options: [["1", "Outstanding"]] }, ...dateFilters],
    columns: [{ k: "invoiceDate", l: "Date", t: "date" }, { k: "invoiceNumber", l: "Invoice", f: (r) => `<a href="invoice.html?id=${r.id}">${esc(r.invoiceNumber)}</a>`, x: (r) => r.invoiceNumber }, { k: "customer.name", l: "Customer", f: (r) => esc(r.customer?.name || "Walk-in"), x: (r) => r.customer?.name || "Walk-in" }, { k: "dueDate", l: "Due", t: "date" }, { k: "totalAmount", l: "Total", t: "money" }, { k: "balanceAmount", l: "Balance", t: "money" }, { k: "status", l: "Status", f: (r) => badge(r.overdue ? "OVERDUE" : r.status), x: (r) => (r.overdue ? "OVERDUE" : r.status) }],
  },
  invoice: detailPage("Invoice", "invoices", async (root, id, show) => {
    const [inv, company] = await Promise.all([api(`/invoices/${id}`).then((r) => r.data), documentHeader()]);
    const c = inv.customer;
    const pay = can("payments", "create") && Number(inv.balanceAmount) > 0 && inv.status !== "CANCELLED";
    root.innerHTML = `<div class="page-head no-print"><a class="btn" href="invoices.html">Back</a><div class="row-actions">
      ${pay ? `<button class="btn primary" data-pay>Record payment</button>` : ""}${can("invoices", "print") ? `<button class="btn" onclick="window.print()">Print</button><a class="btn" href="${API_BASE}/api/invoices/${inv.id}/pdf">Download PDF</a>` : ""}</div></div>
      <div class="doc">${renderBillDoc(company, `<h2>TAX INVOICE</h2><div>${esc(inv.invoiceNumber)}</div><div>Date: ${fmt.date(inv.invoiceDate)}</div><div>Due: ${fmt.date(inv.dueDate)}</div><div>${badge(inv.overdue ? "OVERDUE" : inv.status)}</div>`,
        `<p><b>Bill to:</b> ${esc(c?.name || "Walk-in customer")}<br>${esc(c?.address || "")}${c?.phone ? `<br>${esc(c.phone)}` : ""}${c?.gstNumber ? `<br>GSTIN: ${esc(c.gstNumber)}` : ""}</p>
        ${itemTable(inv.sale.items)}${totalsBlock(inv, `<div><span>Paid</span><span>${fmt.money(inv.paidAmount)}</span></div><div><span>Balance</span><span>${fmt.money(inv.balanceAmount)}</span></div>`)}
        ${company.invoiceFooter ? `<p style="text-align:center;margin-top:18px">${esc(company.invoiceFooter)}</p>` : ""}`)}</div>`;
    $("[data-pay]", root)?.addEventListener("click", () => paymentForm("IN", { saleId: inv.saleId, amount: inv.balanceAmount }, show));
  }),

  "new-purchase": {
    module: "purchases", perm: "create",
    ...billPage({
      title: "New Purchase", post: "/purchases", priceKey: "unitCost", toBody: withPayment, afterSave: () => "purchases.html", intro: "Stock updates when the purchase is approved. Users with approval rights receive it immediately.",
      fields: [
        SUPPLIER, GODOWN, { k: "supplierInvoiceNo", l: "Supplier invoice number" }, { k: "purchaseDate", l: "Date", type: "date", def: today() },
        ...[{ k: "paidAmount", l: "Amount paid now", type: "number", min: 0 }, ...paymentMethodFields()].map((f) => ({ ...f, showIf: (v) => can("purchases", "approve") && (!f.showIf || f.showIf(v)) })), { k: "notes", l: "Notes", type: "textarea" },
      ],
      cols: [{ k: "productId", l: "Product" }, { k: "quantity", l: "Quantity", def: 1 }, { k: "unitCost", l: "Purchase price", from: "purchasePrice" }, { k: "discount", l: "Discount ₹" }, { k: "taxPercent", l: "GST %", from: "taxPercent" }],
    }),
  },
  purchases: {
    title: "Purchases", module: "purchases", api: "/purchases", addLabel: "New purchase", addHref: "new-purchase.html", noEdit: true,
    filters: [{ k: "status", l: "Status", options: [["DRAFT", "Awaiting approval"], "RECEIVED", "CANCELLED"] }, { k: "payment", l: "Payment", options: [["due", "With balance"]] }, ...dateFilters],
    columns: [{ k: "purchaseDate", l: "Date", t: "date" }, { k: "purchaseNumber", l: "Number", f: (r) => `<a href="purchase-details.html?id=${r.id}">${esc(r.purchaseNumber)}</a>`, x: (r) => r.purchaseNumber }, { k: "supplier.name", l: "Supplier" }, { k: "supplierInvoiceNo", l: "Supplier invoice" }, { k: "totalAmount", l: "Total", t: "money" }, { k: "paidAmount", l: "Paid", t: "money" }, { k: "balanceAmount", l: "Balance", t: "money" }, { k: "status", l: "Status", t: "badge" }],
    actions: [
      { l: "Approve", perm: "approve", show: (r) => r.status === "DRAFT", post: (r) => `/purchases/${r.id}/approve`, confirm: "Approve this purchase? Stock will be added." },
      { l: "Reject", perm: "reject", danger: true, show: (r) => r.status === "DRAFT", post: (r) => `/purchases/${r.id}/reject`, reason: true, confirm: "Reject this purchase?" },
      { l: "Pay", module: "payments", perm: "create", show: (r) => Number(r.balanceAmount) > 0 && r.status === "RECEIVED", run: (r, ctx) => paymentForm("OUT", { purchaseId: r.id, amount: r.balanceAmount }, ctx.reload) },
      { l: "Cancel", perm: "approve", danger: true, show: (r) => r.status === "RECEIVED", post: (r) => `/purchases/${r.id}/cancel`, reason: true, confirm: "Cancel this purchase? Stock, ledger and payments will be reversed." },
    ],
  },
  "purchase-details": detailPage("Purchase", "purchases", async (root, id) => {
    const p = (await api(`/purchases/${id}`)).data;
    root.innerHTML = `<div class="page-head"><div><h1>${esc(p.purchaseNumber)}</h1><p>${esc(p.supplier.name)} · ${fmt.date(p.purchaseDate)} · ${esc(p.godown?.name || "")}</p></div><div class="row-actions">${badge(p.status)}<a class="btn" href="purchases.html">Back</a></div></div>
      ${tableHtml([{ k: "name", l: "Item", f: (i) => esc(i.product.name) }, { k: "quantity", l: "Qty", t: "num" }, { k: "unitCost", l: "Cost", t: "money" }, { k: "discount", l: "Discount", t: "money" }, { k: "taxAmount", l: "GST", t: "money" }, { k: "totalAmount", l: "Total", t: "money" }], p.items)}
      ${totalsBlock(p, `<div><span>Paid</span><span>${fmt.money(p.paidAmount)}</span></div><div><span>Balance</span><span>${fmt.money(p.balanceAmount)}</span></div>`)}
      ${p.cancelReason ? `<p class="muted">Cancelled: ${esc(p.cancelReason)}</p>` : ""}`;
  }),
  "purchase-orders": {
    title: "Purchase Orders", module: "purchase_orders", api: "/purchase-orders", addLabel: "New order", addHref: "new-purchase-order.html", noEdit: true,
    filters: [{ k: "status", l: "Status", options: ["PENDING", "APPROVED", "REJECTED", "COMPLETED"] }, ...dateFilters],
    columns: [{ k: "orderDate", l: "Date", t: "date" }, { k: "orderNumber", l: "Number" }, { k: "supplier.name", l: "Supplier" }, { k: "expectedDate", l: "Expected", t: "date" }, { k: "totalAmount", l: "Total", t: "money" }, { k: "status", l: "Status", t: "badge" }],
    actions: [
      { l: "Approve", perm: "approve", show: (r) => r.status === "PENDING", post: (r) => `/purchase-orders/${r.id}/approve` },
      { l: "Reject", perm: "reject", danger: true, show: (r) => r.status === "PENDING", post: (r) => `/purchase-orders/${r.id}/reject` },
    ],
  },
  "new-purchase-order": {
    module: "purchase_orders", perm: "create",
    ...billPage({
      title: "New Purchase Order", post: "/purchase-orders", priceKey: "unitCost", afterSave: () => "purchase-orders.html", showDiscount: false,
      fields: [SUPPLIER, { k: "expectedDate", l: "Expected date", type: "date" }, { k: "notes", l: "Notes", type: "textarea" }],
      cols: [{ k: "productId", l: "Product" }, { k: "quantity", l: "Quantity", def: 1 }, { k: "unitCost", l: "Purchase price", from: "purchasePrice" }, { k: "taxPercent", l: "GST %", from: "taxPercent" }],
    }),
  },

  payments: {
    title: "Payments", module: "payments", api: "/payments", addLabel: "Record payment", noEdit: true,
    filters: [{ k: "direction", l: "Type", options: [["IN", "Received"], ["OUT", "Paid"]] }, { k: "method", l: "Payment method", options: METHODS }, { k: "status", l: "Status", options: ["PAID", "CANCELLED"] }, ...dateFilters],
    columns: [{ k: "paymentDate", l: "Date", t: "date" }, { k: "paymentNumber", l: "Number" }, { k: "direction", l: "Type", t: "badge" }, { k: "party", l: "Customer / supplier", f: (r) => esc(r.customer?.name || r.supplier?.name || "Walk-in"), x: (r) => r.customer?.name || r.supplier?.name || "Walk-in" }, { k: "doc", l: "For bill", f: (r) => esc(r.sale?.invoiceNumber || r.purchase?.purchaseNumber || "Advance"), x: (r) => r.sale?.invoiceNumber || r.purchase?.purchaseNumber || "Advance" }, { k: "method", l: "Payment method" }, { k: "amount", l: "Amount", t: "money" }, { k: "status", l: "Status", t: "badge" }, { k: "receipt", l: "Receipt", f: (r) => (r.receipt && can("receipts") ? `<a href="receipt.html?id=${r.receipt.id}">${esc(r.receipt.receiptNumber)}</a>` : ""), x: (r) => r.receipt?.receiptNumber || "" }],
    toBody: withPayment,
    form: [{ k: "direction", l: "Type", type: "select", options: [["IN", "Received from customer"], ["OUT", "Paid to supplier"]], req: true, def: "IN" }, { ...CUSTOMER, req: true, showIf: (v) => v.direction === "IN" }, { ...SUPPLIER, showIf: (v) => v.direction === "OUT" }, { k: "amount", l: "Amount", type: "number", req: true, min: 0.01 }, ...paymentMethodFields({ req: true }), { k: "paymentDate", l: "Date", type: "date", def: today() }, { k: "notes", l: "Notes", type: "textarea" }],
    actions: [{ l: "Cancel", danger: true, perm: "approve", show: (r) => r.status !== "CANCELLED", post: (r) => `/payments/${r.id}/cancel`, reason: true, confirm: "Cancel this payment and reverse it?" }],
  },
  receipts: {
    title: "Receipts", module: "receipts", api: "/receipts", noEdit: true, filters: dateFilters, intro: "Receipts are created automatically when a customer payment is recorded.",
    columns: [{ k: "receiptDate", l: "Date", t: "date" }, { k: "receiptNumber", l: "Number", f: (r) => `<a href="receipt.html?id=${r.id}">${esc(r.receiptNumber)}</a>`, x: (r) => r.receiptNumber }, { k: "customer.name", l: "Customer" }, { k: "method", l: "Payment method" }, { k: "reference", l: "Reference" }, { k: "amount", l: "Amount", t: "money" }, { k: "payment.status", l: "Status", t: "badge" }],
  },
  receipt: detailPage("Receipt", "receipts", async (root, id) => {
    const [r, company] = await Promise.all([api(`/receipts/${id}`).then((x) => x.data), documentHeader()]);
    root.innerHTML = `<div class="page-head no-print"><a class="btn" href="payments.html">Back</a><button class="btn" onclick="window.print()">Print</button></div>
      <div class="doc">${renderBillDoc(company, `<h2>PAYMENT RECEIPT</h2><div>${esc(r.receiptNumber)}</div><div>${fmt.date(r.receiptDate)}</div>`,
        `<p>Received from <b>${esc(r.customer.name)}</b> the sum of <b>${fmt.money(r.amount)}</b> by ${esc(fmt.label(r.method))}${r.payment?.sale ? ` against invoice ${esc(r.payment.sale.invoiceNumber)}` : ""}.</p>${r.reference ? `<p>Reference: ${esc(r.reference)}</p>` : ""}`)}</div>`;
  }),
  expenses: {
    title: "Expenses", module: "expenses", api: "/expenses", addLabel: "Add expense", canEdit: (r) => r.status === "PENDING",
    filters: [{ k: "status", l: "Status", options: ["PENDING", "APPROVED", "PAID", "CANCELLED"] }, ...dateFilters],
    columns: [{ k: "expenseDate", l: "Date", t: "date" }, { k: "expenseNumber", l: "Number" }, { k: "category", l: "Category" }, { k: "description", l: "Description" }, { k: "method", l: "Payment method" }, { k: "amount", l: "Amount", t: "money" }, { k: "status", l: "Status", t: "badge" }, { k: "createdBy.name", l: "By" }],
    form: [{ k: "category", l: "Category", req: true }, { k: "amount", l: "Amount", type: "number", req: true, min: 0.01 }, { k: "method", l: "Payment method", type: "select", options: METHODS, req: true, def: "CASH" }, { k: "expenseDate", l: "Date", type: "date", def: today() }, { k: "description", l: "Description", type: "textarea" }],
    actions: [
      { l: "Approve", perm: "approve", show: (r) => r.status === "PENDING", post: (r) => `/expenses/${r.id}/approve` },
      { l: "Reject", perm: "reject", danger: true, show: (r) => r.status === "PENDING", post: (r) => `/expenses/${r.id}/reject` },
      { l: "Mark paid", perm: "approve", show: (r) => r.status === "APPROVED", post: (r) => `/expenses/${r.id}/pay` },
    ],
  },
  income: {
    title: "Income", module: "income", api: "/income", addLabel: "Add income", filters: dateFilters,
    columns: [{ k: "incomeDate", l: "Date", t: "date" }, { k: "incomeNumber", l: "Number" }, { k: "source", l: "Source" }, { k: "description", l: "Description" }, { k: "method", l: "Payment method" }, { k: "amount", l: "Amount", t: "money" }],
    form: [{ k: "source", l: "Source", req: true }, { k: "amount", l: "Amount", type: "number", req: true, min: 0.01 }, { k: "method", l: "Payment method", type: "select", options: METHODS, req: true, def: "CASH" }, { k: "incomeDate", l: "Date", type: "date", def: today() }, { k: "description", l: "Description", type: "textarea" }],
  },
  cashbook: {
    title: "Cash & Bank", module: "finance", api: "/finance/cashbook", noSearch: true, intro: "Built from payments, paid expenses, income and paid salaries.",
    filters: [{ k: "account", l: "Account", options: [["cash", "Cash"], ["bank", "Bank and digital"]] }, ...dateFilters],
    summary: (s) => `<div class="grid kpis" style="margin-bottom:12px"><div class="kpi"><small>Money in</small><b>${fmt.money(s.totalIn)}</b></div><div class="kpi"><small>Money out</small><b>${fmt.money(s.totalOut)}</b></div><div class="kpi"><small>Net cash flow</small><b>${fmt.money(s.net)}</b></div></div>`,
    columns: [{ k: "date", l: "Date", t: "date" }, { k: "reference", l: "Reference" }, { k: "description", l: "Description" }, { k: "method", l: "Payment method" }, { k: "inflow", l: "In", t: "money" }, { k: "outflow", l: "Out", t: "money" }],
  },
  outstanding: {
    title: "Payments Due", module: "finance",
    render(root) {
      root.innerHTML = `<div class="page-head"><div><h1>Payments Due</h1><p>Money to collect from customers and to pay to suppliers.</p></div><div class="row-actions"><button class="btn primary" data-wa>Send WhatsApp reminder</button></div></div><div data-r></div>`;
      $("[data-wa]", root).addEventListener("click", () => whatsAppReminder());
      reportView($("[data-r]", root), "outstanding", "outstanding", {
        noDates: true,
        rowAction: {
          empty: "No payments are due.",
          html: (r, i) => (r.type === "To collect" ? `<button class="btn sm" data-row="${i}">WhatsApp reminder</button>` : ""),
          run: (r) => whatsAppReminder({ name: r.name, amount: r.balance, phone: r.phone }),
        },
      });
    },
  },
  "profit-loss": reportPage("Profit & Loss", "profit-loss", "profit-loss", "finance"),
  "financial-reports": reportPage("Financial Reports", "profit-loss", null),
  reports: reportPage("Reports", "sales", null),
  "sales-reports": reportPage("Sales Reports", "sales", "sales"),
  "purchase-reports": reportPage("Purchase Reports", "purchases", "purchases"),
  "stock-reports": reportPage("Stock Reports", "stock", "stock"),

  employees: {
    title: "Employees", module: "employees", api: "/employees", addLabel: "Add employee", deleteLabel: "Deactivate", wide: true,
    filters: [{ k: "status", l: "Status", options: ["ACTIVE", "ON_LEAVE", "INACTIVE"] }],
    columns: [{ k: "employeeCode", l: "Code" }, { k: "name", l: "Name" }, { k: "department", l: "Department" }, { k: "designation", l: "Designation" }, { k: "phone", l: "Contact number" }, { k: "joiningDate", l: "Joined", t: "date" }, { k: "salary", l: "Salary", t: "money" }, { k: "status", l: "Status", t: "badge" }],
    form: [{ k: "name", l: "Name", req: true }, { k: "phone", l: "Contact number" }, { k: "email", l: "Email", type: "email" }, { k: "department", l: "Department" }, { k: "designation", l: "Designation" }, { k: "joiningDate", l: "Joining date", type: "date" }, { k: "salary", l: "Monthly salary", type: "number", min: 0 }, { k: "status", l: "Status", type: "select", options: ["ACTIVE", "ON_LEAVE", "INACTIVE"], def: "ACTIVE" }, { k: "address", l: "Address", type: "textarea" }],
  },
  attendance: {
    title: "Attendance", module: "attendance",
    render(root) {
      root.innerHTML = `<div class="page-head"><h1>Attendance</h1><div class="row-actions">${can("attendance", "create") ? `<button class="btn primary" data-save>Save attendance</button>` : ""}</div></div>
        <div class="toolbar"><div><label>Date</label><input type="date" data-date value="${today()}"></div></div><div data-t></div>`;
      const box = $("[data-t]", root);
      const STATUS = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "HOLIDAY"];
      let rows = [];
      const load = async () => {
        box.innerHTML = stateHtml("loading");
        try {
          rows = (await api(`/attendance/day?date=${$("[data-date]", root).value}`)).data;
          box.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Code</th><th>Employee</th><th>Department</th><th>Status</th><th>In</th><th>Out</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${esc(r.employeeCode)}</td><td>${esc(r.name)}</td><td>${esc(r.department)}</td>
            <td><select aria-label="Status for ${esc(r.name)}" data-s="${i}">${STATUS.map((s) => `<option value="${s}" ${(r.attendance?.status || "PRESENT") === s ? "selected" : ""}>${esc(fmt.label(s))}</option>`).join("")}</select></td>
            <td><input type="time" aria-label="In" data-in="${i}" value="${esc(r.attendance?.checkIn || "")}"></td><td><input type="time" aria-label="Out" data-out="${i}" value="${esc(r.attendance?.checkOut || "")}"></td></tr>`).join("")}</tbody></table></div>` : stateHtml("empty", "Add employees first.");
        } catch (error) { box.innerHTML = stateHtml("error", error.message); }
      };
      $("[data-date]", root).addEventListener("change", load);
      root.addEventListener("click", async (e) => {
        if (e.target.dataset.retry !== undefined) load();
        if (e.target.dataset.save === undefined || !rows.length) return;
        const body = { date: $("[data-date]", root).value, rows: rows.map((r, i) => ({ employeeId: r.id, status: $(`[data-s="${i}"]`, root).value, checkIn: $(`[data-in="${i}"]`, root).value, checkOut: $(`[data-out="${i}"]`, root).value })) };
        try { toast((await api("/attendance/bulk", { method: "POST", body })).message); }
        catch (error) { toast(error.message, true); }
      });
      load();
    },
  },
  leave: {
    title: "Leave", module: "leave", api: "/leave", addLabel: "New request", noEdit: true, filters: [{ k: "status", l: "Status", options: ["PENDING", "APPROVED", "REJECTED"] }],
    columns: [{ k: "employee.name", l: "Employee" }, { k: "leaveType", l: "Type" }, { k: "fromDate", l: "From", t: "date" }, { k: "toDate", l: "To", t: "date" }, { k: "days", l: "Days", t: "num" }, { k: "reason", l: "Reason" }, { k: "status", l: "Status", t: "badge" }, { k: "approvedBy.name", l: "Decided by" }],
    form: [EMPLOYEE, { k: "leaveType", l: "Leave type", type: "select", options: ["Casual", "Sick", "Earned", "Unpaid"], req: true }, { k: "fromDate", l: "From", type: "date", req: true }, { k: "toDate", l: "To", type: "date", req: true }, { k: "reason", l: "Reason", type: "textarea" }],
    actions: [
      { l: "Approve", perm: "approve", show: (r) => r.status === "PENDING", post: (r) => `/leave/${r.id}/approve` },
      { l: "Reject", perm: "reject", danger: true, show: (r) => r.status === "PENDING", post: (r) => `/leave/${r.id}/reject` },
    ],
  },
  payroll: {
    title: "Payroll", module: "payroll", api: "/payroll", noSearch: true, canEdit: (r) => r.status === "DRAFT",
    filters: [{ k: "status", l: "Status", options: ["DRAFT", "APPROVED", "PAID", "CANCELLED"] }],
    columns: [{ k: "period", l: "Period", f: (r) => `${r.month}/${r.year}`, x: (r) => `${r.month}/${r.year}` }, { k: "employee.name", l: "Employee" }, { k: "basic", l: "Basic", t: "money" }, { k: "allowances", l: "Allowances", t: "money" }, { k: "deductions", l: "Deductions", t: "money" }, { k: "netPay", l: "Net pay", t: "money" }, { k: "status", l: "Status", t: "badge" }],
    form: [{ k: "allowances", l: "Allowances", type: "number", min: 0 }, { k: "deductions", l: "Deductions", type: "number", min: 0 }, { k: "method", l: "Payment method", type: "select", options: METHODS }, { k: "notes", l: "Notes", type: "textarea" }],
    noCreate: true,
    tools: [{
      l: "Generate payroll", perm: "create",
      run: ({ reload }) => openForm({
        title: "Generate payroll",
        fields: [{ k: "month", l: "Month", type: "number", req: true, min: 1, def: new Date().getMonth() + 1 }, { k: "year", l: "Year", type: "number", req: true, def: new Date().getFullYear() }],
        submit: (d) => api("/payroll/generate", { method: "POST", body: d }), onDone: reload,
      }),
    }],
    actions: [
      { l: "Approve", perm: "approve", show: (r) => r.status === "DRAFT", post: (r) => `/payroll/${r.id}/approve` },
      { l: "Mark paid", perm: "approve", show: (r) => r.status === "APPROVED", post: (r) => `/payroll/${r.id}/pay` },
      { l: "Cancel", perm: "reject", danger: true, show: (r) => ["DRAFT", "APPROVED"].includes(r.status), post: (r) => `/payroll/${r.id}/reject` },
    ],
  },

  settings: {
    title: "Settings", module: "settings",
    async render(root) {
      root.innerHTML = stateHtml("loading");
      const load = async () => {
        let s;
        try { s = (await api("/settings")).data; }
        catch (error) { root.innerHTML = stateHtml("error", error.message); return; }
        const groups = [
          ["Company", [{ k: "companyName", l: "Company name", req: true }, { k: "legalName", l: "Legal name" }, { k: "gstin", l: "GSTIN" }, { k: "pan", l: "PAN" }, { k: "phone", l: "Contact number" }, { k: "email", l: "Email" }, { k: "website", l: "Website" }, { k: "address", l: "Address", type: "textarea" }]],
          ["Billing", [{ k: "invoicePrefix", l: "Invoice prefix", req: true }, { k: "purchasePrefix", l: "Purchase prefix", req: true }, { k: "tax", l: "Default tax %", type: "number", min: 0 }, { k: "dueDays", l: "Invoice due days", type: "number", min: 0 }, { k: "paymentMode", l: "Default payment mode", type: "select", options: METHODS }, { k: "currency", l: "Currency" }, { k: "invoiceFooter", l: "Invoice footer", type: "textarea" }]],
          ["Regional", [{ k: "dateFormat", l: "Date format", type: "select", options: [["DD-MM-YYYY", "DD-MM-YYYY"], ["YYYY-MM-DD", "YYYY-MM-DD"], ["MM-DD-YYYY", "MM-DD-YYYY"]] }, { k: "timezone", l: "Timezone" }, { k: "pageSize", l: "Rows per page", type: "number", min: 5 }]],
          ["Notifications", [{ k: "lowStockAlert", l: "Low stock alerts", type: "check" }, { k: "saleAlert", l: "Sale alerts", type: "check" }, { k: "purchaseAlert", l: "Purchase alerts", type: "check" }, { k: "paymentAlert", l: "Payment alerts", type: "check" }, { k: "expenseAlert", l: "Expense alerts", type: "check" }]],
          ["Security", [{ k: "maxLoginAttempts", l: "Failed logins before lock", type: "number", min: 3 }, { k: "sessionHours", l: "Session length (hours)", type: "number", min: 1 }]],
          ["Backup", [{ k: "backupEnabled", l: "Daily automatic backup", type: "check" }, { k: "backupKeepCount", l: "Backups to keep", type: "number", min: 1 }]],
        ];
        root.innerHTML = `<div class="page-head"><h1>Settings</h1>${can("settings", "update") ? `<button class="btn primary" data-save>Save settings</button>` : ""}</div>` +
          groups.map(([t], i) => `<div class="card" style="margin-bottom:14px"><h2 style="margin-bottom:10px">${esc(t)}</h2><div data-g="${i}"></div></div>`).join("");
        const forms = groups.map(([, fields], i) => buildForm($(`[data-g="${i}"]`, root), fields, s));
        $("[data-save]", root)?.addEventListener("click", async () => {
          const body = Object.assign({}, ...forms.map((f) => f.read()));
          if (!forms.every((f) => f.validate(f.read()))) return toast("Fill in the required fields", true);
          try { toast((await api("/settings", { method: "PUT", body })).message); }
          catch (error) { forms.forEach((f) => f.showErrors(error)); toast(error.message, true); }
        });
      };
      root.addEventListener("click", (e) => { if (e.target.dataset.retry !== undefined) load(); });
      load();
    },
  },
  backup: {
    title: "Backup", module: "backup", api: "/backup", noSearch: true, noCreate: true,
    intro: "Backups are stored in backend/backups. Restoring is done from the server with npm run restore.",
    columns: [{ k: "createdAt", l: "Created", t: "datetime" }, { k: "fileName", l: "File" }, { k: "sizeBytes", l: "Size", f: (r) => `${(r.sizeBytes / 1024).toFixed(1)} KB`, x: (r) => r.sizeBytes }, { k: "rowCount", l: "Rows", t: "num" }, { k: "createdBy.name", l: "By", f: (r) => esc(r.createdBy?.name || "Automatic"), x: (r) => r.createdBy?.name || "Automatic" }],
    tools: [{ l: "Create backup now", perm: "create", run: async ({ reload }) => { try { toast((await api("/backup", { method: "POST" })).message); reload(); } catch (error) { toast(error.message, true); } } }],
    actions: [{ l: "Download", perm: "export", href: (r) => `${API_BASE}/api/backup/${r.id}/download` }],
  },
  profile: {
    title: "My Profile",
    render(root) {
      const u = ERP.user;
      root.innerHTML = `<div class="page-head"><div><h1>My Profile</h1><p>${esc(u.name)} · ${esc(fmt.label(u.role))}</p></div></div>
        ${u.mustChangePassword ? `<div class="notice">Please set a new password to continue.</div>` : ""}<div class="card" style="max-width:520px"><h2 style="margin-bottom:10px">Change password</h2><div data-f></div><button class="btn primary" data-save style="margin-top:12px">Change password</button></div>`;
      const fields = [{ k: "currentPassword", l: "Current password", type: "password", req: true }, { k: "newPassword", l: "New password (8+ with upper, lower, number)", type: "password", req: true, full: true }];
      const form = buildForm($("[data-f]", root), fields);
      $("[data-save]", root).addEventListener("click", async () => {
        const data = form.read();
        if (!form.validate(data)) return;
        try {
          toast((await api("/auth/change-password", { method: "POST", body: data })).message);
          setTimeout(() => (location.href = ERP.landingPage()), 700);
        } catch (error) { form.showErrors(error); toast(error.message, true); }
      });
    },
  },
};

function docList(title, type, addHref) {
  return {
    title, module: "quotations", api: "/sales-documents", params: { type }, addLabel: "New", addHref, noEdit: true,
    filters: [{ k: "status", l: "Status", options: ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "CONVERTED", "CANCELLED"] }, ...dateFilters],
    columns: [{ k: "documentDate", l: "Date", t: "date" }, { k: "documentNo", l: "Number", f: (r) => `<a href="document.html?id=${r.id}">${esc(r.documentNo)}</a>`, x: (r) => r.documentNo }, { k: "customer.name", l: "Customer" }, { k: "validUntil", l: "Valid until", t: "date" }, { k: "totalAmount", l: "Total", t: "money" }, { k: "status", l: "Status", t: "badge" }],
    actions: [
      { l: "Sent", perm: "update", show: (r) => r.status === "DRAFT", run: (r, c) => setDocStatus(r, "SENT", c) },
      { l: "Accepted", perm: "update", show: (r) => ["DRAFT", "SENT"].includes(r.status), run: (r, c) => setDocStatus(r, "ACCEPTED", c) },
      { l: "Reject", perm: "update", danger: true, show: (r) => ["DRAFT", "SENT"].includes(r.status), run: (r, c) => setDocStatus(r, "REJECTED", c) },
      {
        l: "Convert to sale", module: "sales", perm: "create", show: (r) => ["DRAFT", "SENT", "ACCEPTED"].includes(r.status),
        run: (r, c) => openForm({
          title: `Convert ${r.documentNo} to sale`, row: { godownId: r.godownId },
          fields: [GODOWN, { k: "paidAmount", l: "Amount paid now", type: "number", min: 0 }, { k: "method", l: "Payment method", type: "select", options: METHODS, def: "CASH" }],
          submit: (d) => api(`/sales-documents/${r.id}/convert`, { method: "POST", body: d }), onDone: c.reload,
        }),
      },
    ],
  };
}

async function setDocStatus(row, status, ctx) {
  try {
    toast((await api(`/sales-documents/${row.id}/status`, { method: "POST", body: { status } })).message);
    ctx.reload();
  } catch (error) { toast(error.message, true); }
}

function newDoc(title, type, back) {
  return {
    module: "quotations", perm: "create",
    ...billPage({
      title, post: "/sales-documents", priceKey: "unitPrice", afterSave: () => back, toBody: (d) => ({ ...d, type }),
      fields: [{ ...CUSTOMER, req: true }, { ...GODOWN, req: false, l: "Godown (optional)" }, { k: "documentDate", l: "Date", type: "date", def: today() }, { k: "validUntil", l: "Valid until", type: "date" }, { k: "notes", l: "Notes", type: "textarea" }],
      cols: [{ k: "productId", l: "Product" }, { k: "quantity", l: "Quantity", def: 1 }, { k: "unitPrice", l: "Price", from: "sellingPrice" }, { k: "discount", l: "Discount ₹" }],
    }),
  };
}
