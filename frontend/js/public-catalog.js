const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROOM_TITLES = { Bathroom: 'Bathroom tiles', Kitchen: 'Kitchen tiles', Living: 'Living room tiles', Bedroom: 'Bedroom tiles', Outdoor: 'Outdoor and parking tiles', Commercial: 'Commercial space tiles' };

function tileCard(product) {
  const details = [product.finish, product.color].filter(Boolean).map(safe).join(' · ');
  const price = Number(product.price) ? `₹${Number(product.price).toLocaleString('en-IN')}` : 'Ask for price';
  return `
    <article class="tile-card">
      <span class="pic">${product.imageUrl ? `<img src="${safe(product.imageUrl)}" alt="${safe(product.name)}" loading="lazy">` : ''}</span>
      <h2>${safe(product.name)}</h2>
      <p class="type">${safe([product.brand, product.category].filter(Boolean).join(' · '))}</p>
      <p class="size">${safe(product.size)}</p>
      ${details ? `<p class="more-info">${details}</p>` : ''}
      <p class="ask">${price}${product.inStock ? ' · In stock' : ''}</p>
    </article>`;
}

async function loadCatalog() {
  const params = new URLSearchParams(location.search);
  const query = (params.get('q') || '').trim();
  const brandFilter = $('brandFilter');
  const sizeFilter = $('sizeFilter');
  const grid = $('catalogGrid');
  const status = $('catalogStatus');
  const more = $('loadMore');
  let page = 1;
  let pages = 1;

  const heading = () => {
    const room = ROOM_TITLES[query];
    const brand = brandFilter.value;
    const title = query && !room ? `Results for “${query}”` : room ? (brand ? `${brand} ${room.toLowerCase()}` : room) : brand ? `${brand} tiles` : 'All tiles';
    document.title = `${title} · Bhanu Shree Tiles`;
    $('heading').textContent = title;
    $('crumb').textContent = title;
  };

  const fill = (select, values, label) => {
    const keep = select.value;
    select.replaceChildren(new Option(label, ''), ...values.map((v) => new Option(v, v)));
    select.value = values.includes(keep) ? keep : '';
  };

  async function load(reset) {
    if (reset) page = 1;
    more.hidden = true;
    const url = new URLSearchParams({ page });
    if (query) url.set('q', query);
    if (brandFilter.value) url.set('brand', brandFilter.value);
    if (sizeFilter.value) url.set('size', sizeFilter.value);
    let reply;
    try {
      reply = await (await fetch(`${API}/public/catalog?${url}`)).json();
    } catch {
      status.textContent = 'The catalogue is unavailable right now. Please try again shortly.';
      return;
    }
    pages = reply.pages;
    fill(sizeFilter, reply.sizes, 'All sizes');
    status.textContent = `${reply.total.toLocaleString('en-IN')} ${reply.total === 1 ? 'tile' : 'tiles'}`;
    if (reset) grid.innerHTML = '';
    grid.insertAdjacentHTML('beforeend', reply.data.length ? reply.data.map(tileCard).join('') : '<p class="empty">No tiles found. Try another room or search word.</p>');
    more.hidden = page >= pages;
    heading();
  }

  const change = () => {
    const url = new URL(location.href);
    if (brandFilter.value) url.searchParams.set('brand', brandFilter.value);
    else url.searchParams.delete('brand');
    history.replaceState(null, '', url);
    document.querySelectorAll('#chips a').forEach((chip) => {
      const link = new URL(chip.href);
      if (brandFilter.value) link.searchParams.set('brand', brandFilter.value);
      else link.searchParams.delete('brand');
      chip.href = link.href;
    });
    load(true);
  };

  document.querySelectorAll('#chips a').forEach((chip) => { if (chip.dataset.q === query) chip.setAttribute('aria-current', 'page'); });
  const searchBox = document.querySelector('.search input');
  if (searchBox && !ROOM_TITLES[query]) searchBox.value = query;

  // The brand list comes first, so a link such as ?brand=Italica can select its option.
  try {
    const { brands } = await (await fetch(`${API}/public/catalog?limit=1`)).json();
    fill(brandFilter, brands, 'All brands');
    brandFilter.value = brands.includes(params.get('brand')) ? params.get('brand') : '';
  } catch { /* The list below reports the problem. */ }

  brandFilter.addEventListener('change', () => { sizeFilter.value = ''; change(); });
  sizeFilter.addEventListener('change', () => load(true));
  more.addEventListener('click', () => { page += 1; load(false); });
  change();
}

loadCatalog();
