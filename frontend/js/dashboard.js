const summaryEndpoint = '/api/dashboard/summary';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const statMap = [
  { id: 'productsCount', key: 'products', label: 'Products' },
  { id: 'customersCount', key: 'customers', label: 'Customers' },
  { id: 'suppliersCount', key: 'suppliers', label: 'Suppliers' },
  { id: 'stockCount', key: 'totalStock', label: 'Total Stock' },
];

async function loadSummary() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  const response = await fetch(summaryEndpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error('Unable to load dashboard');
  }

  const data = await response.json();

  statMap.forEach(({ id, key, label }) => {
    const node = document.getElementById(id);
    if (node) node.textContent = data[key] ?? 0;
    const labelNode = document.querySelector(`[data-label-for="${id}"]`);
    if (labelNode) labelNode.textContent = label;
  });

  const chartCanvas = document.getElementById('summaryChart');
  if (chartCanvas) {
    new Chart(chartCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Products', 'Customers', 'Suppliers', 'Stock'],
        datasets: [{
          data: [data.products || 0, data.customers || 0, data.suppliers || 0, data.totalStock || 0],
          backgroundColor: ['#f59e0b', '#06b6d4', '#10b981', '#f97316'],
          borderWidth: 0,
        }],
      },
      options: {
        plugins: {
          legend: {
            labels: { color: '#e5e7eb' },
          },
        },
      },
    });
  }

  const revenueNode = document.getElementById('monthlyRevenue');
  if (revenueNode) revenueNode.textContent = currency.format(0);
}

document.addEventListener('DOMContentLoaded', () => {
  loadSummary().catch((error) => {
    console.error(error);
    const status = document.getElementById('dashboardStatus');
    if (status) status.textContent = error.message;
  });
});
