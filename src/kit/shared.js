// Shared materials, helpers and grid constants for the kit modules.
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
const P = {};

function ico(name, r, mat, x = 0, y = 0, z = 0, detail = 0) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat);
  m.name = name; m.position.set(x, y, z); return m;
}
function cone(name, r, h, seg, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
  m.name = name; m.position.set(x, y, z); return m;
}
const PAINT = { peach: M('paint_peach', '#f6b89a', 0.5), sky: M('paint_sky', '#9fc3ea', 0.5), mint: M('paint_mint', '#a6dcc4', 0.5), butter: M('paint_butter', '#f3d98a', 0.5) };
const tire = M('tire', '#5f5956', 0.95), lamp = M('lamp', '#fff4c9', 0.3);
const FUR = { bunny: M('fur_bunny', '#f8f3ec'), bear: M('fur_bear', '#d9b28e'), cat: M('fur_cat', '#bcb3c9'),
              fox: M('fur_fox', '#f2a97c'), frog: M('fur_frog', '#b6dca2') };
const CLOTH = { blue: M('cloth_blue', '#a9c4e8'), pink: M('cloth_pink', '#f3b3c1'), yellow: M('cloth_yellow', '#f2d98c'),
                lilac: M('cloth_lilac', '#c9b3e0'), mint: M('cloth_mint', '#a8d8c0') };
const cream = M('fur_cream', '#fbf3e6'), blush = M('blush_pink', '#f4b3b3'), eyeMat = M('eye_dark', '#3a3230', 0.4);
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export { FUR, CLOTH, cream, blush, eyeMat, rng, THREE, CELL, WALL_H, T, FOUND_H, RISE, M, PLASTER, ROOF, trim, wood, glass, stone, leaf, dark, box, grp, onEdge, P, ico, cone, PAINT, tire, lamp };
