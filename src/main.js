// Game entry: owns the renderer, camera and loop. Starter scene = the level path on one lot
// (Lv1→7 via the HUD or ←/→ keys) with a walking resident, using the reference level-up animation.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as Kit from './kit/index.js';

const { CELL, LEVELS, M, box, grp } = Kit;
const LOT = { x0: -1, x1: 4, z0: -2, z1: 5 }, OX = -3, OZ = -3;
const lwx = x => x * CELL + OX, lwz = z => z * CELL + OZ;

// ---- renderer, camera, lights ----
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4f0ea');
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
camera.position.set(14, 13, 18);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.45;

scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.0));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(8, 14, 10);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0002;
Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
scene.add(key);
const fill = new THREE.DirectionalLight(0xfff4e6, 0.5);
fill.position.set(-5, 3, -4);
scene.add(fill);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- lot ----
const grassM = M('grass', '#d3e8c2', 0.95), gridM = M('grid_line', '#eaf4e0', 0.9);
function buildLot() {
  const { x0, x1, z0, z1 } = LOT, g = grp('building_lot'), cxm = lwx((x0 + x1) / 2), czm = lwz((z0 + z1) / 2);
  const grass = box('lot_grass', (x1 - x0) * CELL, 0.06, (z1 - z0) * CELL, grassM, cxm, -0.03, czm);
  grass.receiveShadow = true;
  g.add(grass);
  for (let x = x0; x <= x1; x++) g.add(box('grid_line', 0.04, 0.006, (z1 - z0) * CELL, gridM, lwx(x), 0.003, czm));
  for (let z = z0; z <= z1; z++) g.add(box('grid_line', (x1 - x0) * CELL, 0.006, 0.04, gridM, cxm, 0.003, lwz(z)));
  return g;
}
scene.add(buildLot());

// ---- level-up: diff plans by key, pop new pieces in, shrink removed ones out ----
const tweens = [];
const backOut = x => { const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const smooth = x => x * x * (3 - 2 * x);
function tween(obj, from, to, dur, delay, done) {
  tweens.push({ obj, from, to, dur, t0: performance.now() / 1000 + delay, done });
  obj.scale.setScalar(Math.max(from, 0.001));
}
function stepTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i], k = Math.min(1, Math.max(0, (now - w.t0) / w.dur));
    w.obj.scale.setScalar(Math.max(0.001, w.from + (w.to - w.from) * (w.to > w.from ? backOut(k) : smooth(k))));
    if (k >= 1) { tweens.splice(i, 1); w.done?.(); }
  }
}

const house = grp('house'), pieces = new Map();
scene.add(house);
let level = 0;
function applyLevel(lv, animateIt) {
  level = lv;
  const plan = Kit.buildPlan(LEVELS[lv], OX, OZ), next = new Set(plan.map(p => p.key));
  for (const [k, o] of pieces) if (!next.has(k)) {
    pieces.delete(k);
    animateIt ? tween(o, 1, 0, 0.3, 0, () => o.removeFromParent()) : o.removeFromParent();
  }
  const fresh = plan.filter(p => !pieces.has(p.key)).sort((a, b) => a.y - b.y || a.z - b.z);
  const step = Math.min(0.04, 1.6 / Math.max(1, fresh.length));
  fresh.forEach((p, i) => {
    const o = p.make();
    o.position.set(p.x, p.y, p.z); o.rotation.y = p.ry;
    o.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    house.add(o); pieces.set(p.key, o);
    if (animateIt) tween(o, 0, 1, 0.45, 0.25 + i * step);
  });
  document.getElementById('level').textContent = `Lv ${lv + 1} · ${LEVELS[lv].name}`;
}
applyLevel(0, false);

const setLevel = lv => { if (lv >= 0 && lv < LEVELS.length && lv !== level) applyLevel(lv, true); };
document.getElementById('up').onclick = () => setLevel(level + 1);
document.getElementById('down').onclick = () => setLevel(level - 1);
addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') setLevel(level + 1);
  if (e.key === 'ArrowLeft') setLevel(level - 1);
});

// ---- a resident strolling across the front of the lot ----
const fox = Kit.setAction(Kit.resident('fox'), 'walk');
fox.traverse(m => { if (m.isMesh) m.castShadow = true; });
scene.add(fox);

// ---- loop ----
renderer.setAnimationLoop(() => {
  const t = performance.now() / 1000;
  const s = Math.sin(t * 0.35);
  fox.position.set(lwx(1.5) + s * 4, 0, lwz(4.5));
  fox.rotation.y = Math.cos(t * 0.35) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  for (const a of Kit.getActors()) Kit.animate(a, t + a.userData.phase);
  stepTweens(t);
  controls.update();
  renderer.render(scene, camera);
});
