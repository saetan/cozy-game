// Pastel House Kit — roads & paths add-on.
// Road network (asphalt + dirt) on a coarse 6 m tile grid (= 3×3 house cells), auto-tiled from a list of occupied tiles:
// dead end, straight, bend (curved), T, cross, mini-roundabout. Garden footpaths on the 2 m cell grid, auto-routed door → sidewalk.
// Same conventions as kit.js: 1 = 1 m, +Y up, +Z = front/south. Tile pieces pivot at ground centre. Side pieces authored for S, rotated.
import * as THREE from 'three';
import { CELL, M, box, grp, hash, P } from './core.js';
import './house.js'; // registers P.driveway

const RC = 3, TILE = RC * CELL, H = TILE / 2;                   // road tile = 3 cells = 6 m
const LANE_HW = 2.0, CURB_W = 0.15, WALK_H = 0.15, CURB_H = 0.16, ASPH_H = 0.04, MARK_Y = ASPH_H + 0.003;
const DIRT_HW = 1.6, DIRT_H = 0.03, PATH_HW = 0.5, PATH_H = 0.03;
const ORDER = ['N', 'E', 'S', 'W'];
const SIDE = { N: [0, -1, Math.PI], E: [1, 0, Math.PI / 2], S: [0, 1, 0], W: [-1, 0, -Math.PI / 2] };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
const ADJ = { S: ['W', 'E'], E: ['S', 'N'], N: ['E', 'W'], W: ['N', 'S'] };   // [neighbour at local −x, at local +x] for a side piece

const RM = {
  asphalt: M('asphalt', '#bcb5bb', 0.95), lineC: M('road_line_butter', '#f3d98a', 0.7), lineW: M('road_line_white', '#fbf7f0', 0.7),
  curb: M('curb', '#d6cfc4', 0.95), walk: M('sidewalk', '#ebe4d8', 0.95), joint: M('sidewalk_joint', '#d9d1c4', 0.95),
  dirt: M('dirt', '#dfc7a3', 1), rut: M('dirt_rut', '#cfb38d', 1), pebble: M('pebble', '#cfc6ba', 0.95), tuft: M('grass_tuft', '#b5d6a0', 0.9),
  gravel: M('path_gravel', '#efe5d4', 1), edge: M('path_edge', '#d6cfc4', 0.95), step: M('stepping_stone', '#ddd5c9', 0.95),
  grass: M('grass', '#d3e8c2', 0.95), island: M('island_grass', '#c3e0b0', 0.95), bush: M('bush', '#b1d3a2', 0.9),
  picket: M('picket_white', '#fbf7f0', 0.7), post: M('post_wood', '#c79d78', 0.9), mail: M('mailbox_sky', '#9fc3ea', 0.5), flag: M('mailbox_flag', '#e39a8c', 0.6),
  flowers: [M('flower_pink', '#f3b3c1', 0.8), M('flower_butter', '#f2d98c', 0.8), M('flower_lilac', '#c9b3e0', 0.8)],
};

const rand = seed => { let s = (Math.floor(hash('r', seed) * 4294967296) >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const turn = (o, s) => { o.rotation.y = SIDE[s][2]; return o; };
const sideGrp = (name, s, ...kids) => turn(grp(name, ...kids), s);
function mesh(name, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(x, y, z); return m; }

// flat annular sector (or quarter disc when r0 = 0) centred at world (cx, cz), angle range in the shape plane
function slab(name, r0, r1, h, a0, a1, mat, cx, cz, y = 0, segs = 5) {
  const s = new THREE.Shape(), sx = cx, sy = -cz;
  if (r0 <= 0) { s.moveTo(sx, sy); s.absarc(sx, sy, r1, a0, a1, false); s.lineTo(sx, sy); }
  else { s.absarc(sx, sy, r1, a0, a1, false); s.absarc(sx, sy, r0, a1, a0, true); }
  const m = mesh(name, new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: segs }), mat, 0, y, 0);
  m.rotation.x = -Math.PI / 2; return m;
}
// quarter-arc angles for a tile corner (sx, sz ∈ ±1), opening toward the tile interior
const cornerArc = (sx, sz) => { const a = Math.atan2(sz, -sx); return [a - Math.PI / 4, a + Math.PI / 4]; };
const bendCorner = sides => [sides.includes('E') ? 1 : -1, sides.includes('S') ? 1 : -1];

function tuft(x, z, r) {
  const g = grp('grass_tuft');
  for (let k = 0; k < 3; k++) { const a = r() * 6.28, d = 0.04 + r() * 0.04, h = 0.12 + r() * 0.1; g.add(mesh('tuft_blade', new THREE.ConeGeometry(0.05, h, 4), RM.tuft, Math.cos(a) * d, h / 2, Math.sin(a) * d)); }
  g.position.set(x, 0, z); return g;
}
const pebble = (x, z, r) => { const s = 0.04 + r() * 0.05, m = mesh('pebble', new THREE.DodecahedronGeometry(s, 0), RM.pebble, x, s * 0.4, z); m.scale.y = 0.55; m.rotation.y = r() * 3; return m; };
function flower(x, z, r) {
  const g = grp('flower'), h = 0.12 + r() * 0.08;
  g.add(box('flower_stem', 0.02, h, 0.02, RM.tuft, 0, h / 2, 0));
  g.add(mesh('flower_head', new THREE.IcosahedronGeometry(0.05, 0), RM.flowers[Math.floor(r() * 3)], 0, h, 0));
  g.position.set(x, 0, z); return g;
}

// ---------- asphalt road tile ----------
// conn: { N|E|S|W: 'road'|'dirt' } neighbours; cuts: { side: [k…] } dropped-kerb segments (k = 0..2 along the side's local x)
function sideStrip(s, conn, cuts) {
  const g = grp('sidewalk_' + s), [lm, lp] = ADJ[s];
  const xa = conn[lm] ? -H : -LANE_HW, xb = conn[lp] ? H : LANE_HW, zc = LANE_HW + CURB_W / 2, zw = LANE_HW + CURB_W + (H - LANE_HW - CURB_W) / 2, wd = H - LANE_HW - CURB_W;
  for (let k = 0; k < 3; k++) {
    const x0 = -H + k * CELL, x1 = x0 + CELL, cut = cuts.includes(k), wh = cut ? 0.05 : WALK_H, ch = cut ? 0.06 : CURB_H;
    g.add(box(cut ? 'sidewalk_dropped' : 'sidewalk', CELL, wh, wd, RM.walk, (x0 + x1) / 2, wh / 2, zw));
    const c0 = Math.max(x0, xa), c1 = Math.min(x1, xb);
    if (c1 > c0) g.add(box(cut ? 'curb_dropped' : 'curb', c1 - c0, ch, CURB_W, RM.curb, (c0 + c1) / 2, ch / 2, zc));
    for (const jx of [x0 + 1, x1]) if (jx < H) g.add(box('sidewalk_joint', 0.03, 0.004, wd, RM.joint, jx, wh + 0.002, zw));
  }
  return turn(g, s);
}
function cornerKerb(sx, sz) {
  const [a0, a1] = cornerArc(sx, sz), cx = sx * H, cz = sz * H;
  return grp('kerb_corner', slab('curb_round', 1 - CURB_W, 1, CURB_H, a0, a1, RM.curb, cx, cz), slab('sidewalk_round', 0, 1 - CURB_W, WALK_H, a0, a1, RM.walk, cx, cz));
}
const dash = (along, d, w = 0.12, len = 1.0) => along === 'z' ? box('lane_dash', w, 0.006, len, RM.lineC, 0, MARK_Y, d) : box('lane_dash', len, 0.006, w, RM.lineC, d, MARK_Y, 0);
function crosswalk(s) {
  const g = grp('crosswalk_' + s);
  for (let k = -2; k <= 2; k++) g.add(box('zebra', 0.42, 0.006, 0.7, RM.lineW, k * 0.8, MARK_Y, H - 0.45));
  return turn(g, s);
}
function dirtSpill(s, r) {
  const g = grp('dirt_spill_' + s);
  for (let k = 0; k < 4; k++) { const b = box('dirt_spill', 0.6 + r() * 0.8, 0.008, 0.3 + r() * 0.4, RM.dirt, (r() - 0.5) * 3, ASPH_H + 0.004, H - 0.2 - r() * 0.5); b.rotation.y = (r() - 0.5) * 0.6; g.add(b); }
  return turn(g, s);
}

function roadTile({ conn = {}, round = false, cuts = {}, seed = 1 } = {}) {
  const sides = ORDER.filter(s => conn[s]), n = sides.length, r = rand(seed);
  const bend = n === 2 && OPP[sides[0]] !== sides[1];
  const kind = n === 0 ? 'plaza' : n === 1 ? 'end' : n === 2 ? (bend ? 'bend' : 'straight') : (round ? 'roundabout' : n === 3 ? 'tee' : 'cross');
  const g = grp('road_' + kind); g.userData = { kind, sides };
  if (bend) {
    const [sx, sz] = bendCorner(sides), [a0, a1] = cornerArc(sx, sz), cx = sx * H, cz = sz * H, rc = H, ro = rc + LANE_HW;
    g.add(slab('asphalt', rc - LANE_HW, ro, ASPH_H, a0, a1, RM.asphalt, cx, cz, 0, 8));
    g.add(slab('curb', rc - LANE_HW - CURB_W, rc - LANE_HW, CURB_H, a0, a1, RM.curb, cx, cz, 0, 3));
    g.add(slab('sidewalk', 0, rc - LANE_HW - CURB_W, WALK_H, a0, a1, RM.walk, cx, cz, 0, 3));
    g.add(slab('curb', ro, ro + CURB_W, CURB_H, a0, a1, RM.curb, cx, cz, 0, 10));
    g.add(slab('sidewalk', ro + CURB_W, TILE, WALK_H, a0, a1, RM.walk, cx, cz, 0, 10));
    for (const f of [1 / 6, 1 / 2, 5 / 6]) { const a = a0 + f * Math.PI / 2, da = 0.5 / rc; g.add(slab('lane_dash', rc - 0.06, rc + 0.06, 0.006, a - da, a + da, RM.lineC, cx, cz, ASPH_H + 0.001, 2)); }
    for (const s of sides) if (conn[s] === 'dirt') g.add(dirtSpill(s, r));
    return g;
  }
  g.add(box('asphalt', TILE, ASPH_H, TILE, RM.asphalt, 0, ASPH_H / 2, 0));
  for (const s of ORDER) if (!conn[s]) g.add(sideStrip(s, conn, cuts[s] || []));
  for (const [a, b] of [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']]) if (conn[a] && conn[b]) g.add(cornerKerb(a === 'E' || b === 'E' ? 1 : -1, a === 'S' || b === 'S' ? 1 : -1));
  if (n === 2) { const ax = sides[0] === 'N' || sides[0] === 'S' ? 'z' : 'x'; for (const d of [-2, 0, 2]) g.add(dash(ax, d)); }
  if (n === 1) { const [dx, dz] = SIDE[sides[0]]; g.add(dash(dz ? 'z' : 'x', 2 * (dx + dz))); }
  if (n >= 3) for (const s of sides) if (conn[s] === 'road') g.add(crosswalk(s));
  for (const s of sides) if (conn[s] === 'dirt') g.add(dirtSpill(s, r));
  if (kind === 'roundabout') {
    g.add(mesh('island_curb', new THREE.CylinderGeometry(1.1, 1.1, CURB_H, 10), RM.curb, 0, CURB_H / 2, 0));
    g.add(mesh('island_grass', new THREE.CylinderGeometry(0.96, 0.96, 0.2, 10), RM.island, 0, 0.1, 0));
    const b = mesh('island_bush', new THREE.IcosahedronGeometry(0.42, 0), RM.bush, 0, 0.5, 0); b.scale.y = 0.85; g.add(b);
    for (let k = 0; k < 5; k++) { const a = k * 1.256 + 0.3; g.add(flower(Math.cos(a) * 0.72, Math.sin(a) * 0.72, r)).children.at(-1).position.y = 0.2; }
    for (let k = 0; k < 16; k += 2) { const a = k * Math.PI / 8; g.add(slab('ring_dash', 1.32, 1.42, 0.006, a, a + Math.PI / 12, RM.lineW, 0, 0, ASPH_H + 0.001, 1)); }
  }
  return g;
}

// ---------- dirt road tile ----------
function dirtArmDecor(g, s, r) {
  const a = grp('dirt_edges_' + s);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) { const b = box('dirt_chunk', 0.25, DIRT_H, 0.4 + r() * 0.4, RM.dirt, sx * (DIRT_HW + 0.05), DIRT_H / 2, 0.5 + r() * 2.3); b.rotation.y = (r() - 0.5) * 0.7; a.add(b); }
    for (let k = 0; k < 2; k++) a.add(tuft(sx * (DIRT_HW + 0.25 + r() * 0.25), 0.4 + r() * 2.5, r));
    a.add(pebble(sx * (DIRT_HW - 0.2 - r() * 0.3), 0.4 + r() * 2.4, r));
  }
  g.add(turn(a, s));
}
function dirtTile({ conn = {}, seed = 1 } = {}) {
  const sides = ORDER.filter(s => conn[s]), n = sides.length, r = rand(seed);
  const bend = n === 2 && OPP[sides[0]] !== sides[1];
  const kind = n === 0 ? 'patch' : n === 1 ? 'end' : n === 2 ? (bend ? 'bend' : 'straight') : n === 3 ? 'tee' : 'cross';
  const g = grp('dirt_' + kind); g.userData = { kind, sides };
  if (bend) {
    const [sx, sz] = bendCorner(sides), [a0, a1] = cornerArc(sx, sz), cx = sx * H, cz = sz * H;
    g.add(slab('dirt', H - DIRT_HW, H + DIRT_HW, DIRT_H, a0, a1, RM.dirt, cx, cz, 0, 7));
    for (const o of [-0.8, 0.8]) g.add(slab('dirt_rut', H + o - 0.13, H + o + 0.13, DIRT_H + 0.004, a0, a1, RM.rut, cx, cz, 0, 7));
    for (let k = 0; k < 7; k++) { const a = a0 + (k + 0.5) / 7 * Math.PI / 2, rr = k % 2 ? H + DIRT_HW + 0.3 : H - DIRT_HW - 0.3; g.add(tuft(cx + Math.cos(a) * rr, cz - Math.sin(a) * rr, r)); }
    return g;
  }
  const oct = mesh('dirt', new THREE.CylinderGeometry(DIRT_HW + 0.25, DIRT_HW + 0.25, DIRT_H, 8), RM.dirt, 0, DIRT_H / 2, 0); oct.rotation.y = Math.PI / 8; g.add(oct);
  for (const s of sides) {
    g.add(sideGrp('dirt_arm_' + s, s, box('dirt', DIRT_HW * 2, DIRT_H, H, RM.dirt, 0, DIRT_H / 2, H / 2),
      ...[-0.8, 0.8].map(o => box('dirt_rut', 0.26, 0.006, H, RM.rut, o, DIRT_H + 0.003, H / 2))));
    dirtArmDecor(g, s, r);
  }
  for (const s of ORDER) if (!conn[s]) { const a = grp('dirt_rim_' + s); for (let k = 0; k < 2; k++) a.add(tuft((r() - 0.5) * 2.2, 2.2 + r() * 0.4, r)); g.add(turn(a, s)); }
  return g;
}

// ---------- garden footpath (2 m cell) ----------
// conn: { N|E|S|W: true } — include sides that lead into steps / sidewalk / driveway, not just other path cells
function pathTile({ conn = {}, style = 'gravel', seed = 1, flowers = true } = {}) {
  const r = rand(seed), g = grp('path_' + style), sides = ORDER.filter(s => conn[s]);
  g.userData = { sides };
  if (style === 'stones') {
    const stone = (x, z) => { const s = 0.24 + r() * 0.07, m = mesh('stepping_stone', new THREE.CylinderGeometry(s, s * 1.05, 0.05, 6 + Math.floor(r() * 2)), RM.step, x + (r() - 0.5) * 0.1, 0.025, z + (r() - 0.5) * 0.1); m.rotation.y = r() * 3; m.scale.x = 0.85 + r() * 0.3; return m; };
    g.add(stone(0, 0));
    for (const s of sides) g.add(sideGrp('stones_' + s, s, stone(0, 0.67)));
  } else {
    g.add(box('path_gravel', PATH_HW * 2, PATH_H, PATH_HW * 2, RM.gravel, 0, PATH_H / 2, 0));
    const e = PATH_HW + 0.04;
    for (const s of ORDER) {
      if (conn[s]) g.add(sideGrp('path_arm_' + s, s, box('path_gravel', PATH_HW * 2, PATH_H, CELL / 2 - PATH_HW, RM.gravel, 0, PATH_H / 2, (CELL / 2 + PATH_HW) / 2),
        ...[-e, e].map(x => box('path_edge', 0.08, 0.06, CELL / 2 - PATH_HW, RM.edge, x, 0.03, (CELL / 2 + PATH_HW) / 2))));
      else g.add(sideGrp('path_rim_' + s, s, box('path_edge', 2 * e + 0.08, 0.06, 0.08, RM.edge, 0, 0.03, e)));
    }
    for (let k = 0; k < 5; k++) g.add(pebble((r() - 0.5) * 0.8, (r() - 0.5) * 0.8, r));
  }
  if (flowers) for (const [qx, qz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (r() < 0.55) for (let k = 0; k < 1 + Math.floor(r() * 2); k++) g.add(flower(qx * (0.68 + r() * 0.24), qz * (0.68 + r() * 0.24), r));
  return g;
}

// ---------- lot-front pieces ----------
function picket({ len = CELL, gateL = false, gateR = false } = {}) {
  const g = grp('picket_fence'), n = Math.round(len / 0.25);
  for (const x of [-len / 2, len / 2]) { const big = (x < 0 && gateL) || (x > 0 && gateR); g.add(box(big ? 'gate_post' : 'fence_post', big ? 0.14 : 0.08, big ? 1.0 : 0.85, big ? 0.14 : 0.08, RM.picket, x, big ? 0.5 : 0.425, 0)); if (big) g.add(mesh('gate_cap', new THREE.IcosahedronGeometry(0.09, 0), RM.picket, x, 1.06, 0)); }
  for (let k = 1; k < n; k++) { const x = -len / 2 + k * len / n; g.add(box('picket', 0.07, 0.68, 0.035, RM.picket, x, 0.34, 0)); g.add(mesh('picket_tip', new THREE.ConeGeometry(0.05, 0.08, 4), RM.picket, x, 0.72, 0)).children.at(-1).rotation.y = Math.PI / 4; }
  for (const y of [0.22, 0.52]) g.add(box('fence_rail', len, 0.05, 0.035, RM.picket, 0, y, -0.035));
  return g;
}
function mailbox() {
  const g = grp('mailbox');
  g.add(box('mailbox_post', 0.08, 1.0, 0.08, RM.post, 0, 0.5, 0));
  g.add(box('mailbox_body', 0.26, 0.18, 0.4, RM.mail, 0, 1.06, 0.04));
  const top = mesh('mailbox_top', new THREE.CylinderGeometry(0.13, 0.13, 0.4, 8, 1, false, -Math.PI / 2, Math.PI), RM.mail, 0, 1.15, 0.04); top.rotation.x = -Math.PI / 2; g.add(top);
  g.add(box('mailbox_flag_arm', 0.02, 0.22, 0.03, RM.flag, 0.14, 1.18, -0.06));
  g.add(box('mailbox_flag', 0.02, 0.08, 0.1, RM.flag, 0.14, 1.26, -0.02));
  return g;
}

// ---------- network builder ----------
// tiles: [{ i, j, type: 'road'|'dirt', round? }]. Tile (i, j) covers cells x 3i…3i+2, z 3j…3j+2.
// cuts: lot cells [x, z] directly beside a road tile that should get a dropped kerb (driveways).
// Returns placement items like buildPlan: { key, make(), x, y, z, ry, tile, conn } — key changes only when the tile's shape changes.
const edgeCell = (t, s, k) => s === 'N' ? [RC * t.i + k, RC * t.j - 1] : s === 'S' ? [RC * t.i + k, RC * t.j + RC] : s === 'E' ? [RC * t.i + RC, RC * t.j + k] : [RC * t.i - 1, RC * t.j + k];
const localK = (s, k) => (s === 'N' || s === 'E' ? 2 - k : k);
function buildRoads(tiles, { ox = 0, oz = 0, cuts = [], seed = 1 } = {}) {
  const map = new Map(tiles.map(t => [t.i + ',' + t.j, t])), cutSet = new Set(cuts.map(c => c.join(',')));
  return tiles.map(t => {
    const conn = {}, cs = {};
    for (const s of ORDER) { const nb = map.get((t.i + SIDE[s][0]) + ',' + (t.j + SIDE[s][1])); if (nb) conn[s] = nb.type; }
    for (const s of ORDER) if (!conn[s] && t.type === 'road') for (let k = 0; k < 3; k++) if (cutSet.has(edgeCell(t, s, k).join(','))) (cs[s] ||= []).push(localK(s, k));
    const sd = hash(seed, t.i, t.j), sig = ORDER.map(s => (conn[s] || '-')[0]).join('') + (t.round ? 'o' : '') + Object.entries(cs).map(([s, a]) => s + a.join('')).join('');
    const make = () => (t.type === 'dirt' ? dirtTile({ conn, seed: sd }) : roadTile({ conn, round: t.round, cuts: cs, seed: sd }));
    return { key: `road:${t.i},${t.j}:${t.type}:${sig}`, make, x: (t.i + 0.5) * TILE + ox, y: 0, z: (t.j + 0.5) * TILE + oz, ry: 0, tile: t, conn };
  });
}

// ---------- lot → road connection (lot fronts a road on its S edge; rotate the lot group for other sides) ----------
// lot: { x0, x1, z0, z1 } inclusive cell bounds; the road tile row starts at z1 + 1.
// Extends the driveway to the lot front, routes a footpath door → sidewalk (turn-penalised shortest path around the house,
// porch, garage, driveway and `blocked` cells), ties it to the driveway when adjacent, adds front fence, gate and mailbox.
function connectLot(spec, { lot, ox = 0, oz = 0, style = 'gravel', fence = true, mail = true, blocked = [], seed = 1 } = {}) {
  const K = (x, z) => x + ',' + z, wx = x => x * CELL + ox, wz = z => z * CELL + oz;
  const block = new Set(blocked.map(c => K(...c)));
  for (const [x, z, f] of spec.cells) if (!f) block.add(K(x, z));
  if (spec.bikeStand) block.add(K(spec.bikeStand[0], spec.bikeStand[1]));
  const porch = new Set((spec.porch || []).map(c => K(...c)));
  porch.forEach(k => block.add(k));
  for (const c of spec.garage?.cells || []) block.add(K(...c));
  const drive = (spec.drive || []).map(c => [...c]), extra = [];
  if (drive.length) { const last = drive.reduce((a, b) => (b[1] > a[1] ? b : a)); for (let z = last[1] + 1; z <= lot.z1; z++) { drive.push([last[0], z]); extra.push([last[0], z]); } }
  const driveSet = new Set(drive.map(c => K(...c)));
  driveSet.forEach(k => block.add(k));

  const [dx, dz] = spec.door, onPorch = porch.has(K(dx, dz + 1)), start = [dx, onPorch ? dz + 2 : dz + 1];
  // Dijkstra over (cell, heading); cost 1 per step + 0.6 per turn → straight, tidy paths
  const inLot = (x, z) => x >= lot.x0 && x <= lot.x1 && z >= lot.z0 && z <= lot.z1;
  const best = new Map(), prev = new Map(), q = [[0, start[0], start[1], 'S']];
  best.set(K(...start) + 'S', 0);
  let goal = null;
  while (q.length) {
    q.sort((a, b) => a[0] - b[0]);
    const [c, x, z, h] = q.shift(), id = K(x, z) + h;
    if (c > best.get(id)) continue;
    if (z === lot.z1) { goal = id; break; }
    for (const s of ORDER) {
      const nx = x + SIDE[s][0], nz = z + SIDE[s][1], nk = K(nx, nz);
      if (!inLot(nx, nz) || block.has(nk)) continue;
      const nc = c + 1 + (s !== h ? 0.6 : 0) + (s === 'N' ? 0.4 : 0), nid = nk + s;
      if (nc < (best.get(nid) ?? 1e9)) { best.set(nid, nc); prev.set(nid, id); q.push([nc, nx, nz, s]); }
    }
  }
  const path = [];
  for (let id = goal; id; id = prev.get(id)) { const [x, z] = id.slice(0, -1).split(',').map(Number); path.unshift([x, z]); }
  if (!goal) path.push(start);

  const conn = path.map(() => ({}));
  path.forEach(([x, z], i) => {
    for (const j of [i - 1, i + 1]) { const o = path[j]; if (!o) continue; for (const s of ORDER) if (x + SIDE[s][0] === o[0] && z + SIDE[s][1] === o[1]) conn[i][s] = true; }
  });
  if (path.length) { conn[0].N = true; if (goal) conn[path.length - 1].S = true; }
  const tie = path.findIndex(([x, z]) => driveSet.has(K(x - 1, z)) || driveSet.has(K(x + 1, z)));
  if (tie === 0 || tie === 1) { const [x, z] = path[tie]; conn[tie][driveSet.has(K(x - 1, z)) ? 'W' : 'E'] = true; }

  const items = [], key = c => ORDER.filter(s => c[s]).join('');
  path.forEach(([x, z], i) => items.push({ key: `path:${x},${z}:${key(conn[i])}:${style}`, make: () => pathTile({ conn: conn[i], style, seed: hash(seed, x, z) }), x: wx(x + 0.5), y: 0, z: wz(z + 0.5), ry: 0 }));
  for (const [x, z] of extra) items.push({ key: `drive:${x},${z}`, make: () => P.driveway(), x: wx(x + 0.5), y: 0, z: wz(z + 0.5), ry: 0 });
  const end = goal ? path[path.length - 1] : null, fz = wz(lot.z1 + 1) - 0.15;
  if (fence) for (let x = lot.x0; x <= lot.x1; x++) {
    if ((end && x === end[0]) || driveSet.has(K(x, lot.z1))) continue;
    const gateR = end && x === end[0] - 1, gateL = end && x === end[0] + 1;
    items.push({ key: `fence:${x}:${gateL ? 'L' : ''}${gateR ? 'R' : ''}`, make: () => picket({ gateL, gateR }), x: wx(x + 0.5), y: 0, z: fz, ry: 0 });
  }
  if (mail && end) items.push({ key: `mailbox:${end[0]}`, make: () => mailbox(), x: wx(end[0] + 0.5) + 0.75, y: 0, z: fz - 0.35, ry: 0 });

  // walk line for residents: front step → path cell centres → onto the sidewalk
  const walk = [[wx(dx + 0.5), 0, wz(start[1]) + 0.75]];
  for (const [x, z] of path) walk.push([wx(x + 0.5), 0, wz(z + 0.5)]);
  if (end) walk.push([wx(end[0] + 0.5), WALK_H, wz(lot.z1 + 1) + 0.45]);
  return { items, path, drive: extra, cuts: end || extra.length ? drive.filter(c => c[1] === lot.z1) : [], walk };
}

// ---------- lanes & driving ----------
// Lane through one tile, entering via side `inS`, leaving via `outS` (same side = U-turn). Right-hand traffic.
// Returns tile-local [x, z] points. Roundabouts loop around the island.
const right = ([dx, dz]) => [-dz, dx];
function laneCurve(it, inS, outS) {
  const off = it.tile.type === 'dirt' ? 0.45 : 1.0, din = [-SIDE[inS][0], -SIDE[inS][1]], dout = [SIDE[outS][0], SIDE[outS][1]];
  const ri = right(din), ro = right(dout);
  const p0 = [SIDE[inS][0] * H + ri[0] * off, SIDE[inS][1] * H + ri[1] * off], p3 = [dout[0] * H + ro[0] * off, dout[1] * H + ro[1] * off];
  const n = ORDER.filter(s => it.conn[s]).length;
  if (it.tile.round && it.tile.type === 'road' && n >= 3) {
    const R = 2.0, ai = Math.atan2(p0[1], p0[0]); let ao = Math.atan2(p3[1], p3[0]);
    while (ao >= ai - 0.3) ao -= Math.PI * 2;
    const pts = [p0];
    for (let k = 0; k <= 16; k++) { const a = ai - 0.25 + (ao + 0.25 - ai + 0.25) * k / 16; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
    pts.push(p3); return pts;
  }
  const straight = OPP[inS] === outS, uturn = inS === outS, dist = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  const k = straight ? dist / 3 : uturn ? 3.2 : 0.552 * dist / Math.SQRT2;
  const p1 = [p0[0] + din[0] * k, p0[1] + din[1] * k], p2 = [p3[0] - dout[0] * k, p3[1] - dout[1] * k], pts = [];
  for (let s = 0; s <= 16; s++) { const t = s / 16, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]); }
  return pts;
}
// Minimal random-wander driver over buildRoads() items — reference behaviour for the game's vehicles.js
function makeDriver(items, vehicle, { speed = 3, seed = 1, wheelR = 0.28 } = {}) {
  const map = new Map(items.map(it => [it.tile.i + ',' + it.tile.j, it])), r = rand(seed);
  const linked = items.filter(it => ORDER.some(s => it.conn[s]));
  if (!linked.length) return () => {};
  let cur = linked[Math.floor(r() * linked.length)], inS = ORDER.filter(s => cur.conn[s])[0], outS, pts, len, cum, dist = r() * 4;
  const plan = () => {
    const opts = ORDER.filter(s => cur.conn[s] && s !== inS);
    outS = opts.length ? opts[Math.floor(r() * opts.length)] : inS;
    pts = laneCurve(cur, inS, outS).map(([x, z]) => [x + cur.x, z + cur.z]);
    cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    len = cum.at(-1);
  };
  const at = d => { let k = 1; while (k < cum.length - 1 && cum[k] < d) k++; const t = (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1), a = pts[k - 1], b = pts[k]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  plan();
  return dt => {
    const ds = speed * dt; dist += ds;
    while (dist > len) { dist -= len; const [dx, dz] = SIDE[outS]; const nx = map.get((cur.tile.i + dx) + ',' + (cur.tile.j + dz)); if (nx) { cur = nx; inS = OPP[outS]; } else inS = outS; plan(); }
    const p = at(dist), q = at(Math.min(dist + 0.6, len)), h = q[0] === p[0] && q[1] === p[1] ? vehicle.rotation.y : Math.atan2(q[0] - p[0], q[1] - p[1]);
    let dh = h - vehicle.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    vehicle.position.set(p[0], cur.tile.type === 'dirt' ? DIRT_H : ASPH_H, p[1]); vehicle.rotation.y += dh * Math.min(1, dt * 10);
    vehicle.traverse(o => { if (o.name === 'wheel') o.rotation.x += ds / wheelR; });
  };
}

// ---------- procedural layout ----------
// Main street across the middle, side streets (some dirt) branching off with optional bends; occasional crossings & roundabouts.
function randomNetwork(seed, w = 9, h = 7) {
  const r = rand(hash('net', seed)), map = new Map();
  const put = (i, j, type) => { if (i < 0 || j < 0 || i >= w || j >= h) return false; const k = i + ',' + j, o = map.get(k); if (!o || type === 'road') map.set(k, { i, j, type }); return !o; };
  const mj = Math.floor(h / 2) - (r() < 0.5 ? 0 : 1);
  for (let i = 0; i < w; i++) put(i, mj, 'road');
  let forcedCross = false;
  for (let i = 1 + Math.floor(r() * 2); i < w - 1; i += 2 + Math.floor(r() * 2)) {
    const both = !forcedCross || r() < 0.3; forcedCross = true;
    for (const dir of both ? [-1, 1] : [r() < 0.5 ? -1 : 1]) {
      const type = r() < 0.35 ? 'dirt' : 'road', len = 1 + Math.floor(r() * (dir < 0 ? mj : h - mj - 1));
      let x = i, z = mj;
      for (let s = 0; s < len; s++) { z += dir; put(x, z, type); }
      if (r() < 0.55) { const tx = r() < 0.5 ? -1 : 1; for (let s = 0; s < 1 + Math.floor(r() * 2); s++) { x += tx; if (!put(x, z, type)) break; } }
    }
  }
  const tiles = [...map.values()], has = (i, j) => map.get(i + ',' + j)?.type === 'road';
  for (const t of tiles) if (t.type === 'road' && ORDER.filter(s => has(t.i + SIDE[s][0], t.j + SIDE[s][1])).length >= 3 && r() < 0.3) t.round = true;
  return tiles;
}

export {
  TILE, RC as ROAD_CELLS, LANE_HW, WALK_H, ASPH_H, DIRT_H, SIDE, OPP, ORDER, RM as ROAD_MAT,
  roadTile, dirtTile, pathTile, picket, mailbox, buildRoads, connectLot, laneCurve, makeDriver, randomNetwork,
};
