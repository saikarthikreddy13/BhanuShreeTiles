const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROOM_TITLES = { Bathroom: 'Bathroom tiles', Kitchen: 'Kitchen tiles', Living: 'Living room tiles', Bedroom: 'Bedroom tiles', Outdoor: 'Outdoor and parking tiles', Commercial: 'Commercial space tiles' };

// Only photos stored on this site can become 3D tiles.
const ownPhoto = (url) => typeof url === 'string' && url.startsWith('/images/');
const MODEL_VERSION = '2';
const AR_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>';

function tileCard(product, i) {
  const details = [product.finish, product.color].filter(Boolean).map(safe).join(' · ');
  const price = Number(product.price) ? `₹${Number(product.price).toLocaleString('en-IN')}` : 'Ask for price';
  const boxes = Number(product.boxes);
  const stock = boxes > 0 ? `Stock available · ${boxes.toLocaleString('en-IN')} ${boxes === 1 ? 'box' : 'boxes'} available` : 'Not available';
  const spin = ownPhoto(product.imageUrl) ? `<button class="try-btn" type="button" data-i="${i}" aria-label="Try ${safe(product.name)} in your room">${AR_ICON}Try in room</button>` : '';
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
    if (!reply.success) {
      status.textContent = 'The catalogue is unavailable right now. Please try again shortly.';
      return;
    }
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

  // Try in your room: real-size 3D tiles. Phones place them on the real floor or wall with AR
  // (Android Scene Viewer or WebXR, iPhone AR Quick Look); computers get a 3D preview and a QR
  // code that opens the same tile on a phone. The viewer script loads the first time it is used.
  const dialog = $('tryView');
  const stage = $('tryStage');
  const tryMsg = $('tryMsg');
  const placeButtons = [...dialog.querySelectorAll('[data-place]')];
  const loadScript = (src, module) => new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    if (module) tag.type = 'module';
    tag.src = src;
    tag.onload = resolve;
    tag.onerror = reject;
    document.head.append(tag);
  });
  let viewerReady = null;
  let qrReady = null;
  let viewer = null;
  let trying = null;
  const getViewer = () => (viewerReady ||= loadScript('https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js', true)
    .then(() => customElements.whenDefined('model-viewer')));
  const getQr = () => (qrReady ||= loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js'));
  const placeFor = (product) => (/wall|elevation/i.test(`${product.category} ${product.finish}`) ? 'wall' : 'floor');
  const modelUrl = (product, place) => {
    // v changes whenever the model changes, because phones and Vercel keep each model address for a long time.
    const q = new URLSearchParams({ image: product.imageUrl, size: product.size || '', finish: product.finish || '', place, v: MODEL_VERSION });
    return new URL(`${API}/public/tile.glb?${q}`, location.href).href;
  };
  const shareUrl = (product, place) => {
    const url = new URL(location.pathname, location.origin);
    const fields = { try: product.imageUrl, n: product.name, s: product.size, f: product.finish, b: product.brand, c: product.category, place };
    Object.entries(fields).forEach(([k, v]) => { if (v) url.searchParams.set(k, String(v).slice(0, 120)); });
    return url.href;
  };

  function makeViewer() {
    const mv = document.createElement('model-viewer');
    const attrs = {
      ar: '', 'ar-modes': 'webxr scene-viewer quick-look', 'ar-scale': 'fixed', 'camera-controls': '', 'touch-action': 'pan-y',
      'shadow-intensity': '1', 'shadow-softness': '0.9', 'environment-image': 'neutral', exposure: '1.05', 'tone-mapping': 'commerce',
      'interaction-prompt': 'auto', 'max-camera-orbit': 'auto 88deg auto',
    };
    Object.entries(attrs).forEach(([k, v]) => mv.setAttribute(k, v));
    const button = document.createElement('button');
    button.slot = 'ar-button';
    button.className = 'try-ar';
    button.type = 'button';
    mv.append(button);
    mv.addEventListener('load', () => {
      tryMsg.hidden = true;
      dialog.dataset.ar = mv.canActivateAR ? 'yes' : 'no';
      const phone = matchMedia('(pointer: coarse)').matches;
      $('tryHint').textContent = mv.canActivateAR
        ? 'Tap the blue button, then point your camera at the floor or wall and move it slowly.'
        : phone
          ? 'This phone or browser cannot show tiles in your room. Use Chrome on an Android phone with Google Play Services for AR, or Safari on an iPhone. You can still turn the 3D tiles here.'
          : 'Drag to turn the tiles, pinch or scroll to zoom.';
    });
    mv.addEventListener('error', () => { tryMsg.hidden = false; tryMsg.textContent = 'These 3D tiles could not be loaded. Please try again.'; });
    mv.addEventListener('ar-status', (e) => {
      if (e.detail.status === 'failed') {
        tryMsg.hidden = false;
        tryMsg.textContent = 'AR could not start on this phone. It needs Chrome on an ARCore Android phone, or Safari on an iPhone or iPad.';
      }
    });
    stage.append(mv);
    return mv;
  }

  async function showTry(product, place) {
    trying = { product, place };
    placeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.place === place)));
    $('tryTitle').textContent = `Try ${product.name} in your room`;
    $('tryInfo').textContent = [product.brand, product.size, product.finish].filter(Boolean).join(' · ');
    $('tryFacts').innerHTML = `<span>Tile size <b>${safe(product.size || 'not given')}</b></span><span>Shown at true size, with grout lines</span>`;
    tryMsg.hidden = false;
    tryMsg.textContent = 'Preparing the 3D tiles…';
    try {
      await getViewer();
    } catch {
      tryMsg.textContent = 'The 3D viewer could not load. Check the internet connection and try again.';
      return;
    }
    if (trying?.product !== product || trying.place !== place) return;
    viewer ||= makeViewer();
    viewer.querySelector('.try-ar').innerHTML = `${AR_ICON} View on your ${place}`;
    viewer.setAttribute('ar-placement', place);
    // A little room round the tiles, so they never fill the screen edge to edge.
    viewer.setAttribute('camera-orbit', place === 'wall' ? '0deg 82deg 140%' : '25deg 58deg 140%');
    viewer.setAttribute('alt', `${product.name} tiles, ${product.size || ''}`);
    viewer.setAttribute('src', modelUrl(product, place));
    // The QR code only matters where this device cannot do AR itself.
    getQr().then(() => {
      if (trying?.product !== product) return;
      const box = $('tryQr');
      const canvas = document.createElement('canvas');
      new window.QRious({ element: canvas, value: shareUrl(product, place), size: 320, level: 'M', padding: 0 });
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'QR code to open this tile on a phone');
      box.replaceChildren(canvas);
    }).catch(() => { $('tryQr').textContent = 'QR code unavailable'; });
  }

  function openTry(product, place = placeFor(product)) {
    dialog.dataset.ar = 'no';
    if (!dialog.open) dialog.showModal();
    showTry(product, place);
  }
  dialog.addEventListener('close', () => { trying = null; });
  $('tryClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  placeButtons.forEach((b) => b.addEventListener('click', () => {
    if (trying && trying.place !== b.dataset.place) showTry(trying.product, b.dataset.place);
  }));
  grid.addEventListener('click', (e) => {
    const button = e.target.closest('.try-btn');
    if (button && shown[button.dataset.i]) openTry(shown[button.dataset.i]);
  });
  // Opened from the QR code on another device.
  if (ownPhoto(params.get('try'))) {
    const p = (k) => params.get(k) || '';
    openTry({ imageUrl: p('try'), name: p('n') || 'This tile', size: p('s'), finish: p('f'), brand: p('b'), category: p('c') }, p('place') === 'wall' ? 'wall' : 'floor');
  }
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
