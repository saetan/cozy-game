// Pastel House Kit — core: grid constants, shared materials, mesh helpers, RNG and the shared piece registry P.
// Conventions (see README): 1 unit = 1 m, +Y up, +Z = front/outside, pieces pivot at their ground/edge anchor.
import * as THREE from 'three';

// ---- grid conventions ----
const CELL = 2.0, WALL_H = 2.5, T = 0.2, FOUND_H = 0.3, RISE = 1.2;

// ---- materials ----
const M = (name, color, rough = 0.85, metal = 0) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true });
  m.name = name; return m;
};
const PLASTER = {
  pink: M('plaster_pink', '#f2c4bd'), mint: M('plaster_mint', '#c4e3cf'), sky: M('plaster_sky', '#c5d8ee'),
  butter: M('plaster_butter', '#f4e2b0'), lilac: M('plaster_lilac', '#d9cbe8'),
};
const ROOF = { coral: M('roof_coral', '#e39a8c', 0.8), slate: M('roof_slate', '#93a8c9', 0.8), sage: M('roof_sage', '#9fbf98', 0.8), plum: M('roof_plum', '#b79ac2', 0.8) };
const trim = M('trim_white', '#fbf7f0', 0.7), wood = M('wood', '#c79d78', 0.9), glass = M('glass', '#bfe3ec', 0.15),
      stone = M('stone', '#d6cfc4', 0.95), leaf = M('foliage', '#b1d3a2', 0.9), dark = M('soot', '#8d8580', 0.9);

function box(name, w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.name = name; m.position.set(x, y, z); return m;
}
const grp = (name, ...kids) => { const g = new THREE.Group(); g.name = name; kids.forEach(k => g.add(k)); return g; };
// wraps a centred wall body so its outer face sits on z=0
const onEdge = (name, body) => { body.position.z = -T / 2; return grp(name, body); };

function ico(name, r, mat, x = 0, y = 0, z = 0, detail = 0) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat);
  m.name = name; m.position.set(x, y, z); return m;
}
function cone(name, r, h, seg, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
  m.name = name; m.position.set(x, y, z); return m;
}
function bar(name, a, b, t, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, A.distanceTo(B)), mat);
  m.name = name; m.position.copy(A).lerp(B, 0.5); m.lookAt(B); return m;
}
const PAINT = { peach: M('paint_peach', '#f6b89a', 0.5), sky: M('paint_sky', '#9fc3ea', 0.5), mint: M('paint_mint', '#a6dcc4', 0.5), butter: M('paint_butter', '#f3d98a', 0.5) };
const rect = (x0, x1, z0, z1, f) => { const a = []; for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) a.push([x, z, f]); return a; };
function hash(...n) { let h = 2166136261; for (const ch of n.join(',')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (r, o) => { const v = Object.values(o); return v[Math.floor(r() * v.length)]; };
const ease = x => x * x * (3 - 2 * x), lerp = (a, b, k) => a + (b - a) * k, frac = x => x - Math.floor(x);
const rnd = n => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);

// every module registers its pieces here: P.wall(), P.car(), P.farmPlot()…
const P = {};

export {
  THREE, CELL, WALL_H, T, FOUND_H, RISE, M, PLASTER, ROOF, PAINT, trim, wood, glass, stone, leaf, dark,
  box, grp, onEdge, ico, cone, bar, rect, hash, rng, pick, ease, lerp, frac, rnd, P,
};
