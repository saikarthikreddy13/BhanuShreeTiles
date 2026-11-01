(() => {
// Shared ERP engine: API calls, session, sidebar, tables, forms, dialogs.
const API_BASE = location.port === "5001" || !location.port ? "" : `${location.protocol}//${location.hostname}:5001`;
const ROLE_NAMES = { SUPER_ADMIN: "Managing Director", ADMIN: "Deputy Director" };

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const get = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);

const fmt = {
  money: (v) => `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  num: (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }),
  date: (v) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""),
  datetime: (v) => (v ? new Date(v).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""),
  label: (v) => ROLE_NAMES[v] || String(v ?? "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
};

const BADGES = {
  good: ["ACTIVE", "PAID", "APPROVED", "CONFIRMED", "COMPLETED", "RECEIVED", "PRESENT", "ACCEPTED", "CONVERTED", "IN", "Yes"],
  bad: ["INACTIVE", "CANCELLED", "REJECTED", "SUSPENDED", "OVERDUE", "ABSENT", "OUT", "No"],
  warn: ["PENDING", "PARTIAL", "DRAFT", "ON_LEAVE", "HALF_DAY", "LEAVE"],
};
const badge = (v) => {
  const cls = Object.keys(BADGES).find((k) => BADGES[k].includes(v)) || "info";
  return v === null || v === undefined || v === "" ? "" : `<span class="badge ${cls}">${esc(fmt.label(v))}</span>`;
};

async function api(path, { method = "GET", body, form } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    const error = new Error("Cannot reach the server. Check that the backend is running.");
    error.offline = true;
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && !location.pathname.endsWith("login.html")) {
    location.href = `login.html?next=${encodeURIComponent(location.pathname.split("/").pop() + location.search)}`;
    return new Promise(() => {});
  }
  if (!response.ok || payload.success === false) {
    if (response.status === 403 && /change your password/i.test(payload.message || "") && !location.pathname.endsWith("profile.html")) {
      location.href = "profile.html";
      return new Promise(() => {});
    }
    const error = new Error(payload.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.errors = payload.errors;
    throw error;
  }
  return payload;
}

let currentUser = null;
const can = (module, action = "read") => Boolean(currentUser?.isSuperAdmin || currentUser?.permissions?.[module]?.includes(action));

// A field or filter fed by a list the user cannot read is left out, instead of asking and being refused.
const SOURCE_MODULES = ["categories", "brands", "godowns", "customers", "suppliers", "employees"];
const sourceAllowed = (f) => {
  const module = f.source && SOURCE_MODULES.find((m) => f.source.startsWith(`/${m}`));
  return !module || can(module);
};

function toast(message, bad = false) {
  let box = $(".toasts");
  if (!box) {
    box = document.createElement("div");
    box.className = "toasts";
    box.setAttribute("role", "status");
    document.body.append(box);
  }
  const el = document.createElement("div");
  el.className = `toast${bad ? " bad" : ""}`;
  el.textContent = message;
  box.append(el);
  setTimeout(() => el.remove(), bad ? 6000 : 3500);
}

function modal({ title, body, wide, submitLabel = "Save", onSubmit, hideSubmit }) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `<form class="modal${wide ? " wide" : ""}" novalidate>
    <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="btn sm" data-close>Close</button></div>
    <div class="modal-body"></div>
    <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button>${hideSubmit ? "" : `<button class="btn primary">${esc(submitLabel)}</button>`}</div>
  </form>`;
  const form = $("form", overlay);
  const content = $(".modal-body", overlay);
  if (typeof body === "string") content.innerHTML = body;
  else content.append(body);
  const close = () => overlay.remove();
  $$("[data-close]", overlay).forEach((b) => b.addEventListener("click", close));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!onSubmit) return close();
    const button = $(".btn.primary", overlay);
    button.disabled = true;
    try {
      await onSubmit(close);
    } finally {
      button.disabled = false;
    }
  });
  document.body.append(overlay);
  return { overlay, close };
}

function confirmDialog(message, { title = "Please confirm", action = "Confirm", reason = false } = {}) {
  return new Promise((resolve) => {
    const body = `<p>${esc(message)}</p>${reason ? `<div class="field"><label>Reason <span class="req">*</span></label><textarea name="reason" rows="2"></textarea><div class="err"></div></div>` : ""}`;
    const m = modal({
      title, body, submitLabel: action,
      onSubmit: (close) => {
        if (reason) {
          const value = $("[name=reason]", m.overlay).value.trim();
          if (value.length < 3) {
            $(".err", m.overlay).textContent = "Enter a reason";
            return;
          }
          close();
          return resolve(value);
        }
        close();
        resolve(true);
      },
    });
    $$("[data-close]", m.overlay).forEach((b) => b.addEventListener("click", () => resolve(false)));
  });
}

const sourceCache = new Map();
async function loadSource(url) {
  if (!sourceCache.has(url)) sourceCache.set(url, api(url).then((r) => r.data));
  return sourceCache.get(url).catch((error) => {
    sourceCache.delete(url);
    throw error;
  });
}

const FIELD_INPUT = {
  textarea: (f, v) => `<textarea name="${f.k}" rows="${f.rows || 2}">${esc(v)}</textarea>`,
  number: (f, v) => `<input type="number" step="${f.step || "any"}" min="${f.min ?? ""}" name="${f.k}" value="${esc(v)}">`,
  date: (f, v) => `<input type="date" name="${f.k}" value="${esc(v ? String(v).slice(0, 10) : "")}">`,
  password: (f) => `<input type="password" name="${f.k}" autocomplete="new-password">`,
  email: (f, v) => `<input type="email" name="${f.k}" value="${esc(v)}">`,
};

function renderField(f, value) {
  const v = value ?? f.def ?? "";
  const label = `<label>${esc(f.l)}${f.req ? ' <span class="req">*</span>' : ""}</label>`;
  const cls = `field${f.full || f.type === "textarea" || f.type === "lines" ? " full" : ""}`;
  if (f.type === "check") {
    return `<div class="${cls} check"><input type="checkbox" id="f-${f.k}" name="${f.k}" ${value ?? f.def ? "checked" : ""}><label for="f-${f.k}">${esc(f.l)}</label></div>`;
  }
  if (f.type === "select") {
    const opts = (f.options || []).map((o) => {
      const [val, text] = Array.isArray(o) ? o : [o, fmt.label(o)];
      return `<option value="${esc(val)}" ${String(val) === String(v) ? "selected" : ""}>${esc(text)}</option>`;
    });
    const quick = f.quick && can(f.quick.module, "create") ? `<button type="button" class="add-link" data-quick="${f.k}">+ Add new ${esc(f.quick.name)}</button>` : "";
    return `<div class="${cls}" data-field="${f.k}">${label}<select name="${f.k}" data-value="${esc(v)}"><option value="">${f.source ? "Loading..." : "Select"}</option>${opts.join("")}</select>${quick}<div class="err"></div></div>`;
  }
  if (f.type === "lines") return `<div class="${cls}" data-field="${f.k}">${label}<div class="lines-box"></div><div class="err"></div></div>`;
  const input = (FIELD_INPUT[f.type] || ((x, val) => `<input type="text" name="${x.k}" value="${esc(val)}">`))(f, v);
  return `<div class="${cls}" data-field="${f.k}">${label}${input}<div class="err"></div></div>`;
}

async function fillSource(root, f) {
  const select = $(`select[name="${f.k}"]`, root);
  if (!select) return;
  try {
    const rows = await loadSource(f.source);
    const wanted = select.dataset.value;
    const noun = f.quick?.name || f.l.toLowerCase();
    const blank = rows.length ? f.blank || `Select ${noun}` : f.blank || `No ${noun} added yet`;
    select.innerHTML = `<option value="">${esc(blank)}</option>` + rows
      .map((r) => {
        const text = f.text ? f.text(r) : r.name;
        const val = r[f.valueKey || "id"];
        return `<option value="${esc(val)}" ${String(val) === wanted ? "selected" : ""}>${esc(text)}</option>`;
      })
      .join("");
  } catch (error) {
    select.innerHTML = `<option value="">Could not load options</option>`;
    toast(error.message, true);
  }
}

// Line-item editor used by sales, purchases and stock documents.
let pickerCount = 0;
function linesEditor(box, f) {
  const cols = f.cols;
  const listId = `products-${++pickerCount}`;
  let products = [];
  const labels = new Map();
  const labelFor = (p) => [p.name, p.size, p.sku].filter(Boolean).join(" · ");
  const onChange = () => f.onChange?.(readLines());

  const cell = (c) => {
    if (c.k === "productId") {
      return `<input data-pick list="${listId}" placeholder="Type tile name, size or code" autocomplete="off"><input type="hidden" data-c="productId">`;
    }
    return `<input type="number" step="any" min="0" data-c="${c.k}" value="${esc(c.def ?? "")}">`;
  };

  box.innerHTML = `<div class="table-wrap"><table class="lines"><thead><tr>${cols.map((c) => `<th>${esc(c.l)}</th>`).join("")}<th></th></tr></thead><tbody></tbody></table></div>
    <datalist id="${listId}"></datalist>
    <button type="button" class="btn sm" data-add style="margin-top:8px">Add another product</button>`;
  const tbody = $("tbody", box);

  function addRow() {
    const tr = document.createElement("tr");
    tr.innerHTML = cols.map((c) => `<td>${cell(c)}</td>`).join("") + `<td><button type="button" class="btn sm danger" data-del>Remove</button></td>`;
    tbody.append(tr);
    return tr;
  }

  function readLines() {
    return $$("tr", tbody).map((tr) => {
      const row = {};
      $$("[data-c]", tr).forEach((el) => { if (el.value !== "") row[el.dataset.c] = el.value; });
      return row;
    }).filter((r) => r.productId);
  }

  // Only an exact choice from the list counts, so a half-typed name never saves a wrong tile.
  const pick = (input) => {
    const tr = input.closest("tr");
    const product = labels.get(input.value);
    const hidden = $('[data-c="productId"]', tr);
    if (String(product?.id ?? "") === hidden.value) return;
    hidden.value = product?.id ?? "";
    if (!product) return;
    for (const c of cols) {
      if (!c.from) continue;
      const field = $(`[data-c="${c.k}"]`, tr);
      if (field) field.value = product[c.from] ?? "";
    }
  };
  const edited = (event) => {
    if (event.target.dataset.pick !== undefined) pick(event.target);
    onChange();
  };
  tbody.addEventListener("change", edited);
  tbody.addEventListener("input", edited);
  box.addEventListener("click", (event) => {
    if (event.target.dataset.add !== undefined) addRow();
    if (event.target.dataset.del !== undefined) {
      event.target.closest("tr").remove();
      onChange();
    }
  });

  const ready = loadSource("/products/options")
    .then((rows) => {
      products = rows;
      for (const p of rows) labels.set(labelFor(p), p);
      $(`#${listId}`, box).innerHTML = rows.map((p) => `<option value="${esc(labelFor(p))}"></option>`).join("");
      addRow();
    })
    .catch((error) => toast(error.message, true));

  return {
    read: readLines,
    product: (id) => products.find((p) => String(p.id) === String(id)),
    setRows: async (rows) => {
      await ready;
      tbody.innerHTML = "";
      for (const row of rows) {
        const tr = addRow();
        for (const [k, v] of Object.entries(row)) {
          const el = $(`[data-c="${k}"]`, tr);
          if (el) el.value = v ?? "";
          if (k === "productId") {
            const product = products.find((p) => String(p.id) === String(v));
            if (product) $("[data-pick]", tr).value = labelFor(product);
          }
        }
      }
      onChange();
    },
  };
}

// Renders fields into root and returns helpers to read and show errors.
function buildForm(root, allFields, row = {}) {
  const fields = allFields.filter(sourceAllowed);
  root.innerHTML = `<div class="form-grid">${fields.map((f) => renderField(f, get(row, f.k))).join("")}</div>`;
  fields.filter((f) => f.source).forEach((f) => fillSource(root, f));
  const editors = {};
  for (const f of fields.filter((x) => x.type === "lines")) {
    editors[f.k] = linesEditor($(`[data-field="${f.k}"] .lines-box`, root), f);
  }
  const collect = () => {
    const data = {};
    for (const f of fields) {
      if (f.type === "lines") data[f.k] = editors[f.k].read();
      else if (f.type === "check") data[f.k] = $(`[name="${f.k}"]`, root).checked;
      else data[f.k] = $(`[name="${f.k}"]`, root).value.trim();
    }
    return data;
  };
  const shown = (f, data) => !f.showIf || f.showIf(data);
  const syncFields = () => {
    const data = collect();
    fields.filter((f) => f.showIf).forEach((f) => { $(`[data-field="${f.k}"]`, root).hidden = !shown(f, data); });
  };
  root.addEventListener("change", syncFields);
  root.addEventListener("input", syncFields);
  syncFields();
  root.addEventListener("click", (event) => {
    const key = event.target.dataset?.quick;
    if (!key) return;
    const f = fields.find((x) => x.k === key);
    const cfg = window.ERP_PAGES[f.quick.page];
    openForm({
      title: cfg.addLabel, fields: cfg.form, wide: cfg.wide,
      submit: (body) => api(cfg.api.split("?")[0], { method: "POST", body: cfg.toBody ? cfg.toBody(body) : body }),
      onDone: async (result) => {
        sourceCache.clear();
        $(`select[name="${f.k}"]`, root).dataset.value = result.data.id;
        await fillSource(root, f);
        syncFields();
      },
    });
  });
  return {
    editors,
    read() {
      const data = collect();
      for (const f of fields) if (!shown(f, data)) delete data[f.k];
      return data;
    },
    validate(data) {
      let ok = true;
      $$(".err", root).forEach((e) => (e.textContent = ""));
      const all = collect();
      for (const f of fields) {
        if (!shown(f, all)) continue;
        const missing = f.type === "lines" ? !data[f.k].length : data[f.k] === "";
        if ((f.req || f.reqIf?.(all)) && missing) {
          $(`[data-field="${f.k}"] .err`, root).textContent = `${f.l} is required`;
          ok = false;
        }
      }
      return ok;
    },
    showErrors(error) {
      for (const [key, message] of Object.entries(error.errors || {})) {
        const el = $(`[data-field="${key}"] .err`, root);
        if (el) el.textContent = message;
      }
    },
  };
}

function openForm({ title, fields, row, submit, wide, submitLabel, onDone }) {
  const body = document.createElement("div");
  const form = buildForm(body, fields, row);
  modal({
    title, body, wide, submitLabel,
    onSubmit: async (close) => {
      const data = form.read();
      if (!form.validate(data)) return;
      try {
        const result = await submit(data);
        close();
        toast(result?.message || "Saved");
        onDone?.(result);
      } catch (error) {
        form.showErrors(error);
        toast(error.message, true);
      }
    },
  });
  return form;
}

function download(name, text, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCsv = (headers, rows) => "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

const cellText = (c, row) => {
  if (c.x) return c.x(row);
  const v = get(row, c.k);
  if (c.t === "date") return fmt.date(v);
  if (c.t === "datetime") return fmt.datetime(v);
  if (c.t === "money" || c.t === "num") return Number(v || 0);
  return v ?? "";
};

function cellHtml(c, row) {
  if (c.f) return c.f(row);
  const v = get(row, c.k);
  switch (c.t) {
    case "money": return esc(fmt.money(v));
    case "num": return esc(fmt.num(v));
    case "date": return esc(fmt.date(v));
    case "datetime": return esc(fmt.datetime(v));
    case "badge": return badge(v);
    default: return esc(v);
  }
}

const stateHtml = (kind, message = "") =>
  kind === "loading" ? `<div class="state"><span class="spinner" aria-label="Loading"></span></div>`
    : `<div class="state ${kind === "error" ? "error" : ""}">${esc(message)}${kind === "error" ? `<div style="margin-top:8px"><button class="btn sm" data-retry>Try again</button></div>` : ""}</div>`;

function tableHtml(columns, rows, actionsFor) {
  const head = columns.map((c) => `<th class="${c.t === "money" || c.t === "num" ? "num" : ""}">${esc(c.l)}</th>`).join("");
  const body = rows.map((row, i) => {
    const cells = columns.map((c) => `<td class="${c.t === "money" || c.t === "num" ? "num" : ""}">${cellHtml(c, row)}</td>`).join("");
    const acts = actionsFor ? `<td><div class="row-actions">${actionsFor(row, i)}</div></td>` : "";
    return `<tr>${cells}${acts}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table><thead><tr>${head}${actionsFor ? "<th>Actions</th>" : ""}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// Standard list page: filters, table, paging, CSV, print, add/edit and row actions.
function listPage(root, cfg) {
  const state = { page: 1, search: "", filters: {}, rows: [] };
  const filters = (cfg.filters || []).filter(sourceAllowed);
  const addAllowed = cfg.form && !cfg.noCreate && can(cfg.module, "create");

  root.innerHTML = `<div class="page-head"><div><h1>${esc(cfg.title)}</h1>${cfg.intro ? `<p>${esc(cfg.intro)}</p>` : ""}</div>
    <div class="row-actions no-print" data-head></div></div>
    <div class="toolbar">
      ${cfg.noSearch ? "" : `<div><label>Search</label><input data-search placeholder="Search"></div>`}
      ${filters.map((f) => `<div><label>${esc(f.l)}</label>${f.type === "date"
        ? `<input type="date" data-filter="${f.k}">`
        : `<select data-filter="${f.k}"><option value="">All</option>${(f.options || []).map((o) => {
            const [v, t] = Array.isArray(o) ? o : [o, fmt.label(o)];
            return `<option value="${esc(v)}">${esc(t)}</option>`;
          }).join("")}</select>`}</div>`).join("")}
    </div><div data-summary></div><div data-table></div><div class="pager"><span data-count></span><div class="row-actions" style="display:flex"><button class="btn sm" data-prev>Previous</button><button class="btn sm" data-next>Next</button></div></div>`;

  const head = $("[data-head]", root);
  if (addAllowed) head.insertAdjacentHTML("beforeend", cfg.addHref ? `<a class="btn primary" href="${cfg.addHref}">${esc(cfg.addLabel || "Add")}</a>` : `<button class="btn primary" data-add>${esc(cfg.addLabel || "Add")}</button>`);
  (cfg.tools || []).filter((t) => !t.perm || can(cfg.module, t.perm)).forEach((t, i) =>
    head.insertAdjacentHTML("beforeend", `<button class="btn" data-tool="${i}">${esc(t.l)}</button>`));
  if (can(cfg.module, "export")) head.insertAdjacentHTML("beforeend", `<button class="btn" data-csv>Export CSV</button>`);
  if (can(cfg.module, "print")) head.insertAdjacentHTML("beforeend", `<button class="btn" data-print>Print</button>`);

  filters.filter((f) => f.source).forEach(async (f) => {
    try {
      const rows = await loadSource(f.source);
      $(`[data-filter="${f.k}"]`, root).insertAdjacentHTML("beforeend", rows.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join(""));
    } catch { /* The filter is optional; the list still works without it. */ }
  });

  const query = (extra = {}) => {
    const params = new URLSearchParams({ page: state.page, limit: cfg.pageSize || 25, ...(cfg.params || {}), ...extra });
    if (state.search) params.set("search", state.search);
    for (const [k, v] of Object.entries(state.filters)) if (v) params.set(k, v);
    return `${cfg.api}${cfg.api.includes("?") ? "&" : "?"}${params}`;
  };

  const editable = cfg.form && !cfg.noEdit && can(cfg.module, "update");
  const deletable = cfg.deleteLabel && can(cfg.module, "delete");
  const actionsVisible = (row) => (cfg.actions || []).filter((a) => (!a.perm || can(a.module || cfg.module, a.perm)) && (!a.show || a.show(row)));
  const hasActions = editable || deletable || cfg.actions?.length;

  const actionsFor = (row, i) => [
    ...actionsVisible(row).map((a) => `<button class="btn sm${a.danger ? " danger" : ""}" data-action="${(cfg.actions || []).indexOf(a)}" data-i="${i}">${esc(a.l)}</button>`),
    editable && (!cfg.canEdit || cfg.canEdit(row)) ? `<button class="btn sm" data-edit="${i}">Edit</button>` : "",
    deletable && (!cfg.canDelete || cfg.canDelete(row)) ? `<button class="btn sm danger" data-del="${i}">${esc(cfg.deleteLabel)}</button>` : "",
  ].join("");

  async function load() {
    const table = $("[data-table]", root);
    table.innerHTML = stateHtml("loading");
    try {
      const res = await api(query());
      state.rows = res.data;
      const p = res.pagination || { page: 1, pages: 1, total: res.data.length };
      table.innerHTML = res.data.length
        ? tableHtml(cfg.columns, res.data, hasActions ? actionsFor : null)
        : stateHtml("empty", state.search || Object.values(state.filters).some(Boolean) ? "No records match these filters." : cfg.empty || "No records yet.");
      $("[data-count]", root).textContent = `${p.total} record${p.total === 1 ? "" : "s"} · page ${p.page} of ${p.pages}`;
      $("[data-prev]", root).disabled = p.page <= 1;
      $("[data-next]", root).disabled = p.page >= p.pages;
      if (cfg.summary && res.summary) $("[data-summary]", root).innerHTML = cfg.summary(res.summary);
    } catch (error) {
      table.innerHTML = stateHtml("error", error.message);
    }
  }

  const reload = () => { sourceCache.clear(); return load(); };

  const openEdit = (row) => openForm({
    title: `${row ? "Edit" : cfg.addLabel || "Add"} ${row ? cfg.title.replace(/s$/, "") : ""}`.trim(),
    fields: row && cfg.editFields ? cfg.editFields : cfg.form,
    row: row || undefined,
    wide: cfg.wide,
    submit: (data) => {
      const body = cfg.toBody ? cfg.toBody(data, row) : data;
      return row ? api(`${cfg.api.split("?")[0]}/${row.id}`, { method: "PUT", body }) : api(cfg.api.split("?")[0], { method: "POST", body });
    },
    onDone: reload,
  });

  root.addEventListener("click", async (event) => {
    const t = event.target;
    const d = t.dataset;
    if (d.retry !== undefined) return load();
    if (d.add !== undefined) return openEdit();
    if (d.prev !== undefined) { state.page -= 1; return load(); }
    if (d.next !== undefined) { state.page += 1; return load(); }
    if (d.print !== undefined) return window.print();
    if (d.tool !== undefined) return (cfg.tools.filter((x) => !x.perm || can(cfg.module, x.perm))[d.tool]).run({ reload, state });
    if (d.edit !== undefined) return openEdit(state.rows[d.edit]);
    if (d.csv !== undefined) {
      try {
        const res = await api(query({ export: 1, page: 1 }));
        download(`${cfg.title.toLowerCase().replace(/\W+/g, "-")}.csv`, toCsv(cfg.columns.map((c) => c.l), res.data.map((r) => cfg.columns.map((c) => cellText(c, r)))));
        toast(`Exported ${res.data.length} rows`);
      } catch (error) { toast(error.message, true); }
      return;
    }
    if (d.del !== undefined) {
      const row = state.rows[d.del];
      if (!(await confirmDialog(`${cfg.deleteLabel} ${row.name || row.id}?`, { action: cfg.deleteLabel }))) return;
      try {
        toast((await api(`${cfg.api.split("?")[0]}/${row.id}`, { method: "DELETE" })).message);
        reload();
      } catch (error) { toast(error.message, true); }
      return;
    }
    if (d.action !== undefined) {
      const action = cfg.actions[d.action];
      const row = state.rows[d.i];
      if (action.href) { go(action.href(row)); return; }
      if (action.run) return action.run(row, { reload });
      const reason = await confirmDialog(action.confirm || `${action.l}?`, { action: action.l, reason: action.reason });
      if (!reason) return;
      try {
        toast((await api(action.post(row), { method: "POST", body: action.reason ? { reason } : {} })).message);
        reload();
      } catch (error) { toast(error.message, true); }
    }
  });

  let timer;
  $("[data-search]", root)?.addEventListener("input", (event) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.search = event.target.value.trim(); state.page = 1; load(); }, 300);
  });
  $$("[data-filter]", root).forEach((el) => el.addEventListener("change", () => {
    state.filters[el.dataset.filter] = el.value;
    state.page = 1;
    load();
  }));

  load();
  return { reload };
}

const NAV = [
  ["Overview", [["Dashboard", "dashboard.html", "dashboard"]]],
  ["Sales", [["New Sale", "new-sale.html", "sales", "create"], ["Sales", "sales.html", "sales"], ["Quotations", "quotations.html", "quotations"], ["Invoices", "invoices.html", "invoices"]]],
  ["Purchases", [["New Purchase", "new-purchase.html", "purchases", "create"], ["Purchases", "purchases.html", "purchases"], ["Purchase Orders", "purchase-orders.html", "purchase_orders"]]],
  ["Customers & Suppliers", [["Customers", "customers.html", "customers"], ["Customer Ledger", "customer-ledger.html", "customers"], ["Suppliers", "suppliers.html", "suppliers"], ["Supplier Ledger", "supplier-ledger.html", "suppliers"]]],
  ["Inventory", [["Products", "products.html", "products"], ["Categories", "categories.html", "categories"], ["Brands", "brands.html", "brands"], ["Godowns", "godowns.html", "godowns"]]],
  ["Stock", [["Stock Overview", "stock.html", "stock"], ["Stock In", "stock-in.html", "stock"], ["Stock Out", "stock-out.html", "stock"], ["Stock Transfer", "stock-transfer.html", "stock"], ["Adjustments", "stock-adjustment.html", "stock"], ["Damaged Stock", "damaged-stock.html", "stock"], ["Stock Movements", "stock-movements.html", "stock"]]],
  ["Finance", [["Payments", "payments.html", "payments"], ["Expenses", "expenses.html", "expenses"], ["Payments Due", "outstanding.html", "finance"]]],
  ["People", [["Employees", "employees.html", "employees"], ["Attendance", "attendance.html", "attendance"], ["Leave", "leave.html", "leave"], ["Payroll", "payroll.html", "payroll"]]],
  ["Reports", [["Cash & Bank", "cashbook.html", "finance"], ["Profit & Loss", "profit-loss.html", "finance"], ["All Reports", "reports.html", "reports"]]],
  ["Administration", [["Users", "users.html", "users"], ["Login History", "login-history.html", "users"], ["Roles & Permissions", "roles-permissions.html", "roles"], ["Settings", "settings.html", "settings"], ["Backup", "backup.html", "backup"]]],
];

const svg = (path, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const NAV_ICONS = {
  Overview: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
  Sales: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  Purchases: '<path d="M3 4h2l2.500 12h11l2-8H6.500"/><circle cx="9" cy="20" r="1.500"/><circle cx="17" cy="20" r="1.500"/>',
  "Customers & Suppliers": '<circle cx="9" cy="8" r="4"/><path d="M2 21c.8-4.500 3.500-6.500 7-6.500s6.200 2 7 6.500"/><path d="M16 4.500a4 4 0 0 1 0 7M18 15c2 .8 3.400 2.800 4 6"/>',
  Inventory: '<path d="M12 3l8.500 4.500v9L12 21l-8.500-4.500v-9z"/><path d="M3.500 7.500L12 12l8.500-4.500M12 12v9"/>',
  Stock: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  Finance: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M16 15h2"/>',
  People: '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M8 17c.6-2 2-3 4-3s3.400 1 4 3"/>',
  Reports: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  Administration: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100"/>',
};
const CHEVRON = '<path d="M9 6l6 6-6 6"/>';

const allowedLinks = () => NAV.flatMap(([, links]) => links.filter(([, , m, a]) => can(m, a || "read")));

function renderShell() {
  const groups = NAV.map(([title, links]) => {
    const items = links.filter(([, , m, a]) => can(m, a || "read"));
    if (!items.length) return "";
    const icon = svg(NAV_ICONS[title]);
    if (items.length === 1) return `<a class="nav-link top" href="${items[0][1]}">${icon}${esc(items[0][0])}</a>`;
    return `<div class="nav-group"><button class="nav-title" type="button" aria-expanded="false">${icon}<span>${esc(title)}</span>${svg(CHEVRON, 14)}</button><div class="nav-items">${items
      .map(([label, href]) => `<a class="nav-link" href="${href}">${esc(label)}</a>`).join("")}</div></div>`;
  }).join("");
  const initials = currentUser.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  document.body.innerHTML = `<div class="app">
    <aside class="sidebar" id="sidebar"><div class="brand"><img class="brand-full" src="images/logo-full.svg" alt="Bhanu Shree Tiles, Kajaria Studio"></div><nav aria-label="Main">${groups}</nav></aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="Open menu">${svg('<path d="M4 7h16M4 12h16M4 17h16"/>', 20)}</button>
        <div class="crumbs" id="crumbs"></div>
        <div class="spacer"></div>
        <div class="bell"><button class="icon-btn" id="bellBtn" aria-label="Alerts">${svg('<path d="M6 9a6 6 0 0 1 12 0c0 6 2.500 7 2.500 7h-17S6 15 6 9"/><path d="M10 20a2.200 2.200 0 0 0 4 0"/>', 20)}</button><div id="bellBox"></div></div>
        <div class="user-box">
          <button class="user-btn" id="userBtn" aria-haspopup="true" aria-expanded="false"><span class="avatar">${esc(initials)}</span><span class="user-chip"><b>${esc(currentUser.name)}</b><small>${esc(fmt.label(currentUser.role))}</small></span></button>
          <div class="popover" id="userMenu" hidden><a href="profile.html">My profile</a><button id="logoutBtn" type="button">Log out</button></div>
        </div>
      </header>
      <main class="content" id="page"></main>
    </div></div>`;

  $("#menuBtn").addEventListener("click", (event) => { event.stopPropagation(); $("#sidebar").classList.toggle("open"); });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#sidebar")) $("#sidebar").classList.remove("open");
    if (!event.target.closest(".bell")) $("#bellBox").innerHTML = "";
    if (!event.target.closest(".user-box")) toggleUser(false);
  });
  const toggleUser = (open) => {
    $("#userMenu").hidden = !open;
    $("#userBtn").setAttribute("aria-expanded", String(open));
  };
  $("#userBtn").addEventListener("click", () => toggleUser($("#userMenu").hidden));
  $("#sidebar").addEventListener("click", (event) => {
    const title = event.target.closest(".nav-title");
    if (!title) return;
    const open = title.parentElement.classList.toggle("open");
    title.setAttribute("aria-expanded", String(open));
  });
  $("#logoutBtn").addEventListener("click", async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "login.html";
  });

  let alerts = [];
  $("#bellBtn").addEventListener("click", () => {
    const box = $("#bellBox");
    box.innerHTML = box.innerHTML ? "" : `<div class="popover">${alerts.length
      ? alerts.map((a) => `<a href="${esc(a.link)}"><b>${esc(a.title)}</b><small>${esc(a.message)}</small></a>`).join("")
      : `<div class="state">No alerts</div>`}</div>`;
  });
  api("/notifications").then((r) => {
    alerts = r.data;
    if (alerts.length) $("#bellBtn").insertAdjacentHTML("afterend", `<span class="dot">${alerts.length}</span>`);
  }).catch(() => {});
}

const landingPage = () => (can("dashboard") ? "dashboard.html" : allowedLinks()[0]?.[1] || "profile.html");

function markActive(active) {
  $$("#sidebar a").forEach((a) => {
    const on = a.getAttribute("href") === active;
    a.classList.toggle("active", on);
    const group = a.closest(".nav-group");
    if (on && group) {
      group.classList.add("open");
      $(".nav-title", group).setAttribute("aria-expanded", "true");
    }
  });
  const place = NAV.find(([, links]) => links.some(([, href]) => href === active));
  const label = place?.[1].find(([, href]) => href === active)?.[0];
  $("#crumbs").innerHTML = label ? `${place[0] === "Overview" ? "" : `<span>${esc(place[0])}</span>${svg(CHEVRON, 13)}`}<b>${esc(label)}</b>` : "";
}

const pageName = (file) => file.replace(/\.html$/, "") || "dashboard";

// Each page gets a fresh container, so listeners from the previous page cannot linger.
async function showPage(file) {
  const name = pageName(file);
  markActive(file);
  $$(".overlay").forEach((el) => el.remove());
  $("#bellBox").innerHTML = "";
  $("#sidebar").classList.remove("open");
  sourceCache.clear();
  const root = document.createElement("main");
  root.className = "content";
  root.id = "page";
  $("#page").replaceWith(root);
  scrollTo(0, 0);
  const page = window.ERP_PAGES?.[name];
  if (!page) {
    root.innerHTML = stateHtml("empty", "Page not found.");
    return;
  }
  if (page.module && !can(page.module, page.perm || "read")) {
    root.innerHTML = `<div class="state error"><h2>Access denied</h2><p>Your role does not include this page.</p><a class="btn" href="${landingPage()}">Go to my home page</a></div>`;
    return;
  }
  document.title = `${page.title || "Dashboard"} · Bhanu Shree Tiles`;
  if (page.render) await page.render(root, page);
  else listPage(root, page);
}

// Opens another signed-in page in place. Anything else, such as a download, loads normally.
function go(href) {
  const url = new URL(href, location.href);
  const file = url.pathname.split("/").pop();
  if (url.origin !== location.origin || !file.endsWith(".html") || !window.ERP_PAGES?.[pageName(file)] || currentUser?.mustChangePassword) {
    location.href = url.href;
    return;
  }
  history.pushState(null, "", url.href);
  showPage(file);
}

async function boot() {
  const name = document.body.dataset.page;
  const active = location.pathname.split("/").pop() || "dashboard.html";
  document.body.innerHTML = stateHtml("loading");
  try {
    const session = await api("/auth/session");
    if (!session.data) {
      location.href = `login.html?next=${encodeURIComponent(active + location.search)}`;
      return;
    }
    currentUser = session.data;
  } catch (error) {
    document.body.innerHTML = `<div class="auth"><div class="auth-card">${stateHtml("error", error.message)}</div></div>`;
    $("[data-retry]")?.addEventListener("click", () => location.reload());
    return;
  }
  if (currentUser.mustChangePassword && name !== "profile") {
    location.href = "profile.html";
    return;
  }

  renderShell();
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || link.target || link.hasAttribute("download") || event.ctrlKey || event.metaKey || event.shiftKey || event.button) return;
    event.preventDefault();
    go(link.href);
  });
  addEventListener("popstate", () => showPage(location.pathname.split("/").pop() || "dashboard.html"));
  await showPage(active);
}

window.ERP = {
  API_BASE, esc, $, $$, get, fmt, badge, api, can, go, toast, modal, confirmDialog, loadSource, buildForm, openForm, download, toCsv,
  listPage, tableHtml, stateHtml, cellText, landingPage,
  get user() { return currentUser; },
};

if (document.body.dataset.page) document.addEventListener("DOMContentLoaded", boot);
})();
