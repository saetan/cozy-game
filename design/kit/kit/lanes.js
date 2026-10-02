// Pastel House Kit — 2 m lanes add-on (additions only; roads.js 6 m pieces are unchanged).
// One-cell lanes the player paints cell by cell: asphalt lane + dirt lane, auto-tiled from the 4 neighbouring cells:
// dead end · straight · corner (curved) · T · cross, plus the asphalt ↔ dirt join and the lane mouth where a lane meets a 6 m street.
// Conventions as kit.js: 1 = 1 m, +Y up, +Z = front/south, pivot at cell ground centre, named meshes + materials, road colour tokens.
import * as THREE from 'three';
import { CELL, box, grp, hash } from './core.js';
import { ROAD_MAT as RM, ORDER, SIDE, OPP, ROAD_CELLS, ASPH_H, DIRT_H } from './roads.js';

const C2 = CELL / 2;                                   // 1.0 — half cell
const LANE_HW = 0.85, KERB_W = C2 - LANE_HW, KERB_H = 0.1;  // asphalt 1.7 m + 0.15 m low kerb each side = 2.0 m
const DLANE_HW = 0.75, RUT = 0.38;                     // dirt lane 1.5 m (+ ragged edge chunks to ~1.8 m)
const ADJ = { S: ['W', 'E'], E: ['S', 'N'], N: ['E', 'W'], W: ['N', 'S'] };

const rand = seed => { let s = (Math.floor(hash('lane', seed) * 4294967296) >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const turn = (o, s) => { o.rotation.y = SIDE[s][2]; return o; };
const side = (name, s, ...kids) => turn(grp(name, ...kids), s);
function mesh(name, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(x, y, z); return m; }
// quarter annulus centred on cell corner (cx, cz), radii r0..r1, opening into the cell
function arc(name, r0, r1, h, mat, cx, cz, y = 0, segs = 6) {
  const a = Math.atan2(cz, -cx), a0 = a - Math.PI / 4, a1 = a + Math.PI / 4, s = new THREE.Shape(), sx = cx, sy = -cz;
  if (r0 <= 0) { s.moveTo(sx, sy); s.absarc(sx, sy, r1, a0, a1, false); s.lineTo(sx, sy); }
  else { s.absarc(sx, sy, r1, a0, a1, false); s.absarc(sx, sy, r0, a1, a0, true); }
  const m = mesh(name, new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: segs }), mat, 0, y, 0);
  m.rotation.x = -Math.PI / 2; return m;
}
const bendCorner = sides => [sides.includes('E') ? C2 : -C2, sides.includes('S') ? C2 : -C2];
function kindOf(sides) {
  const n = sides.length, bend = n === 2 && OPP[sides[0]] !== sides[1];
  return { n, bend, kind: n === 0 ? 'patch' : n === 1 ? 'end' : n === 2 ? (bend ? 'corner' : 'straight') : n === 3 ? 'tee' : 'cross' };
}
const tuft = (x, z, r) => { const g = grp('grass_tuft'); for (let k = 0; k < 3; k++) { const a = r() * 6.28, d = 0.03 + r() * 0.03, h = 0.1 + r() * 0.08; g.add(mesh('tuft_blade', new THREE.ConeGeometry(0.04, h, 4), RM.tuft, Math.cos(a) * d, h / 2, Math.sin(a) * d)); } g.position.set(x, 0, z); return g; };
const pebble = (x, z, r) => { const s = 0.03 + r() * 0.04, m = mesh('pebble', new THREE.DodecahedronGeometry(s, 0), RM.pebble, x, s * 0.4, z); m.scale.y = 0.55; return m; };
function spill(s, r, y, n = 3) { // loose dirt carried onto the asphalt at a join (authored for S edge)
  const g = grp('dirt_spill_' + s);
  for (let k = 0; k < n; k++) { const b = box('dirt_spill', 0.3 + r() * 0.4, 0.008, 0.15 + r() * 0.25, RM.dirt, (r() - 0.5) * 1.2, y, C2 - 0.12 - r() * 0.35); b.rotation.y = (r() - 0.5) * 0.6; g.add(b); }
  return turn(g, s);
}

// ---------- asphalt lane (2 m) ----------
// conn: { N|E|S|W: 'road' | 'dirt' | 'street' } — 'dirt' = join to a dirt lane, 'street' = lane mouth onto a 6 m street tile
function laneTile({ conn = {}, seed = 1 } = {}) {
  const sides = ORDER.filter(s => conn[s]), { n, bend, kind } = kindOf(sides), r = rand(seed);
  const join = sides.some(s => conn[s] === 'dirt'), g = grp('lane_' + (join ? 'join' : kind)); g.userData = { kind: join ? 'join' : kind, sides };
  if (bend) {
    const [cx, cz] = bendCorner(sides);
    g.add(arc('lane_asphalt', KERB_W, CELL - KERB_W, ASPH_H, RM.asphalt, cx, cz, 0, 8));
    g.add(arc('lane_kerb', 0, KERB_W, KERB_H, RM.curb, cx, cz, 0, 2));
    g.add(arc('lane_kerb', CELL - KERB_W, CELL, KERB_H, RM.curb, cx, cz, 0, 10));
  } else {
    g.add(box('lane_asphalt', LANE_HW * 2, ASPH_H, LANE_HW * 2, RM.asphalt, 0, ASPH_H / 2, 0));
    for (const s of ORDER) {
      if (conn[s]) {
        const w = conn[s] === 'street' ? CELL : LANE_HW * 2;
        g.add(side('lane_arm_' + s, s, box('lane_asphalt', w, ASPH_H, KERB_W, RM.asphalt, 0, ASPH_H / 2, C2 - KERB_W / 2)));
      } else {
        const [lm, lp] = ADJ[s], x0 = conn[lm] === 'street' ? -LANE_HW : -C2, x1 = conn[lp] === 'street' ? LANE_HW : C2;
        g.add(side('lane_kerb_' + s, s, box('lane_kerb', x1 - x0, KERB_H, KERB_W, RM.curb, (x0 + x1) / 2, KERB_H / 2, C2 - KERB_W / 2)));
      }
    }
    // corner nubs where two connected arms meet (keeps the 2 m edge continuous)
    for (const [a, b] of [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']]) if (conn[a] && conn[b] && conn[a] !== 'street' && conn[b] !== 'street') {
      const sx = a === 'E' || b === 'E' ? 1 : -1, sz = a === 'S' || b === 'S' ? 1 : -1;
      g.add(box('lane_kerb_nub', KERB_W, KERB_H, KERB_W, RM.curb, sx * (C2 - KERB_W / 2), KERB_H / 2, sz * (C2 - KERB_W / 2)));
    }
    if (n === 1) g.add(side('lane_end_' + sides[0], sides[0], box('lane_stop_line', LANE_HW * 1.6, 0.006, 0.1, RM.lineW, 0, ASPH_H + 0.003, -LANE_HW + 0.25)));
  }
  for (const s of sides) if (conn[s] === 'dirt') g.add(spill(s, r, ASPH_H + 0.004));
  return g;
}

// ---------- dirt lane (2 m) ----------
function dirtLaneTile({ conn = {}, seed = 1 } = {}) {
  const sides = ORDER.filter(s => conn[s]), { bend, kind } = kindOf(sides), r = rand(seed);
  const g = grp('dirt_lane_' + kind); g.userData = { kind, sides };
  if (bend) {
    const [cx, cz] = bendCorner(sides);
    g.add(arc('dirt', C2 - DLANE_HW, C2 + DLANE_HW, DIRT_H, RM.dirt, cx, cz, 0, 7));
    for (const o of [-RUT, RUT]) g.add(arc('dirt_rut', C2 + o - 0.08, C2 + o + 0.08, DIRT_H + 0.004, RM.rut, cx, cz, 0, 7));
    for (let k = 0; k < 4; k++) { const a = Math.atan2(cz, -cx) - Math.PI / 4 + (k + 0.5) / 4 * Math.PI / 2, rr = k % 2 ? C2 + DLANE_HW + 0.1 : C2 - DLANE_HW - 0.1; g.add(tuft(cx + Math.cos(a) * rr, cz - Math.sin(a) * rr, r)); }
    return g;
  }
  g.add(box('dirt', DLANE_HW * 2, DIRT_H, DLANE_HW * 2, RM.dirt, 0, DIRT_H / 2, 0));
  for (const s of ORDER) {
    const a = grp('dirt_lane_side_' + s);
    if (conn[s]) {
      const w = conn[s] === 'road' ? LANE_HW * 2 : DLANE_HW * 2, len = C2 - DLANE_HW;
      a.add(box('dirt', w, DIRT_H, len, RM.dirt, 0, DIRT_H / 2, C2 - len / 2));
      if (conn[s] === 'dirt') for (const o of [-RUT, RUT]) a.add(box('dirt_rut', 0.16, 0.006, len + 0.1, RM.rut, o, DIRT_H + 0.003, C2 - len / 2));
      if (conn[s] === 'street') { a.add(box('lane_mouth_flare', CELL, DIRT_H, 0.35, RM.dirt, 0, DIRT_H / 2, C2 - 0.175)); a.add(pebble(0.5, 0.75, r)); }
      for (const sx of [-1, 1]) { const b = box('dirt_chunk', 0.14, DIRT_H, 0.22 + r() * 0.2, RM.dirt, sx * (DLANE_HW + 0.04), DIRT_H / 2, DLANE_HW + 0.12); b.rotation.y = (r() - 0.5) * 0.6; a.add(b); }
    } else {
      for (let k = 0; k < 2; k++) a.add(tuft((r() - 0.5) * 1.4, DLANE_HW + 0.1 + r() * 0.1, r));
    }
    g.add(turn(a, s));
  }
  if (sides.length >= 2 && !bend) for (const o of [-RUT, RUT]) {   // ruts run through straights and junction centres
    const ax = sides.includes('E') || sides.includes('W'), along = sides.includes('N') || sides.includes('S');
    if (along) g.add(box('dirt_rut', 0.16, 0.006, DLANE_HW * 2, RM.rut, o, DIRT_H + 0.003, 0));
    if (ax) g.add(box('dirt_rut', DLANE_HW * 2, 0.006, 0.16, RM.rut, 0, DIRT_H + 0.003, o));
  }
  g.add(pebble((r() - 0.5) * 1.0, (r() - 0.5) * 1.0, r));
  return g;
}

// Lane mouth spill — lies on the street tile's dropped sidewalk in front of a dirt lane (pivot = the lane cell's street edge, authored for S).
function laneMouthSpill({ seed = 1 } = {}) {
  const r = rand(seed), g = grp('lane_mouth_spill');
  for (let k = 0; k < 4; k++) { const b = box('dirt_spill', 0.35 + r() * 0.5, 0.006, 0.2 + r() * 0.3, RM.dirt, (r() - 0.5) * 1.4, 0.054, 0.15 + r() * 0.75); b.rotation.y = (r() - 0.5) * 0.7; g.add(b); }
  return g;
}

// ---------- builder ----------
// cells: [{ x, z, type: 'road'|'dirt' }] on the 2 m grid. streets: optional 6 m road tiles [{ i, j }] (roads.js) a lane may run into.
// Returns { items, cuts } — items like buildRoads ({ key, make, x, y, z, ry, cell, conn }); pass `cuts` to roads.buildRoads()
// so the street drops its kerb where a lane meets it.
function buildLanes(cells, { streets = [], ox = 0, oz = 0, seed = 1 } = {}) {
  const K = (x, z) => x + ',' + z, map = new Map(cells.map(c => [K(c.x, c.z), c]));
  const st = new Set(streets.map(t => t.i + ',' + t.j)), inStreet = (x, z) => st.has(Math.floor(x / ROAD_CELLS) + ',' + Math.floor(z / ROAD_CELLS));
  const items = [], cuts = [];
  for (const c of cells) {
    const conn = {};
    for (const s of ORDER) {
      const nx = c.x + SIDE[s][0], nz = c.z + SIDE[s][1], nb = map.get(K(nx, nz));
      if (nb) conn[s] = nb.type;
      else if (inStreet(nx, nz)) { conn[s] = 'street'; cuts.push([c.x, c.z]); }
    }
    const sd = hash(seed, c.x, c.z), sig = ORDER.map(s => (conn[s] || '-')[0]).join('');
    const make = () => (c.type === 'dirt' ? dirtLaneTile({ conn, seed: sd }) : laneTile({ conn, seed: sd }));
    items.push({ key: `lane:${c.x},${c.z}:${c.type}:${sig}`, make, x: (c.x + 0.5) * CELL + ox, y: 0, z: (c.z + 0.5) * CELL + oz, ry: 0, cell: c, conn });
    for (const s of ORDER) if (conn[s] === 'street' && c.type === 'dirt')
      items.push({ key: `laneMouth:${c.x},${c.z}:${s}`, make: () => laneMouthSpill({ seed: sd }), x: (c.x + 0.5 + SIDE[s][0] * 0.5) * CELL + ox, y: 0, z: (c.z + 0.5 + SIDE[s][1] * 0.5) * CELL + oz, ry: SIDE[s][2] });
  }
  return { items, cuts };
}

export { LANE_HW, KERB_W, KERB_H, DLANE_HW, laneTile, dirtLaneTile, laneMouthSpill, buildLanes };
