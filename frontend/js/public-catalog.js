const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROOM_TITLES = { Bathroom: 'Bathroom tiles', Kitchen: 'Kitchen tiles', Living: 'Living room tiles', Bedroom: 'Bedroom tiles', Outdoor: 'Outdoor and parking tiles', Commercial: 'Commercial space tiles' };

function tileCard(product) {
  const details = [product.finish, product.color].filter(Boolean).map(safe).join(' · ');
  const price = Number(product.price) ? `₹${Number(product.price).toLocaleString('en-IN')}` : 'Ask for price';
  return `
    <article class="tile-card">
      <span class="pic">${product.imageUrl ? `<img src="${safe(product.imageUrl)}" alt="${safe(product.name)}" loading="lazy">` : ''}</span>
      <h2>${safe(product.name)}</h2>
      <p class="type">${safe(product.category)}</p>
      <p class="size">${safe(product.size)}</p>
      ${details ? `<p class="more-info">${details}</p>` : ''}
      <p class="ask">${price}${product.inStock ? ' · In stock' : ''}</p>
    </article>`;
}

async function loadCatalog() {
  const query = (new URLSearchParams(location.search).get('q') || '').trim();
  const title = ROOM_TITLES[query] || (query ? `Results for “${query}”` : 'All tiles');
  document.title = `${title} · Bhanu Shree Tiles`;
  $('heading').textContent = title;
  $('crumb').textContent = title;
  document.querySelectorAll('#chips a').forEach((chip) => { if (chip.dataset.q === query) chip.setAttribute('aria-current', 'page'); });
  const searchBox = document.querySelector('.search input');
  if (searchBox && !ROOM_TITLES[query]) searchBox.value = query;

  const grid = $('catalogGrid');
  const status = $('catalogStatus');
  const filter = $('sizeFilter');
  let products;
  try {
    const response = await fetch(`${API}/public/catalog${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    products = (await response.json()).data;
  } catch {
    status.textContent = 'The catalogue is unavailable right now. Please try again shortly.';
    return;
  }
  filter.append(...[...new Set(products.map((p) => p.size).filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b)).map((size) => new Option(size, size)));

  function draw() {
    const shown = filter.value ? products.filter((p) => p.size === filter.value) : products;
    status.textContent = `${shown.length} ${shown.length === 1 ? 'tile' : 'tiles'}`;
    grid.innerHTML = shown.length ? shown.map(tileCard).join('') : '<p class="empty">No tiles found. Try another room or search word.</p>';
  }
  filter.addEventListener('change', draw);
  draw();
}

loadCatalog();
