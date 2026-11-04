const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROOM_TITLES = { Bathroom: 'Bathroom tiles', Kitchen: 'Kitchen tiles', Living: 'Living room tiles', Bedroom: 'Bedroom tiles', Outdoor: 'Outdoor and parking tiles', Commercial: 'Commercial space tiles' };

function tileCard(product) {
  const details = [product.finish, product.color].filter(Boolean).map(safe).join(' · ');
  const price = Number(product.price) ? `₹${Number(product.price).toLocaleString('en-IN')}` : 'Ask for price';
  const boxes = Number(product.boxes);
  const stock = boxes > 0 ? `Stock available · ${boxes.toLocaleString('en-IN')} ${boxes === 1 ? 'box' : 'boxes'} available` : 'Not available';
  return `
    <article class="tile-card">
      <span class="pic">${product.imageUrl ? `<img src="${safe(product.imageUrl)}" alt="${safe(product.name)}" loading="lazy">` : ''}</span>
      <h2>${safe(product.name)}</h2>
      <p class="type">${safe([product.brand, product.category].filter(Boolean).join(' · '))}</p>
      <p class="size">${safe(product.size)}</p>
      ${details ? `<p class="more-info">${details}</p>` : ''}
      <p class="ask">${price}</p>
      <p class="stock${boxes > 0 ? ' yes' : ''}">${stock}</p>
    </article>`;
}

async function loadCatalog() {
  const params = new URLSearchParams(location.search);
  let query = (params.get('q') || '').trim().slice(0, 80);
  const brandFilter = $('brandFilter');
  const sizeFilter = $('sizeFilter');
  const grid = $('catalogGrid');
  const status = $('catalogStatus');
  const more = $('loadMore');
  let page = 1;
  let pages = 1;
  let asked = 0;

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
    const mine = ++asked;
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
    // A slower reply for an older search must not replace the newer one.
    if (mine !== asked) return;
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

  const markChips = () => document.querySelectorAll('#chips a').forEach((chip) => {
    if (chip.dataset.q === query) chip.setAttribute('aria-current', 'page');
    else chip.removeAttribute('aria-current');
  });
  markChips();
  const headerBox = document.querySelector('.search input');
  const tileSearch = $('tileSearch');
  const clearSearch = $('clearSearch');
  const typed = ROOM_TITLES[query] ? '' : query;
  if (headerBox) headerBox.value = typed;
  tileSearch.value = typed;
  clearSearch.hidden = !typed;

  // Results update as the customer types, a moment after the last key.
  let wait;
  const search = (text) => {
    clearTimeout(wait);
    clearSearch.hidden = !text;
    wait = setTimeout(() => {
      const next = text.trim().slice(0, 80);
      if (next === query) return;
      query = next;
      const url = new URL(location.href);
      if (query) url.searchParams.set('q', query);
      else url.searchParams.delete('q');
      history.replaceState(null, '', url);
      if (headerBox) headerBox.value = query;
      markChips();
      sizeFilter.value = '';
      load(true);
    }, 250);
  };
  tileSearch.addEventListener('input', () => search(tileSearch.value));
  tileSearch.addEventListener('keydown', (e) => { if (e.key === 'Escape') { tileSearch.value = ''; search(''); } });
  clearSearch.addEventListener('click', () => { tileSearch.value = ''; search(''); tileSearch.focus(); });
  // On this page the header search filters in place instead of reloading.
  headerBox?.form?.addEventListener('submit', (e) => {
    e.preventDefault();
    tileSearch.value = headerBox.value;
    search(headerBox.value);
    tileSearch.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

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
