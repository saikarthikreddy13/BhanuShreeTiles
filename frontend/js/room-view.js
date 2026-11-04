// 360° room view: the chosen tile laid at its real size on the floor or walls of a room the
// customer can look around in. Loaded only when someone opens it, so the catalogue stays light.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const ROOM = { w: 5, d: 6, h: 3 };   // metres
const EYE = 1.55;

/** "600x1200 mm, 9 mm thick" -> { a: 0.6, b: 1.2 } in metres. */
function tileSize(text) {
  const m = /(\d+)\s*x\s*(\d+)/i.exec(text || '');
  const a = m ? Number(m[1]) / 1000 : 0.6;
  const b = m ? Number(m[2]) / 1000 : 0.6;
  return { a: a || 0.6, b: b || 0.6 };
}

export function defaultPlace(product) {
  return /wall|elevation/i.test(`${product.category} ${product.finish}`) ? 'wall' : 'floor';
}

function loadPhoto(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('photo'));
    img.src = src;
  });
}

/** One tile with a thin grout line on two edges, so repeats show the joints. */
function tileTexture(img, across, down, anisotropy) {
  const width = 512;
  const height = Math.max(64, Math.round(width * (down / across)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.min(height, 2048);
  const g = canvas.getContext('2d');
  // Cover the tile with the photo, cropping rather than stretching it.
  const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  g.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  g.fillStyle = 'rgba(205, 200, 192, .95)';
  const grout = Math.max(2, Math.round(canvas.width * 0.006));
  g.fillRect(canvas.width - grout, 0, grout, canvas.height);
  g.fillRect(0, canvas.height - grout, canvas.width, grout);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}

function roughnessFor(finish) {
  const f = (finish || '').toLowerCase();
  if (/high gloss|polish|glossy|gloss|luster|silk|infinia/.test(f)) return 0.18;
  if (/satin|sugar|lapatto/.test(f)) return 0.45;
  return 0.8;
}

/**
 * Opens the viewer inside `host` (an element with a size). Returns { setPlace, close }.
 * `place` is 'floor', 'wall' or 'both'.
 */
export async function openRoomView(host, product, place) {
  const photo = await loadPhoto(product.imageUrl);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f2efe9');
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 50);
  camera.position.set(0, EYE, 0);

  scene.add(new THREE.HemisphereLight('#ffffff', '#b9b2a6', 1.6));
  const lamp = new THREE.PointLight('#fff4e2', 28, 14, 1.6);
  lamp.position.set(0, ROOM.h - 0.2, 0);
  scene.add(lamp);
  const daylight = new THREE.DirectionalLight('#ffffff', 1.4);
  daylight.position.set(ROOM.w, ROOM.h * 1.4, -ROOM.d);
  scene.add(daylight);

  const { a, b } = tileSize(product.size);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const shine = roughnessFor(product.finish);
  // Floors use the size as written; walls put the long side across, as tilers usually do.
  const floorTex = tileTexture(photo, a, b, anisotropy);
  floorTex.repeat.set(ROOM.w / a, ROOM.d / b);
  const wallA = Math.max(a, b);
  const wallB = Math.min(a, b);
  const wallTexture = (length) => {
    const t = tileTexture(photo, wallA, wallB, anisotropy);
    t.repeat.set(length / wallA, ROOM.h / wallB);
    return t;
  };

  const plain = (colour, rough = 0.9) => new THREE.MeshStandardMaterial({ color: colour, roughness: rough });
  const tiled = (map) => new THREE.MeshStandardMaterial({ map, roughness: shine, metalness: 0 });
  const materials = {
    floorTiled: tiled(floorTex),
    floorPlain: plain('#cfc8bd', 0.85),
    wallPlain: plain('#ece8e1'),
    wallsTiled: [wallTexture(ROOM.w), wallTexture(ROOM.d), wallTexture(ROOM.w), wallTexture(ROOM.d)].map(tiled),
  };

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), materials.floorTiled);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), plain('#fbfaf8'));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.h;
  scene.add(ceiling);

  // Four walls facing inwards: back, right, front, left.
  const walls = [
    [ROOM.w, 0, -ROOM.d / 2, 0],
    [ROOM.d, ROOM.w / 2, 0, -Math.PI / 2],
    [ROOM.w, 0, ROOM.d / 2, Math.PI],
    [ROOM.d, -ROOM.w / 2, 0, Math.PI / 2],
  ].map(([length, x, z, turn]) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, ROOM.h), materials.wallPlain);
    wall.position.set(x, ROOM.h / 2, z);
    wall.rotation.y = turn;
    scene.add(wall);
    return wall;
  });

  // A skirting strip and a bright window pane give the eye a sense of scale.
  const skirting = plain('#ffffff', 0.6);
  walls.forEach((wall) => {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(wall.geometry.parameters.width, 0.08), skirting);
    strip.position.set(wall.position.x * 0.998, 0.04, wall.position.z * 0.998);
    strip.rotation.y = wall.rotation.y;
    strip.visible = false;
    wall.userData.skirting = strip;
    scene.add(strip);
  });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  pane.position.set(0.6, 1.65, -ROOM.d / 2 + 0.01);
  scene.add(pane);

  function setPlace(where) {
    const onFloor = where === 'floor' || where === 'both';
    const onWalls = where === 'wall' || where === 'both';
    floor.material = onFloor ? materials.floorTiled : materials.floorPlain;
    walls.forEach((wall, i) => {
      wall.material = onWalls ? materials.wallsTiled[i] : materials.wallPlain;
      wall.userData.skirting.visible = !onWalls;
    });
    pane.visible = !onWalls;
    // Look down at a floor, straight ahead at a wall.
    pitch = onFloor && !onWalls ? -0.5 : -0.12;
  }

  // Looking around: drag (mouse or finger), arrow keys, wheel or pinch to zoom.
  let yaw = 0.5;
  let pitch = -0.5;
  let drag = null;
  let pinch = null;
  let touched = false;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Room view. Drag or use arrow keys to look around.');
  const pointers = new Map();
  canvas.addEventListener('pointerdown', (e) => {
    touched = true;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);
    if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      const span = Math.hypot(p.clientX - q.clientX, p.clientY - q.clientY);
      if (pinch) camera.fov = THREE.MathUtils.clamp(camera.fov * (pinch / span), 35, 90);
      pinch = span;
      camera.updateProjectionMatrix();
      return;
    }
    const speed = (camera.fov / 70) * 0.0055;
    // The room follows the finger, as in a panorama.
    yaw -= (e.clientX - drag.x) * speed;
    pitch = THREE.MathUtils.clamp(pitch + (e.clientY - drag.y) * speed, -1.35, 1.1);
    drag = { x: e.clientX, y: e.clientY };
  });
  const lift = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.03, 35, 90);
    camera.updateProjectionMatrix();
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] }[e.key];
    if (!step) return;
    e.preventDefault();
    touched = true;
    yaw += step[0];
    pitch = THREE.MathUtils.clamp(pitch + step[1], -1.35, 1.1);
  });

  const size = () => {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const watcher = new ResizeObserver(size);
  watcher.observe(host);
  size();

  let frame = 0;
  let last = performance.now();
  const look = new THREE.Vector3();
  const draw = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!touched && !still) yaw += dt * 0.12;   // turns slowly until the customer takes over
    look.set(Math.sin(yaw) * Math.cos(pitch), EYE + Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(look);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  };
  setPlace(place);
  frame = requestAnimationFrame(draw);

  function close() {
    cancelAnimationFrame(frame);
    watcher.disconnect();
    scene.traverse((thing) => {
      if (thing.geometry) thing.geometry.dispose();
      const list = Array.isArray(thing.material) ? thing.material : [thing.material];
      list.forEach((m) => { if (m) { m.map?.dispose(); m.dispose(); } });
    });
    Object.values(materials).flat().forEach((m) => { m.map?.dispose(); m.dispose(); });
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }

  return { setPlace, close };
}
