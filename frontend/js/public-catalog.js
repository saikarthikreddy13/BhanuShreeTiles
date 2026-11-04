const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROOM_TITLES = { Bathroom: 'Bathroom tiles', Kitchen: 'Kitchen tiles', Living: 'Living room tiles', Bedroom: 'Bedroom tiles', Outdoor: 'Outdoor and parking tiles', Commercial: 'Commercial space tiles' };

// Only photos served by this site can be laid in the room view (browsers block reading others).
const ownPhoto = (url) => typeof url === 'string' && url.startsWith('/');

function tileCard(product, i) {
  const details = [product.finish, product.color].filter(Boolean).map(safe).join(' · ');
  const price = Number(product.price) ? `₹${Number(product.price).toLocaleString('en-IN')}` : 'Ask for price';
  const boxes = Number(product.boxes);
  const stock = boxes > 0 ? `Stock available · ${boxes.toLocaleString('en-IN')} ${boxes === 1 ? 'box' : 'boxes'} available` : 'Not available';
  const spin = ownPhoto(product.imageUrl) ? `<button class="view360" type="button" data-i="${i}" aria-label="360° room view of ${safe(product.name)}">360° view</button>` : '';
  return `
    <article class="tile-card">
      <span class="pic">${product.imageUrl ? `<img src="${safe(product.imageUrl)}" alt="${safe(product.name)}" loading="lazy">` : ''}${spin}</span>
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
  let shown = [];
  let photo = null;   // the customer's photo, shrunk, while searching by photo

  const show = (rows, reset) => {
    if (reset) { grid.innerHTML = ''; shown = []; }
    const start = shown.length;
    shown.push(...rows);
    return rows.map((row, k) => tileCard(row, start + k)).join('');
  };

  const heading = () => {
    const room = ROOM_TITLES[query];
    const brand = brandFilter.value;
    const title = photo ? 'Tiles like your photo' : query && !room ? `Results for “${query}”` : room ? (brand ? `${brand} ${room.toLowerCase()}` : room) : brand ? `${brand} tiles` : 'All tiles';
    document.title = `${title} · Bhanu Shree Tiles`;
    $('heading').textContent = title;
    $('crumb').textContent = title;
  };

  const fill = (select, values, label) => {
    const keep = select.value;
    select.replaceChildren(new Option(label, ''), ...values.map((v) => new Option(v, v)));
    select.value = values.includes(keep) ? keep : '';
  };

  async function searchPhoto() {
    const mine = ++asked;
    more.hidden = true;
    status.textContent = 'Looking for tiles like your photo…';
    const form = new FormData();
    form.append('image', photo, 'photo.jpg');
    if (brandFilter.value) form.append('brand', brandFilter.value);
    let reply;
    try {
      reply = await (await fetch(`${API}/public/image-search`, { method: 'POST', body: form })).json();
    } catch {
      reply = { success: false };
    }
    if (mine !== asked) return;
    if (!reply.success) {
      status.textContent = reply.message || 'Photo search is unavailable right now. Please try again shortly.';
      return;
    }
    status.textContent = `${reply.total} closest ${reply.total === 1 ? 'match' : 'matches'}`;
    grid.innerHTML = reply.data.length ? show(reply.data, true) : '<p class="empty">No tiles to compare with yet.</p>';
    heading();
  }

  async function load(reset) {
    if (photo) return searchPhoto();
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
    const cards = show(reply.data, reset);
    grid.insertAdjacentHTML('beforeend', cards || '<p class="empty">No tiles found. Try another room or search word.</p>');
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
      endPhoto();
      load(true);
    }, 250);
  };

  // Search by photo: the picture is shrunk in the browser first, so uploads stay small and fast.
  const photoInput = $('photoSearch');
  const photoQuery = $('photoQuery');
  const photoThumb = $('photoThumb');
  const findBox = $('find');
  function endPhoto() {
    if (!photo) return;
    photo = null;
    photoQuery.hidden = true;
    URL.revokeObjectURL(photoThumb.src);
    photoThumb.removeAttribute('src');
  }
  async function shrink(file) {
    const source = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
    if (!source) throw new Error('unreadable');
    const scale = Math.min(1, 512 / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    source.close?.();
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('unreadable'))), 'image/jpeg', 0.88));
  }
  async function usePhoto(file) {
    if (!file || !file.type.startsWith('image/')) {
      status.textContent = 'That file is not a photo. Choose a JPG or PNG picture.';
      return;
    }
    try {
      photo = await shrink(file);
    } catch {
      photo = null;
      status.textContent = 'This photo could not be read. Try another one.';
      return;
    }
    clearTimeout(wait);
    tileSearch.value = '';
    clearSearch.hidden = true;
    if (query) {
      query = '';
      const url = new URL(location.href);
      url.searchParams.delete('q');
      history.replaceState(null, '', url);
      markChips();
    }
    if (photoThumb.src) URL.revokeObjectURL(photoThumb.src);
    photoThumb.src = URL.createObjectURL(photo);
    photoQuery.hidden = false;
    load(true);
  }
  photoInput.addEventListener('change', () => { usePhoto(photoInput.files[0]); photoInput.value = ''; });
  $('photoClear').addEventListener('click', () => { endPhoto(); load(true); });
  // A photo can also be dropped on the search box or pasted.
  findBox.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); findBox.classList.add('dropping'); } });
  findBox.addEventListener('dragleave', () => findBox.classList.remove('dropping'));
  findBox.addEventListener('drop', (e) => { e.preventDefault(); findBox.classList.remove('dropping'); usePhoto(e.dataTransfer.files[0]); });
  document.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
    if (file) { e.preventDefault(); usePhoto(file); }
  });

  // 360° room view, loaded the first time someone asks for it.
  const dialog = $('roomView');
  const stage = $('roomStage');
  const roomMsg = $('roomMsg');
  const placeButtons = [...dialog.querySelectorAll('[data-place]')];
  let viewer = null;
  let opening = 0;
  const pressPlace = (where) => placeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.place === where)));
  async function openRoom(product) {
    const mine = ++opening;
    $('roomTitle').textContent = `${product.name} · 360° room view`;
    $('roomInfo').textContent = [product.brand, product.size, product.finish].filter(Boolean).join(' · ');
    roomMsg.textContent = 'Setting up the room…';
    roomMsg.hidden = false;
    dialog.showModal();
    try {
      const room = await import('./room-view.js');
      if (mine !== opening || !dialog.open) return;
      const where = room.defaultPlace(product);
      pressPlace(where);
      const made = await room.openRoomView(stage, product, where);
      if (mine !== opening || !dialog.open) { made.close(); return; }
      viewer = made;
      roomMsg.hidden = true;
      stage.querySelector('canvas')?.focus({ preventScroll: true });
    } catch {
      if (mine === opening) roomMsg.textContent = 'The room view needs a browser with 3D graphics (WebGL). Please try another browser or device.';
    }
  }
  dialog.addEventListener('close', () => { opening += 1; viewer?.close(); viewer = null; });
  $('roomClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  placeButtons.forEach((b) => b.addEventListener('click', () => { pressPlace(b.dataset.place); viewer?.setPlace(b.dataset.place); }));
  grid.addEventListener('click', (e) => {
    const button = e.target.closest('.view360');
    if (button && shown[button.dataset.i]) openRoom(shown[button.dataset.i]);
  });
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
