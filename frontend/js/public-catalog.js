async function loadPublicProducts() {
  const searchInput = document.getElementById('catalogSearch');
  const tableBody = document.getElementById('catalogTable');
  const statusNode = document.getElementById('catalogStatus');

  async function refresh() {
    const query = searchInput.value.trim();
    const params = new URLSearchParams();
    if (query) params.set('q', query);

    const products = await apiFetch(`/api/products${params.toString() ? `?${params}` : ''}`);
    statusNode.textContent = `${products.length} products`;
    tableBody.innerHTML = products.length
      ? products.map((product) => `
        <tr>
          <td>${product.name}</td>
          <td>${product.category || ''}</td>
          <td>${product.brand || ''}</td>
          <td>${product.size || ''}</td>
          <td>${product.color || ''}</td>
          <td>₹${Number(product.price || 0).toLocaleString('en-IN')}</td>
          <td>${product.stock ?? 0}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="7">No products found</td></tr>';
  }

  document.getElementById('catalogSearchButton').addEventListener('click', () => refresh().catch((error) => {
    statusNode.textContent = error.message;
  }));

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      refresh().catch((error) => {
        statusNode.textContent = error.message;
      });
    }
  });

  await refresh();
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('catalogTable')) {
    loadPublicProducts().catch((error) => {
      const statusNode = document.getElementById('catalogStatus');
      if (statusNode) statusNode.textContent = error.message;
    });
  }
});