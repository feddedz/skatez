import * as THREE from 'three';

/* =========================================================================
   Concrete Wave — a small 3D skateboarding game (Three.js, no build step)
   ========================================================================= */

const $ = (id) => document.getElementById(id);
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
const angDiff = (a, b) => wrap(a - b);
const ease = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

// ---------- tuning ----------
const G = 20;                 // gravity (m/s²) — a bit floaty-snappy for arcade feel
const PUSH_ACC = 9, MAX_PUSH = 13, MAX_SPEED = 24;
const TURN_RATE = 2.5, AIR_SPIN = 7.5;
const OLLIE_V = 6.8, OLLIE_CHARGE_V = 2.4, CHARGE_TIME = 0.45;
const VERT_BOOST = 1.25;      // extra pop off quarter pipes
const PARK = 57, SESSION = 120;
const SPAWN = { x: 0, z: -30, yaw: 0 };
const BOARD_Y = 0.095;

const TRICKS = {
  kickflip:   { name: 'Kickflip',     pts: 100, dur: 0.42 },
  heelflip:   { name: 'Heelflip',     pts: 100, dur: 0.42 },
  shove:      { name: 'Pop Shove-It', pts: 80,  dur: 0.36 },
  impossible: { name: 'Impossible',   pts: 150, dur: 0.5 },
};

/* ---------------- renderer / scene ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = 0x8fc8ff;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 190);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 500);
scene.add(new THREE.HemisphereLight(0xe6f2ff, 0x806a52, 1.25));
const sun = new THREE.DirectionalLight(0xfff3df, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------------- textures / materials ---------------- */
function concreteTexture(base, joints) {
  const size = 256, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    g.beginPath(); g.arc(Math.random() * size, Math.random() * size, Math.random() * 18, 0, TAU); g.fill();
  }
  if (joints) { g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, size - 3, size - 3); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const MAT = {
  qp: mat(0xcfd5de), wedge: mat(0xd9cbb3), box: mat(0xbcb5a8), funbox: mat(0xc7c0ff),
  metal: mat(0xb8c0c8, { metalness: 0.8, roughness: 0.3 }),
  rail: mat(0xff5a36, { metalness: 0.4, roughness: 0.35 }),
  post: mat(0x2b2f36, { metalness: 0.5, roughness: 0.5 }),
};

/* ---------------- world ---------------- */
{
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mat(0x6f9e4c, { roughness: 1 }));
  grass.rotation.x = -PI / 2; grass.position.y = -0.02; grass.receiveShadow = true; scene.add(grass);

  const tex = concreteTexture('#a9a9a4', true); tex.repeat.set(30, 30);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  ground.rotation.x = -PI / 2; ground.receiveShadow = true; scene.add(ground);

  // perimeter walls with colorful panels
  const wallColors = [0xff5a36, 0xffd23f, 0x3ddc97, 0x4aa8ff, 0xc77dff];
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < 12; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 0.8), mat(wallColors[(i + side) % 5]));
      const along = -55 + i * 10;
      const r = side * PI / 2;
      w.position.set(Math.sin(r) * 60.4 + Math.cos(r) * along, 0.8, Math.cos(r) * 60.4 - Math.sin(r) * along);
      w.rotation.y = r; w.castShadow = w.receiveShadow = true; scene.add(w);
    }
  }
  // trees + far buildings
  const trunk = mat(0x6b4a2f), leaf = mat(0x3f7f3a), leaf2 = mat(0x5a9a3c);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * TAU + Math.random() * 0.1, r = 70 + Math.random() * 35;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, s = 0.8 + Math.random() * 0.8;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 3 * s, 7), trunk);
    t.position.set(x, 1.5 * s, z); t.castShadow = true; scene.add(t);
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 * s, 0), Math.random() < 0.5 ? leaf : leaf2);
    l.position.set(x, 4 * s, z); l.castShadow = true; scene.add(l);
  }
  const bcols = [0xe8d5b7, 0xb7c9e8, 0xe8b7b7, 0xc9e8b7, 0xd8d8d8];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.2, r = 135 + Math.random() * 30;
    const h = 15 + Math.random() * 35, w = 14 + Math.random() * 14;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat(bcols[i % 5], { roughness: 1 }));
    b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r); b.rotation.y = -a; scene.add(b);
  }
}

/* ---------------- obstacles (height field) ---------------- */
const obstacles = [];
const rails = [];

function addMesh(o, geo, material) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(o.x, 0, o.z); m.rotation.y = o.rot;
  m.castShadow = m.receiveShadow = true; scene.add(m);
  return m;
}
function prep(o, radius) {
  o.c = Math.cos(o.rot); o.s = Math.sin(o.rot); o.r2 = (radius + 1) ** 2;
  obstacles.push(o); return o;
}
// local (lx,lz) of an obstacle -> world (x,z)
function toWorld(o, lx, lz) { return [o.x + lx * o.c + lz * o.s, o.z - lx * o.s + lz * o.c]; }

function addBox(x, z, w, d, h, rot = 0, material = MAT.box) {
  const o = prep({ type: 'box', x, z, w, d, h, rot }, Math.hypot(w, d) / 2);
  const geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, h / 2, 0);
  addMesh(o, geo, material); return o;
}
function extruded(points, width) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  geo.rotateY(-PI / 2); geo.translate(width / 2, 0, 0);   // shape-x -> local +z, extrusion -> local x
  return geo;
}
// wedge: low edge at (x,z), rises along local +z
function addWedge(x, z, w, len, h, rot = 0, material = MAT.wedge) {
  const o = prep({ type: 'wedge', x, z, w, len, h, rot }, Math.hypot(w / 2, len));
  addMesh(o, extruded([[0, 0], [len, h], [len, 0]], w), material); return o;
}
// quarter pipe: base line at (x,z), curves up along local +z, flat deck behind the lip
function addQP(x, z, rot, w, R, deck) {
  const lip = R * 0.9, hLip = R - Math.sqrt(R * R - lip * lip);
  const o = prep({ type: 'qp', x, z, rot, w, R, lip, hLip, deck }, Math.hypot(w / 2, lip + deck));
  const pts = [[0, 0]];
  const N = 28;
  for (let i = 1; i <= N; i++) { const u = (lip * i) / N; pts.push([u, R - Math.sqrt(R * R - u * u)]); }
  pts.push([lip + deck, hLip], [lip + deck, 0]);
  addMesh(o, extruded(pts, w), MAT.qp);
  // metal coping along the lip
  const [cx, cz] = toWorld(o, 0, lip);
  const cop = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, w, 10), MAT.metal);
  cop.rotation.set(0, rot, PI / 2, 'YXZ');
  cop.position.set(cx, hLip, cz); cop.castShadow = true; scene.add(cop);
  return o;
}

function addRail(ax, ay, az, bx, by, bz, { visible = true, posts = true } = {}) {
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
  const d = b.clone().sub(a), len = d.length();
  const r = { a, b, d, len, dir: d.clone().divideScalar(len), lenH2: d.x * d.x + d.z * d.z };
  rails.push(r);
  const rad = visible ? 0.055 : 0.03;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 12), visible ? MAT.rail : MAT.metal);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), r.dir);
  m.castShadow = true; scene.add(m);
  if (visible && posts) {
    const n = Math.max(2, Math.round(len / 3) + 1);
    for (let i = 0; i < n; i++) {
      const t = 0.06 + (0.88 * i) / (n - 1);
      const p = a.clone().addScaledVector(d, t);
      const gh = heightAt(p.x, p.z);
      const hh = p.y - gh; if (hh < 0.08) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, hh, 8), MAT.post);
      post.position.set(p.x, gh + hh / 2, p.z); post.castShadow = true; scene.add(post);
    }
  }
  return r;
}

const HG = { h: 0, gx: 0, gz: 0 }, HG3 = { h: 0, gx: 0, gz: 0 }, HV = { h: 0, gx: 0, gz: 0 };
// Ground height + analytic gradient at a world point (max of all surfaces).
function heightAt(x, z, out) {
  let best = 0, bgx = 0, bgz = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    const dx = x - o.x, dz = z - o.z;
    if (dx * dx + dz * dz > o.r2) continue;
    const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
    let h = -1, dl = 0;
    if (o.type === 'box') {
      if (Math.abs(lx) <= o.w / 2 && Math.abs(lz) <= o.d / 2) h = o.h;
    } else if (o.type === 'wedge') {
      if (Math.abs(lx) <= o.w / 2 && lz >= 0 && lz <= o.len) { h = (o.h * lz) / o.len; dl = o.h / o.len; }
    } else if (Math.abs(lx) <= o.w / 2 && lz >= 0) { // qp
      if (lz <= o.lip) { const q = Math.sqrt(o.R * o.R - lz * lz); h = o.R - q; dl = lz / q; }
      else if (lz <= o.lip + o.deck) h = o.hLip;
    }
    if (h > best) { best = h; bgx = dl * o.s; bgz = dl * o.c; }
  }
  if (out) { out.h = best; out.gx = bgx; out.gz = bgz; }
  return best;
}

// ---- park layout ----
addQP(0, 44, 0, 52, 4.2, 4);            // north
addQP(0, -44, PI, 52, 4.2, 4);          // south
addQP(44, 0, PI / 2, 34, 3.6, 3);       // east
addQP(-44, 0, -PI / 2, 34, 3.6, 3);     // west

// funbox with a rail on top
addWedge(0, -6, 8, 4, 1.0, 0, MAT.funbox);
addBox(0, 0, 8, 4, 1.0, 0, MAT.funbox);
addWedge(0, 6, 8, 4, 1.0, PI, MAT.funbox);

// kickers
addWedge(-14, -20, 3, 3.5, 1.1, 0);
addWedge(14, -20, 3, 3.5, 1.1, 0);
addWedge(-14, 20, 3, 3.5, 1.1, PI);
addWedge(14, 20, 3, 3.5, 1.1, PI);

// the gap: kicker -> 5 m gap -> landing
addWedge(-34, -10, 3, 3.5, 1.1, PI / 2);
addWedge(-21.5, -10, 3, 4, 1.1, -PI / 2);

// platform + stair set
addWedge(30, 3, 8, 4, 1.5, 0);
addBox(30, 10, 8, 6, 1.5);
addBox(30, 13.35, 8, 0.7, 1.125);
addBox(30, 14.05, 8, 0.7, 0.75);
addBox(30, 14.75, 8, 0.7, 0.375);

// ledges
addBox(10, 0, 0.9, 10, 0.5);
addBox(-10, 0, 0.9, 10, 0.5);

// rails (after obstacles so posts find the ground)
addRail(0, 1.45, -2, 0, 1.45, 2);                       // funbox rail
addRail(-20, 0.6, -5, -20, 0.6, 9);                     // flat rail
addRail(33.6, 2.35, 12.6, 33.6, 0.85, 15.6);            // handrail down the stairs
addRail(10, 0.5, -5, 10, 0.5, 5, { visible: false });   // ledge edges
addRail(-10, 0.5, -5, -10, 0.5, 5, { visible: false });
addRail(26.1, 1.5, 7.2, 26.1, 1.5, 12.8, { visible: false }); // platform edge

/* ---------------- S-K-A-T-E letters ---------------- */
function letterSprite(ch) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(64, 64, 56, 0, TAU); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#0f1724'; g.stroke();
  g.fillStyle = '#0f1724'; g.font = '900 76px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t }));
  s.scale.set(1.3, 1.3, 1); scene.add(s); return s;
}
const LETTERS = [
  { ch: 'S', p: [0, 3.0, 0] },        // over the funbox
  { ch: 'K', p: [-27.8, 3.6, -10] },  // over the gap
  { ch: 'A', p: [30, 3.2, 15.9] },    // off the stairs
  { ch: 'T', p: [10, 5.0, 47.4] },    // big air on the north quarter
  { ch: 'E', p: [-20, 2.3, 2] },      // over the flat rail
].map((l) => ({ ...l, sprite: letterSprite(l.ch), got: false }));

/* ---------------- skater model ---------------- */
const root = new THREE.Group(); scene.add(root);
const tilt = new THREE.Group(); root.add(tilt);
const boardPivot = new THREE.Group(); tilt.add(boardPivot);
const rider = new THREE.Group(); tilt.add(rider);
function part(geo, material, parent, x, y, z) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}
{
  const deckSide = mat(0xff5a36, { roughness: 0.6 });
  const deckMats = [deckSide, deckSide, mat(0x1e1e1e, { roughness: 1 }), mat(0xffd23f, { roughness: 0.6 }), deckSide, deckSide];
  part(new THREE.BoxGeometry(0.22, 0.022, 0.62), deckMats, boardPivot, 0, 0, 0);
  const kick = new THREE.BoxGeometry(0.22, 0.022, 0.15);
  part(kick, deckMats, boardPivot, 0, 0.024, 0.375).rotation.x = -0.35;
  part(kick, deckMats, boardPivot, 0, 0.024, -0.375).rotation.x = 0.35;
  const truckGeo = new THREE.BoxGeometry(0.19, 0.035, 0.05);
  const wheelGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.035, 12); wheelGeo.rotateZ(PI / 2);
  const wheelMat = mat(0xfff3d6, { roughness: 0.5 });
  for (const z of [-0.22, 0.22]) {
    part(truckGeo, MAT.metal, boardPivot, 0, -0.03, z);
    for (const x of [-0.1, 0.1]) part(wheelGeo, wheelMat, boardPivot, x, -0.062, z);
  }
}
const arms = {};
{
  const skin = mat(0xf1c27d), shirt = mat(0x2f80ed), pants = mat(0x1f2937), shoe = mat(0xf5f5f5), cap = mat(0xe53935);
  // rider faces local -x (sideways on the board, nose = +z)
  for (const z of [-0.2, 0.2]) {
    part(new THREE.BoxGeometry(0.27, 0.07, 0.11), shoe, rider, -0.02, 0.035, z);
    part(new THREE.BoxGeometry(0.13, 0.8, 0.15), pants, rider, 0, 0.47, z * 0.85).rotation.x = z > 0 ? -0.07 : 0.07;
  }
  part(new THREE.BoxGeometry(0.25, 0.6, 0.44), shirt, rider, 0, 1.15, 0);
  part(new THREE.SphereGeometry(0.13, 14, 10), skin, rider, -0.01, 1.58, 0);
  const capTop = part(new THREE.SphereGeometry(0.137, 14, 8, 0, TAU, 0, PI / 2), cap, rider, -0.01, 1.6, 0);
  capTop.scale.y = 0.8;
  part(new THREE.BoxGeometry(0.15, 0.02, 0.2), cap, rider, -0.15, 1.62, 0);
  for (const [key, z] of [['front', 0.27], ['back', -0.27]]) {
    const pivot = new THREE.Group(); pivot.position.set(0, 1.4, z); rider.add(pivot);
    part(new THREE.BoxGeometry(0.1, 0.56, 0.1), shirt, pivot, 0, -0.27, 0);
    part(new THREE.SphereGeometry(0.06, 8, 6), skin, pivot, 0, -0.58, 0);
    arms[key] = pivot;
  }
}

/* ---------------- player state ---------------- */
const P = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, speed: 0, vyG: 0,
  state: 'ground', charging: false, charge: 0, coyote: 0, pushing: false,
  airTime: 0, spinAccum: 0, launchY: 0, maxY: 0, ollied: false, vert: false, vertYaw: 0, vertRate: 4,
  trick: null, airTricks: 0, grab: false, grabTime: 0,
  grind: null, bal: 0, balV: 0, grindCooldown: 0, lastRail: null,
  bailT: 0, landSquash: 0,
};

/* ---------------- game / combo state ---------------- */
function loadBest() { try { return +localStorage.getItem('concreteWave.best') || 0; } catch { return 0; } }
function saveBest(v) { try { localStorage.setItem('concreteWave.best', String(v)); } catch { /* ignore */ } }
const game = { started: false, running: false, paused: false, mode: 'session', time: SESSION, timeUp: false, score: 0, best: loadBest() };
const combo = { list: [], base: 0 };

function popup(text, cls = 'info') {
  const el = $('popup'); el.textContent = text; el.className = ''; void el.offsetWidth; el.className = 'show ' + cls;
}
function addTrick(name, pts) {
  const reps = combo.list.filter((n) => n === name).length;
  pts = Math.max(10, Math.round(pts * Math.pow(0.6, reps)));   // repeats are worth less
  combo.list.push(name); combo.base += pts;
}
function bankCombo() {
  if (!combo.list.length) return;
  const total = Math.round(combo.base) * combo.list.length;
  game.score += total;
  const label = combo.list.length > 1 ? `${combo.list.length}-trick combo  +${total.toLocaleString()}` : `${combo.list[0]}  +${total.toLocaleString()}`;
  popup(label, 'good');
  combo.list = []; combo.base = 0;
}
function loseCombo(silent) {
  if (combo.list.length && !silent) popup('BAILED!', 'bad');
  combo.list = []; combo.base = 0;
}

/* ---------------- input ---------------- */
const keys = new Set();
const trickQueue = [];
const input = { steer: 0, push: false, brake: false, ollie: false, grab: false };
const TRICK_KEYS = { KeyJ: 'kickflip', KeyK: 'heelflip', KeyL: 'shove', KeyI: 'impossible' };
let prevOllie = false;

addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (TRICK_KEYS[e.code]) trickQueue.push(TRICK_KEYS[e.code]);
  if (e.code === 'KeyR' && game.running && !game.paused) { loseCombo(true); resetPlayer(); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') { audio.muted = !audio.muted; popup(audio.muted ? 'Sound off' : 'Sound on'); }
  if (e.code === 'Enter' && !game.running && !$('menu').classList.contains('hidden')) startGame('session');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden && game.running && !game.paused) togglePause(); });

// touch controls
const touch = { x: 0, y: 0, ollie: false, grab: false };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
{
  const zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob');
  let sid = null, sx = 0, sy = 0;
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault(); sid = e.pointerId; zone.setPointerCapture(sid);
    const r = zone.getBoundingClientRect(); sx = e.clientX; sy = e.clientY;
    base.classList.add('on'); base.style.left = sx - r.left + 'px'; base.style.top = sy - r.top + 'px';
    initAudio();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid) return;
    let dx = (e.clientX - sx) / 55, dy = (e.clientY - sy) / 55; const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    touch.x = dx; touch.y = dy; knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`;
  });
  const end = (e) => {
    if (e.pointerId !== sid) return; sid = null; touch.x = touch.y = 0;
    knob.style.transform = ''; base.classList.remove('on'); base.style.left = ''; base.style.top = '';
  };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  for (const btn of document.querySelectorAll('#tbtns button')) {
    const b = btn.dataset.b;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); btn.setPointerCapture(e.pointerId); btn.classList.add('down');
      if (b === 'ollie') touch.ollie = true; else if (b === 'grab') touch.grab = true; else trickQueue.push(b);
    });
    const up = () => { btn.classList.remove('down'); if (b === 'ollie') touch.ollie = false; if (b === 'grab') touch.grab = false; };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
  }
  $('touchPause').addEventListener('click', togglePause);
}

function readInput() {
  const k = (c) => keys.has(c);
  let steer = (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0);
  if (Math.abs(touch.x) > 0.15) steer = -touch.x;
  input.steer = clamp(steer, -1, 1);
  input.push = k('KeyW') || k('ArrowUp') || touch.y < -0.4;
  input.brake = k('KeyS') || k('ArrowDown') || touch.y > 0.55;
  input.ollie = k('Space') || touch.ollie;
  input.grab = k('KeyH') || touch.grab;
}

/* ---------------- audio (procedural) ---------------- */
const audio = { ctx: null, muted: false };
function initAudio() {
  if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = new AC(); audio.ctx = ctx;
    const n = ctx.sampleRate * 2;
    const white = ctx.createBuffer(1, n, ctx.sampleRate), brown = ctx.createBuffer(1, n, ctx.sampleRate);
    const w = white.getChannelData(0), b = brown.getChannelData(0); let l = 0;
    for (let i = 0; i < n; i++) { const r = Math.random() * 2 - 1; w[i] = r; l = (l + 0.02 * r) / 1.02; b[i] = l * 3.5; }
    audio.white = white;
    audio.master = ctx.createGain(); audio.master.gain.value = 0.7; audio.master.connect(ctx.destination);
    const loop = (buf, type, freq, q) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(audio.master); s.start(); return { f, g };
    };
    audio.roll = loop(brown, 'lowpass', 400, 0.8);
    audio.grind = loop(white, 'bandpass', 2600, 3);
  } catch { audio.ctx = null; }
}
function burst(freq, type, dur, vol, q = 1) {
  const a = audio; if (!a.ctx || a.muted) return;
  const t = a.ctx.currentTime;
  const s = a.ctx.createBufferSource(); s.buffer = a.white;
  const f = a.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(a.master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
function tone(freq, start, dur, vol) {
  const a = audio; if (!a.ctx || a.muted) return;
  const t = a.ctx.currentTime + start;
  const o = a.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
  const g = a.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(a.master); o.start(t); o.stop(t + dur + 0.05);
}
function sfx(name, v = 1) {
  switch (name) {
    case 'pop': burst(1500, 'bandpass', 0.06, 0.9, 1.5); burst(260, 'lowpass', 0.09, 0.7); break;
    case 'land': burst(170, 'lowpass', 0.2, Math.min(1, 0.3 + v * 0.7)); burst(1000, 'bandpass', 0.05, 0.35 * v); break;
    case 'bump': burst(120, 'lowpass', 0.15, 0.6); break;
    case 'grind': burst(3200, 'bandpass', 0.12, 0.6, 2); break;
    case 'bail': burst(140, 'lowpass', 0.45, 1); burst(700, 'bandpass', 0.3, 0.5); break;
    case 'coin': tone(880, 0, 0.12, 0.25); tone(1320, 0.08, 0.2, 0.25); break;
    case 'bank': tone(660, 0, 0.1, 0.15); tone(990, 0.07, 0.16, 0.15); break;
  }
}
function updateAudio() {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime;
  const on = game.running && !game.paused && !audio.muted;
  const sp = Math.abs(P.speed);
  audio.roll.g.gain.setTargetAtTime(on && P.state === 'ground' ? Math.min(0.55, (sp / 13) * 0.55) : 0, t, 0.04);
  audio.roll.f.frequency.setTargetAtTime(250 + sp * 45, t, 0.1);
  audio.grind.g.gain.setTargetAtTime(on && P.state === 'grind' ? 0.22 : 0, t, 0.03);
}

/* ---------------- physics ---------------- */
function launch(vx, vy, vz, gx, gz, ox, oz, ollied) {
  P.state = 'air'; P.vel.set(vx, vy, vz);
  P.airTime = 0; P.spinAccum = 0; P.launchY = P.pos.y; P.maxY = P.pos.y; P.ollied = ollied;
  P.vert = false; P.trick = null; P.grab = false; P.grabTime = 0; P.airTricks = 0;
  const gm = Math.hypot(gx, gz);
  if (gm > 1.3 && vx * gx + vz * gz > 0) {
    // leaving a steep transition: go straight up so we come back down onto the ramp
    const ux = gx / gm, uz = gz / gm, d = vx * ux + vz * uz;
    P.vel.x -= ux * d; P.vel.z -= uz * d;
    P.vel.y *= VERT_BOOST;
    P.pos.x = ox - ux * 0.1; P.pos.z = oz - uz * 0.1;
    P.vert = true; P.vertYaw = Math.atan2(-ux, -uz);
    const airT = Math.max(0.3, (2 * Math.max(P.vel.y, 0)) / G);
    P.vertRate = Math.max(4, PI / (airT * 0.7));
  }
}

function doOllie() {
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  heightAt(P.pos.x, P.pos.z, HG);
  const gf = HG.gx * fx + HG.gz * fz, sh = P.speed / Math.sqrt(1 + gf * gf);
  const pow = OLLIE_V + OLLIE_CHARGE_V * (P.charge / CHARGE_TIME);
  P.charging = false;
  launch(fx * sh, P.vyG + pow, fz * sh, HG.gx, HG.gz, P.pos.x, P.pos.z, true);
  P.pos.y += 0.02;
  sfx('pop');
}

function updateGround(dt, ollieDown, ollieUp) {
  const h0 = heightAt(P.pos.x, P.pos.z, HG), gx0 = HG.gx, gz0 = HG.gz;
  const steer = P.speed < -0.5 ? -input.steer : input.steer; // rolling fakie flips steering
  P.yaw += steer * TURN_RATE * (0.5 + 0.5 * Math.min(1, Math.abs(P.speed) / 5)) * dt;
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  const gf = gx0 * fx + gz0 * fz, k = Math.sqrt(1 + gf * gf);

  // P.speed is speed along the surface
  let a = (-G * gf) / k;
  P.pushing = false;
  if (input.push && !P.charging) {
    if (P.speed >= 0 && P.speed < MAX_PUSH) { a += PUSH_ACC; P.pushing = true; }
    else if (P.speed < 0 && P.speed > -MAX_PUSH) { a -= PUSH_ACC; P.pushing = true; }
  }
  P.speed += a * dt;
  const fr = (0.3 + 0.005 * P.speed * P.speed + (input.brake ? 11 : 0)) * dt;
  P.speed = Math.abs(P.speed) <= fr ? 0 : P.speed - Math.sign(P.speed) * fr;
  P.speed = clamp(P.speed, -MAX_SPEED, MAX_SPEED);

  if (ollieDown) { P.charging = true; P.charge = 0; }
  if (P.charging) P.charge = Math.min(CHARGE_TIME, P.charge + dt);

  const sh = P.speed / k;
  const ox = P.pos.x, oz = P.pos.z, oy = P.pos.y;
  const nx = ox + fx * sh * dt, nz = oz + fz * sh * dt;
  if (Math.abs(nx) > PARK || Math.abs(nz) > PARK) { P.speed *= -0.4; sfx('bump'); return; }
  const h1 = heightAt(nx, nz, HG);
  if (h1 - (h0 + gx0 * (nx - ox) + gz0 * (nz - oz)) > 0.3) {   // ran into a wall / ledge side
    if (Math.abs(P.speed) > 3) sfx('bump');
    P.speed *= -0.35; return;
  }
  P.pos.x = nx; P.pos.z = nz;

  const yFree = oy + P.vyG * dt - 0.5 * G * dt * dt;
  if (yFree > h1 + 0.02) {          // surface fell away faster than gravity: airborne
    P.pos.y = yFree;
    const charging = P.charging;
    launch(fx * sh, P.vyG - G * dt, fz * sh, gx0, gz0, ox, oz, false);
    P.charging = charging; P.coyote = charging ? 0.15 : 0;   // allow a late ollie off the lip
    return;
  }
  P.pos.y = h1;
  const gf1 = HG.gx * fx + HG.gz * fz;
  P.vyG = (gf1 * P.speed) / Math.sqrt(1 + gf1 * gf1);
  if (ollieUp && P.charging) doOllie();
}

function startTrick(type) {
  if (P.state !== 'air' || P.trick || P.grab) return;
  P.trick = { type, t: 0, dur: TRICKS[type].dur };
}
function endGrab() {
  if (P.grab && P.grabTime > 0.2) { addTrick('Indy Grab', 80 + Math.round(P.grabTime * 220)); P.airTricks++; }
  P.grab = false; P.grabTime = 0;
}
function finishAir() {
  endGrab();
  const n = Math.floor((Math.abs(P.spinAccum) + 0.6) / PI);
  if (n > 0) addTrick(`${n * 180} Spin`, [0, 100, 250, 450, 700, 1000, 1400][Math.min(n, 6)]);
  if (P.airTricks === 0 && n === 0) {
    if (P.vert && P.airTime > 0.45) addTrick('Air', 60 + Math.round(Math.max(0, P.maxY - P.launchY) * 70));
    else if (P.ollied && P.airTime > 0.3) addTrick('Ollie', 30);
    else if (P.airTime > 0.75) addTrick('Big Air', Math.round(P.airTime * 70));
  }
  P.spinAccum = 0; P.airTricks = 0;
}

function updateAir(dt, ollieUp) {
  P.airTime += dt;
  if (P.charging) {
    P.coyote -= dt;
    if (ollieUp) {
      if (P.coyote > 0) { // late ollie right after leaving a lip
        P.vel.y = Math.max(P.vel.y, 0) + OLLIE_V + OLLIE_CHARGE_V * (P.charge / CHARGE_TIME);
        P.ollied = true; sfx('pop');
      }
      P.charging = false;
    } else if (P.coyote <= 0) P.charging = false;
  }

  const steer = input.steer;
  if (steer !== 0) { const s = steer * AIR_SPIN * dt; P.yaw += s; P.spinAccum += s; }
  else if (P.vert) {
    const d = wrap(P.vertYaw - P.yaw), m = P.vertRate * dt;
    P.yaw = Math.abs(d) <= m ? P.vertYaw : P.yaw + Math.sign(d || 1) * m;
  }

  if (input.grab && !P.trick) { if (!P.grab) { P.grab = true; P.grabTime = 0; } P.grabTime += dt; }
  else if (P.grab) endGrab();

  if (P.trick) {
    P.trick.t += dt;
    if (P.trick.t >= P.trick.dur) { const T = TRICKS[P.trick.type]; addTrick(T.name, T.pts); P.airTricks++; P.trick = null; }
  }

  P.vel.y -= G * dt;
  const ox = P.pos.x, oy = P.pos.y, oz = P.pos.z;
  const h0 = heightAt(ox, oz, HG), gx0 = HG.gx, gz0 = HG.gz;
  let nx = ox + P.vel.x * dt, nz = oz + P.vel.z * dt;
  const ny = oy + P.vel.y * dt;
  if (Math.abs(nx) > PARK) { nx = Math.sign(nx) * PARK; P.vel.x *= -0.3; }
  if (Math.abs(nz) > PARK) { nz = Math.sign(nz) * PARK; P.vel.z *= -0.3; }
  let h1 = heightAt(nx, nz, HG);
  if (ny < h1 && h1 - (h0 + gx0 * (nx - ox) + gz0 * (nz - oz)) > 0.3) {
    // hit the side of something — find which axis is blocked
    const hx = heightAt(nx, oz, HG3), hz = heightAt(ox, nz, HG3);
    const bx = ny < hx && hx - (h0 + gx0 * (nx - ox)) > 0.3;
    const bz = ny < hz && hz - (h0 + gz0 * (nz - oz)) > 0.3;
    if (bx || !bz) { nx = ox; P.vel.x *= -0.25; }
    if (bz || !bx) { nz = oz; P.vel.z *= -0.25; }
    sfx('bump');
    h1 = heightAt(nx, nz, HG);
  }
  P.pos.set(nx, ny, nz);
  P.maxY = Math.max(P.maxY, ny);
  if (checkRails(oy)) return;
  if (ny <= h1) land(h1);
}

function land(h) {
  const gx = HG.gx, gz = HG.gz, nl = Math.hypot(gx, 1, gz);
  const nx = -gx / nl, ny = 1 / nl, nz = -gz / nl;
  const vn = P.vel.x * nx + P.vel.y * ny + P.vel.z * nz;
  const vpx = P.vel.x - nx * vn, vpy = P.vel.y - ny * vn, vpz = P.vel.z - nz * vn;
  const vh = Math.hypot(vpx, vpz);
  P.pos.y = h;

  let ok = !(P.trick && P.trick.t < P.trick.dur * 0.8);
  let fakie = false;
  if (ok && vh > 1.2) {
    const vyaw = Math.atan2(vpx, vpz);
    let d = Math.abs(angDiff(P.yaw, vyaw));
    if (d > PI / 2) { fakie = true; d = PI - d; }
    if (d > (P.vert ? 1.1 : 0.7)) ok = false;
    else P.yaw = fakie ? vyaw + PI : vyaw;
  }
  if (!ok) { bail(); return; }

  const sp = Math.hypot(vpx, vpy, vpz);
  P.speed = vh > 1.2 ? (fakie ? -sp : sp) : 0;
  P.trick = null;
  finishAir();
  P.state = 'ground'; P.charging = false;
  const gf = gx * Math.sin(P.yaw) + gz * Math.cos(P.yaw);
  P.vyG = (gf * P.speed) / Math.sqrt(1 + gf * gf);
  const impact = Math.min(1, -vn / 12);
  P.landSquash = Math.max(0, impact);
  if (impact > 0.15) sfx('land', impact);
  if (combo.list.length) sfx('bank');
  bankCombo();
}

function checkRails(oy) {
  if (P.vel.y > 0) return false;
  for (const r of rails) {
    if (r === P.lastRail && P.grindCooldown > 0) continue;
    const dx = P.pos.x - r.a.x, dz = P.pos.z - r.a.z;
    const t = (dx * r.d.x + dz * r.d.z) / r.lenH2;
    if (t < 0 || t > 1) continue;
    const px = r.a.x + r.d.x * t, pz = r.a.z + r.d.z * t;
    if (Math.hypot(P.pos.x - px, P.pos.z - pz) > 0.55) continue;
    const ry = r.a.y + r.d.y * t;
    if (oy >= ry - 0.1 && P.pos.y <= ry + 0.35) { startGrind(r, t); return true; }
  }
  return false;
}

function startGrind(r, t) {
  if (P.trick && P.trick.t < P.trick.dur * 0.7) { bail(); return; }  // landed mid-flip
  P.trick = null;
  const along = P.vel.x * r.dir.x + P.vel.y * r.dir.y + P.vel.z * r.dir.z;
  let sign = Math.sign(along);
  if (Math.abs(along) < 1.5) sign = Math.sin(P.yaw) * r.dir.x + Math.cos(P.yaw) * r.dir.z >= 0 ? 1 : -1;
  if (!sign) sign = 1;
  finishAir();
  const travelYaw = Math.atan2(r.dir.x * sign, r.dir.z * sign);
  const q = Math.round(angDiff(P.yaw, travelYaw) / (PI / 2));
  P.yaw = travelYaw + q * (PI / 2);
  const slide = q % 2 !== 0;
  P.grind = { r, t, sign, speed: Math.max(4, Math.abs(along)), slide, travelYaw, time: 0 };
  P.state = 'grind'; P.bal = (Math.random() - 0.5) * 0.1; P.balV = 0;
  addTrick(slide ? 'Boardslide' : '50-50 Grind', slide ? 120 : 100);
  sfx('grind');
}

function updateGrind(dt, ollieDown) {
  const g = P.grind, r = g.r;
  g.time += dt;
  g.speed += (-G * r.dir.y * g.sign - 1.0) * dt;
  // balance: the needle drifts away from center faster the longer you grind
  const diff = 1 + g.time * 0.25;
  P.balV += (P.bal * 3 * diff + (Math.random() - 0.5) * 6 * diff) * dt;
  P.balV += -input.steer * 9 * dt;
  P.balV *= 1 - 1.5 * dt;
  P.bal += P.balV * dt;
  combo.base += 70 * dt;
  g.t += (g.sign * g.speed * dt) / r.len;
  const tt = clamp(g.t, 0, 1);
  P.pos.set(r.a.x + r.d.x * tt, r.a.y + r.d.y * tt, r.a.z + r.d.z * tt);
  if (Math.abs(P.bal) > 1) {
    P.vel.set(r.dir.x * g.sign * g.speed * 0.5, 0, r.dir.z * g.sign * g.speed * 0.5);
    bail(); return;
  }
  if (ollieDown) { exitGrind(true); return; }
  if (g.t < 0 || g.t > 1 || g.speed < 1) exitGrind(false);
}

function exitGrind(ollie) {
  const g = P.grind, r = g.r, v = g.speed;
  if (g.slide) P.yaw = g.travelYaw;
  P.grind = null; P.grindCooldown = 0.3; P.lastRail = r;
  launch(r.dir.x * g.sign * v, r.dir.y * g.sign * v + (ollie ? OLLIE_V : 1), r.dir.z * g.sign * v, 0, 0, P.pos.x, P.pos.z, ollie);
  P.pos.y += 0.03;
  if (ollie) sfx('pop');
}

const bf = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, vr: 0 };
function bail() {
  if (P.state === 'bail') return;
  loseCombo(); sfx('bail');
  P.state = 'bail'; P.bailT = 1.6;
  P.trick = null; P.grab = false; P.grind = null; P.charging = false; P.spinAccum = 0; P.speed = 0;
  Object.assign(bf, { x: 0, y: BOARD_Y, z: 0, vx: (Math.random() - 0.5) * 2, vy: 4, vz: 3, r: 0, vr: 9 });
}
function updateBail(dt) {
  P.bailT -= dt;
  P.vel.y -= G * dt;
  let nx = clamp(P.pos.x + P.vel.x * dt, -PARK, PARK), nz = clamp(P.pos.z + P.vel.z * dt, -PARK, PARK);
  let ny = P.pos.y + P.vel.y * dt;
  if (heightAt(nx, nz) > Math.max(ny, P.pos.y) + 0.3) { nx = P.pos.x; nz = P.pos.z; P.vel.x *= -0.3; P.vel.z *= -0.3; }
  const h = heightAt(nx, nz);
  if (ny <= h) { ny = h; P.vel.y = 0; const f = Math.max(0, 1 - 4 * dt); P.vel.x *= f; P.vel.z *= f; }
  P.pos.set(nx, ny, nz);
  if (P.bailT <= 0 && ny <= h + 0.01) recover();
}
function recover() {
  P.state = 'ground'; P.speed = 0; P.vel.set(0, 0, 0); P.vyG = 0; P.landSquash = 0;
  P.pos.y = heightAt(P.pos.x, P.pos.z);
}

function resetPlayer() {
  P.pos.set(SPAWN.x, 0, SPAWN.z); P.yaw = SPAWN.yaw; P.speed = 0; P.vel.set(0, 0, 0); P.vyG = 0;
  Object.assign(P, { state: 'ground', trick: null, grab: false, grind: null, charging: false, coyote: 0, spinAccum: 0, airTricks: 0, lastRail: null, grindCooldown: 0 });
  meshYaw = P.yaw; camYaw = P.yaw;
  camPos.set(P.pos.x - Math.sin(camYaw) * 6, 3, P.pos.z - Math.cos(camYaw) * 6);
  rider.rotation.set(0, 0, 0);
}

function collectLetters() {
  for (const L of LETTERS) {
    if (L.got) continue;
    const s = L.sprite.position;
    if (Math.hypot(P.pos.x - s.x, P.pos.y + 1 - s.y, P.pos.z - s.z) < 1.7) {
      L.got = true; L.sprite.visible = false; game.score += 500; sfx('coin');
      const n = LETTERS.filter((l) => l.got).length;
      if (n === LETTERS.length) { game.score += 2000; popup('S-K-A-T-E!  +2,500', 'good'); }
      else popup(`${L.ch}  +500`, 'info');
    }
  }
}

function step(dt) {
  while (trickQueue.length) { const t = trickQueue.shift(); if (P.state === 'air') startTrick(t); }
  const ollieDown = input.ollie && !prevOllie, ollieUp = !input.ollie && prevOllie;
  prevOllie = input.ollie;
  P.grindCooldown = Math.max(0, P.grindCooldown - dt);
  switch (P.state) {
    case 'ground': updateGround(dt, ollieDown, ollieUp); break;
    case 'air': updateAir(dt, ollieUp); break;
    case 'grind': updateGrind(dt, ollieDown); break;
    case 'bail': updateBail(dt); break;
  }
  collectLetters();
}

/* ---------------- visuals / camera ---------------- */
let meshYaw = 0, crouch = 0, visT = 0, camYaw = 0;
const camPos = new THREE.Vector3(0, 4, -40), camWant = new THREE.Vector3();

function updateVisuals(dt) {
  visT += dt;
  root.position.copy(P.pos);
  meshYaw += angDiff(P.yaw, meshYaw) * Math.min(1, dt * 16);
  root.rotation.y = meshYaw;

  let tp = 0, tr = 0;
  const fx = Math.sin(meshYaw), fz = Math.cos(meshYaw), rx = Math.cos(meshYaw), rz = -Math.sin(meshYaw);
  if (P.state === 'ground' || P.state === 'bail') {
    heightAt(P.pos.x, P.pos.z, HV);
    tp = -Math.atan(HV.gx * fx + HV.gz * fz); tr = Math.atan(HV.gx * rx + HV.gz * rz);
  } else if (P.state === 'grind') {
    const d = P.grind.r.dir, hl = Math.hypot(d.x, d.z) || 1, sl = d.y / hl;
    const gx = (sl * d.x) / hl, gz = (sl * d.z) / hl;
    tp = -Math.atan(gx * fx + gz * fz); tr = Math.atan(gx * rx + gz * rz);
  }
  const kt = Math.min(1, dt * 12);
  tilt.rotation.x += (tp - tilt.rotation.x) * kt;
  tilt.rotation.z += (tr - tilt.rotation.z) * kt;

  // board
  boardPivot.position.set(0, BOARD_Y, 0); boardPivot.rotation.set(0, 0, 0);
  let lift = 0;
  if (P.state === 'air') {
    lift = Math.min(0.12, P.airTime * 0.6);
    if (P.trick) {
      const p = ease(P.trick.t / P.trick.dur);
      lift += Math.sin(p * PI) * 0.25;
      if (P.trick.type === 'kickflip') boardPivot.rotation.z = p * TAU;
      else if (P.trick.type === 'heelflip') boardPivot.rotation.z = -p * TAU;
      else if (P.trick.type === 'shove') boardPivot.rotation.y = p * PI;
      else boardPivot.rotation.x = p * TAU;
    }
    boardPivot.position.y += lift;
  } else if (P.state === 'bail') {
    bf.vy -= G * dt; bf.x += bf.vx * dt; bf.y += bf.vy * dt; bf.z += bf.vz * dt; bf.r += bf.vr * dt;
    if (bf.y < BOARD_Y) { bf.y = BOARD_Y; bf.vy *= -0.35; bf.vx *= 0.6; bf.vz *= 0.6; bf.vr *= 0.5; }
    boardPivot.position.set(bf.x, bf.y, bf.z); boardPivot.rotation.set(bf.r, bf.r * 0.4, bf.r * 1.3);
  }

  // rider pose
  let cT = 0.05;
  if (P.state === 'ground') cT = P.charging ? 0.2 + 0.4 * (P.charge / CHARGE_TIME) : 0.05;
  else if (P.state === 'air') cT = P.charging ? 0.5 : P.grab ? 0.6 : 0.22;
  else if (P.state === 'grind') cT = 0.3;
  P.landSquash = Math.max(0, P.landSquash - dt * 3);
  cT += P.landSquash * 0.4;
  crouch += (cT - crouch) * Math.min(1, dt * 14);
  rider.scale.y = 1 - crouch * 0.4;
  rider.position.set(0, BOARD_Y + 0.012 + lift * 0.8 + (P.pushing ? Math.abs(Math.sin(visT * 9)) * 0.04 : 0), 0);

  const lean = P.state === 'ground' ? -input.steer * 0.2 * Math.min(1, Math.abs(P.speed) / 6)
    : P.state === 'grind' ? P.bal * 0.5 : 0;
  const leanZ = P.state === 'bail' ? 1.45 : lean;
  rider.rotation.z += (leanZ - rider.rotation.z) * Math.min(1, dt * (P.state === 'bail' ? 6 : 10));
  if (P.state === 'bail') rider.position.y = Math.max(0.02, rider.position.y - 0.1);

  let armOut = 0.3, grabArm = 0;
  if (P.state === 'air') armOut = P.grab ? 0.9 : 1.2;
  else if (P.state === 'grind') armOut = 1.1;
  else if (P.state === 'bail') armOut = 2.4;
  if (P.grab) grabArm = -0.55;
  const ka = Math.min(1, dt * 12);
  arms.front.rotation.x += (-armOut + (P.grab ? 0.9 : 0) - arms.front.rotation.x) * ka;
  arms.front.rotation.z += (grabArm - arms.front.rotation.z) * ka;
  arms.back.rotation.x += (armOut + (P.state === 'grind' ? P.bal * 0.6 : 0) - arms.back.rotation.x) * ka;

  for (const L of LETTERS) {
    L.sprite.position.set(L.p[0], L.p[1] + Math.sin(visT * 2 + L.p[0]) * 0.15, L.p[2]);
  }
}

function updateCamera(dt) {
  if (!game.started) {           // menu orbit
    const a = visT * 0.08;
    camera.position.set(Math.sin(a) * 55, 22, Math.cos(a) * 55);
    camera.lookAt(0, 0, 0);
    sun.position.set(25, 45, 15); sun.target.position.set(0, 0, 0);
    return;
  }
  let target = camYaw;
  if (P.state === 'ground') target = P.speed < -0.5 ? P.yaw + PI : P.yaw;
  else if (P.state === 'grind') target = P.grind.travelYaw;
  else if (P.state === 'air' && !P.vert && Math.hypot(P.vel.x, P.vel.z) > 2) target = Math.atan2(P.vel.x, P.vel.z);
  camYaw += angDiff(target, camYaw) * (1 - Math.exp(-3 * dt));
  const dist = 6.2;
  camWant.set(P.pos.x - Math.sin(camYaw) * dist, P.pos.y + 2.6, P.pos.z - Math.cos(camYaw) * dist);
  camWant.x = clamp(camWant.x, -62, 62); camWant.z = clamp(camWant.z, -62, 62);
  camWant.y = Math.max(camWant.y, heightAt(camWant.x, camWant.z) + 0.8);
  camPos.lerp(camWant, 1 - Math.exp(-7 * dt));
  camera.position.copy(camPos);
  camera.lookAt(P.pos.x, P.pos.y + 1, P.pos.z);
  sun.position.set(P.pos.x + 25, P.pos.y + 45, P.pos.z + 15);
  sun.target.position.copy(P.pos);
}

/* ---------------- HUD ---------------- */
const hudCache = {};
function setText(id, txt) { if (hudCache[id] !== txt) { hudCache[id] = txt; $(id).textContent = txt; } }
function updateHUD() {
  setText('score', game.score.toLocaleString());
  setText('bestHud', game.best.toLocaleString());
  if (game.mode === 'session') {
    const t = Math.max(0, Math.ceil(game.time));
    setText('timer', game.timeUp ? 'TIME!' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    $('timer').classList.toggle('low', t <= 10);
  }
  const has = combo.list.length > 0;
  $('combo').classList.toggle('hidden', !has);
  if (has) {
    const shown = combo.list.slice(-6).join(' + ');
    setText('comboTricks', (combo.list.length > 6 ? '… + ' : '') + shown);
    setText('comboPts', `${Math.round(combo.base).toLocaleString()} × ${combo.list.length}`);
  }
  const grinding = P.state === 'grind';
  $('balance').classList.toggle('hidden', !grinding);
  if (grinding) $('balNeedle').style.left = 50 + clamp(P.bal, -1, 1) * 48 + '%';
  setText('speed', `${Math.round(Math.abs(P.state === 'air' ? Math.hypot(P.vel.x, P.vel.z) : P.speed) * 3.6)} km/h`);
  const spans = $('letters').children;
  LETTERS.forEach((L, i) => spans[i].classList.toggle('got', L.got));
}

/* ---------------- game flow ---------------- */
function show(id, on) { $(id).classList.toggle('hidden', !on); }
function startGame(mode) {
  initAudio();
  Object.assign(game, { mode, time: SESSION, timeUp: false, score: 0, started: true, running: true, paused: false });
  combo.list = []; combo.base = 0; trickQueue.length = 0; keys.clear(); prevOllie = false;
  for (const L of LETTERS) { L.got = false; L.sprite.visible = true; }
  resetPlayer();
  show('menu', false); show('results', false); show('pause', false); show('hud', true); show('touch', isTouch);
  show('timer', mode === 'session');
  popup(mode === 'session' ? 'GO!' : 'FREE SKATE', 'info');
  last = performance.now(); acc = 0;
}
function endSession() {
  game.running = false;
  const isBest = game.score > game.best;
  if (isBest) { game.best = game.score; saveBest(game.best); }
  $('finalScore').textContent = game.score.toLocaleString();
  $('newBest').textContent = isBest && game.score > 0 ? 'NEW PERSONAL BEST!' : `Best: ${game.best.toLocaleString()}`;
  show('touch', false); show('results', true);
}
function togglePause() {
  if (!game.started || !game.running) return;
  game.paused = !game.paused;
  show('pause', game.paused);
  if (!game.paused) { last = performance.now(); keys.clear(); }
}
function quitToMenu() {
  if (game.mode === 'free' && game.score > game.best) { game.best = game.score; saveBest(game.best); }
  Object.assign(game, { running: false, paused: false, started: false });
  show('pause', false); show('hud', false); show('touch', false); show('menu', true);
  resetPlayer();
}
document.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.start)));
$('resumeBtn').addEventListener('click', togglePause);
$('quitBtn').addEventListener('click', quitToMenu);

/* ---------------- main loop ---------------- */
const STEP = 1 / 120;
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game.running && !game.paused) {
    readInput();
    acc += dt;
    while (acc >= STEP) { step(STEP); acc -= STEP; }
    if (game.mode === 'session') {
      if (!game.timeUp) { game.time -= dt; if (game.time <= 0) { game.timeUp = true; popup('TIME!', 'bad'); } }
      else if (P.state === 'ground') endSession();   // let the last combo finish first
    }
  }
  updateVisuals(game.paused ? 0 : dt);
  updateCamera(dt);
  if (game.started) updateHUD();
  updateAudio();
  renderer.render(scene, camera);
}

resetPlayer();
show('loading', false);
show('menu', true);
requestAnimationFrame(frame);
