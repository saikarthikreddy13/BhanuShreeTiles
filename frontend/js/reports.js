let reportsChart;

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);

const renderRows = (rows, columns, targetId) => {
  const body = document.getElementById(targetId);
  if (!body) return;
  body.innerHTML = rows.map((row) => `<tr>${columns.map((column) => `<td>${column(row)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="3">No records found</td></tr>';
};

const renderGstRows = (rows) => {
  const target = document.getElementById('gstTable');
  if (!target) return;
  target.innerHTML = `
    <table class="table table-darkish mb-0">
      <thead><tr><th>Invoice</th><th>Date</th><th>GST</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${row.invoiceNumber}</td><td>${new Date(row.date).toLocaleDateString()}</td><td>${money(row.gstTotal)}</td></tr>`).join('') || '<tr><td colspan="3">No GST records</td></tr>'}
      </tbody>
    </table>
  `;
};

async function loadReports() {
  requireAuthRedirect();
  const range = document.getElementById('rangeFilter').value;
  const summary = await apiFetch(`/api/reports/summary?range=${range}`);
  const sales = await apiFetch(`/api/reports/sales?range=${range}`);
  const purchases = await apiFetch(`/api/reports/purchases?range=${range}`);
  const stock = await apiFetch('/api/reports/stock');
  const gst = await apiFetch(`/api/reports/gst?range=${range}`);

  document.getElementById('salesTotal').textContent = money(summary.salesTotal);
  document.getElementById('purchaseTotal').textContent = money(summary.purchaseTotal);
  document.getElementById('profitTotal').textContent = money(summary.profit);
  document.getElementById('gstCollected').textContent = money(summary.gstCollected);
  document.getElementById('salesCount').textContent = summary.salesCount;
  document.getElementById('purchaseCount').textContent = summary.purchaseCount;
  document.getElementById('lowStockTotal').textContent = summary.lowStock;

  renderRows(sales, [(row) => row.invoiceNumber, (row) => row.customer?.name || '', (row) => money(row.grandTotal)], 'salesTable');
  renderRows(purchases, [(row) => row.invoiceNumber, (row) => row.supplier?.name || '', (row) => money(row.grandTotal)], 'purchaseTable');
  renderGstRows(gst);

  const labels = ['Sales', 'Purchases', 'Profit', 'Low Stock'];
  const values = [summary.salesTotal, summary.purchaseTotal, summary.profit, summary.lowStock];
  const ctx = document.getElementById('reportsChart');

  if (reportsChart) {
    reportsChart.destroy();
  }

  reportsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Amount',
        data: values,
        backgroundColor: ['#f59e0b', '#06b6d4', '#10b981', '#fb7185'],
        borderRadius: 12,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#e5e7eb' }, grid: { color: 'rgba(255,255,255,0.08)' } },
        y: { ticks: { color: '#e5e7eb' }, grid: { color: 'rgba(255,255,255,0.08)' } },
      },
    },
  });

  document.querySelectorAll('[data-export]').forEach((button) => {
    button.onclick = () => {
      const type = button.dataset.export;
      const token = localStorage.getItem('token');
      fetch(`/api/reports/export/${type}?range=${range}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(async (response) => {
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.msg || 'Export failed');
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `${type}-report.xlsx`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        })
        .catch((error) => alert(error.message));
    };
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshReports').addEventListener('click', () => loadReports().catch((error) => alert(error.message)));
  document.getElementById('rangeFilter').addEventListener('change', () => loadReports().catch((error) => alert(error.message)));
  loadReports().catch((error) => alert(error.message));
});
