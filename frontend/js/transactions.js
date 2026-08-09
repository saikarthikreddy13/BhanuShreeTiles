async function apiRequest(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.msg || 'Request failed');
  return payload;
}

function readLineItems(prefix) {
  const rows = Array.from(document.querySelectorAll(`[data-row="${prefix}"]`));
  return rows.map((row) => ({
    product: row.querySelector('[name="product"]').value,
    quantity: Number(row.querySelector('[name="quantity"]').value || 0),
    price: Number(row.querySelector('[name="price"]').value || 0),
    gstRate: Number(row.querySelector('[name="gstRate"]').value || 0),
    discount: Number(row.querySelector('[name="discount"]')?.value || 0),
  }));
}

function addLineItem(prefix, target) {
  const wrapper = document.createElement('div');
  wrapper.className = 'row g-2 mb-2 align-items-end';
  wrapper.dataset.row = prefix;
  wrapper.innerHTML = `
    <div class="col-md-4"><input class="form-control" name="product" placeholder="Product ID" required></div>
    <div class="col-md-2"><input class="form-control" type="number" name="quantity" placeholder="Qty" min="1" required></div>
    <div class="col-md-2"><input class="form-control" type="number" name="price" placeholder="Price" min="0" step="0.01" required></div>
    <div class="col-md-2"><input class="form-control" type="number" name="gstRate" placeholder="GST %" min="0" step="0.01" value="18"></div>
    <div class="col-md-2"><input class="form-control" type="number" name="discount" placeholder="Discount" min="0" step="0.01" value="0"></div>
  `;
  target.appendChild(wrapper);
}

function wireTransactionForm({ formId, listUrl, submitUrl, itemPrefix, itemHostId, buildPayload }) {
  const form = document.getElementById(formId);
  const itemHost = document.getElementById(itemHostId);
  const list = document.getElementById(`${formId}List`);
  const addButton = document.getElementById(`${formId}AddItem`);

  if (itemHost && itemHost.children.length === 0) addLineItem(itemPrefix, itemHost);
  if (addButton && itemHost) addButton.addEventListener('click', () => addLineItem(itemPrefix, itemHost));

  async function refreshList() {
    if (!list) return;
    const items = await apiRequest(listUrl);
    list.innerHTML = items.map((item) => `<tr><td>${item.invoiceNumber}</td><td>${item.grandTotal}</td><td>${new Date(item.createdAt).toLocaleDateString()}</td></tr>`).join('');
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = buildPayload(new FormData(form), readLineItems(itemPrefix));
      await apiRequest(submitUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      form.reset();
      itemHost.innerHTML = '';
      addLineItem(itemPrefix, itemHost);
      await refreshList();
      alert('Saved successfully');
    });
  }

  refreshList().catch((error) => {
    console.error(error);
    if (list) list.innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('purchaseForm')) {
    wireTransactionForm({
      formId: 'purchaseForm',
      listUrl: '/api/purchases',
      submitUrl: '/api/purchases',
      itemPrefix: 'purchase',
      itemHostId: 'purchaseItems',
      buildPayload: (formData, items) => ({
        supplier: formData.get('supplier'),
        paymentMode: formData.get('paymentMode'),
        items,
      }),
    });
  }

  if (document.getElementById('salesForm')) {
    wireTransactionForm({
      formId: 'salesForm',
      listUrl: '/api/sales',
      submitUrl: '/api/sales',
      itemPrefix: 'sale',
      itemHostId: 'salesItems',
      buildPayload: (formData, items) => ({
        customer: formData.get('customer'),
        paymentMode: formData.get('paymentMode'),
        items,
      }),
    });
  }
});
