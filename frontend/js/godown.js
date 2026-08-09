const toMoney = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value || 0);

async function loadGodowns() {
  requireAuthRedirect();
  const godowns = await apiFetch('/api/godowns');
  const tbody = document.getElementById('godownTable');
  tbody.innerHTML = godowns.map((godown) => `
    <tr>
      <td>${godown.name}</td>
      <td>${godown.location || ''}</td>
      <td>${godown.managerName || ''}</td>
      <td>${toMoney(godown.capacity)}</td>
      <td>
        <button class="btn btn-sm btn-outline-light me-2" data-edit="${encodeURIComponent(JSON.stringify(godown))}">Edit</button>
        <button class="btn btn-sm btn-outline-danger" data-delete="${godown._id}">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5">No godowns created yet</td></tr>';

  tbody.querySelectorAll('[data-edit]').forEach((button) => {
    button.onclick = () => {
      const godown = JSON.parse(decodeURIComponent(button.dataset.edit));
      const form = document.getElementById('godownForm');
      form.id.value = godown._id;
      form.name.value = godown.name;
      form.location.value = godown.location || '';
      form.managerName.value = godown.managerName || '';
      form.phone.value = godown.phone || '';
      form.capacity.value = godown.capacity || 0;
      form.notes.value = godown.notes || '';
    };
  });

  tbody.querySelectorAll('[data-delete]').forEach((button) => {
    button.onclick = async () => {
      if (!confirm('Delete this godown?')) return;
      await apiFetch(`/api/godowns/${button.dataset.delete}`, { method: 'DELETE' });
      await refreshGodownData();
    };
  });
}

async function loadLowStock() {
  const rows = await apiFetch('/api/godowns/low-stock');
  document.getElementById('lowStockTable').innerHTML = rows.map((row) => `
    <tr>
      <td>${row.product?.name || ''}</td>
      <td>${row.godownName}</td>
      <td>${row.rackNumber || ''}</td>
      <td>${row.quantity}</td>
      <td>${row.product?.lowStockThreshold ?? 10}</td>
    </tr>
  `).join('') || '<tr><td colspan="5">No low stock alerts</td></tr>';
}

async function refreshGodownData() {
  await loadGodowns();
  await loadLowStock();
}

document.addEventListener('DOMContentLoaded', () => {
  requireAuthRedirect();

  document.getElementById('godownForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      name: form.name.value.trim(),
      location: form.location.value.trim(),
      managerName: form.managerName.value.trim(),
      phone: form.phone.value.trim(),
      capacity: Number(form.capacity.value || 0),
      notes: form.notes.value.trim(),
    };
    const method = form.id.value ? 'PUT' : 'POST';
    const url = form.id.value ? `/api/godowns/${form.id.value}` : '/api/godowns';
    await apiFetch(url, { method, body: JSON.stringify(payload) });
    form.reset();
    await refreshGodownData();
  });

  document.getElementById('godownReset').addEventListener('click', () => document.getElementById('godownForm').reset());

  document.getElementById('transferForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    await apiFetch('/api/godowns/transfer-stock', {
      method: 'POST',
      body: JSON.stringify({
        product: form.product.value,
        quantity: Number(form.quantity.value || 0),
        fromGodownName: form.fromGodownName.value.trim(),
        toGodownName: form.toGodownName.value.trim(),
        fromRackNumber: form.fromRackNumber.value.trim(),
        toRackNumber: form.toRackNumber.value.trim(),
      }),
    });
    form.reset();
    await loadLowStock();
    alert('Stock transferred');
  });

  document.getElementById('damageForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    await apiFetch('/api/godowns/damage-stock', {
      method: 'POST',
      body: JSON.stringify({
        product: form.product.value,
        quantity: Number(form.quantity.value || 0),
        godownName: form.godownName.value.trim(),
        rackNumber: form.rackNumber.value.trim(),
      }),
    });
    form.reset();
    await loadLowStock();
    alert('Damage recorded');
  });

  document.getElementById('refreshLowStock').addEventListener('click', () => loadLowStock());
  refreshGodownData().catch((error) => alert(error.message));
});
