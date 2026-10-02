// Road scale comparison — scene builders for the three options (reference/demo code, not kit code).
import * as THREE from 'three';
import * as Kit from '../kit/kit.js';
import * as R from '../kit/roads.js';
import * as L from '../kit/lanes.js';

const { box, grp, P, CELL, rect, PLASTER, ROOF, CLOTH } = Kit, RM = R.ROAD_MAT;
const gridM = Kit.M('grid_line', '#c4dcb2', 0.9), paveM = RM.walk;
const GROUND_W = 40, GROUND_D = 32;
const cc = v => (v + 0.5) * CELL;                       // cell index → cell-centre metres
const put = (g, o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o; };
const place = (g, it) => put(g, it.make(), it.x, it.y, it.z, it.ry);

function ground(g, cx, cz) {
  g.add(box('ground_grass', GROUND_W, 0.06, GROUND_D, RM.grass, cx, -0.03, cz));
  const x0 = cx - GROUND_W / 2, z0 = cz - GROUND_D / 2;
  for (let x = 0; x <= GROUND_W; x += CELL) g.add(box('grid_line', 0.03, 0.003, GROUND_D, gridM, x0 + x, 0.0015, cz));
  for (let z = 0; z <= GROUND_D; z += CELL) g.add(box('grid_line', GROUND_W, 0.003, 0.03, gridM, cx, 0.0015, z0 + z));
}
// house lot: footprint w×d cells at cell (x0, z0); face 'S' | 'N'. Returns the front cell (where the garden path starts).
function house(g, { x0, z0, w, d, face = 'S', dx = 0, plaster, roof, seed }) {
  const spec = { cells: rect(0, w, 0, d, 0), door: [dx, d - 1], porch: [], chimney: seed % 2 ? 0 : null, garage: null,
    style: { plaster, roof, shutters: true, shutterMat: ROOF.slate }, seed };
  const h = grp('house_' + seed);
  Kit.buildPlan(spec, -w * CELL / 2, -d * CELL / 2).forEach(it => place(h, it));
  put(g, h, (x0 + w / 2) * CELL, 0, (z0 + d / 2) * CELL, face === 'N' ? Math.PI : 0);
  return face === 'N' ? [x0 + w - 1 - dx, z0 - 1] : [x0 + dx, z0 + d];
}
// garden paths: cells [[x, z, ...extra sides]] — conn from neighbours in the set + extra sides (door / sidewalk / lane)
function paths(g, list, style = 'gravel') {
  const set = new Set(list.map(([x, z]) => x + ',' + z));
  list.forEach(([x, z, ...extra], k) => {
    const conn = {}; for (const s of R.ORDER) if (set.has((x + R.SIDE[s][0]) + ',' + (z + R.SIDE[s][1])) || extra.includes(s)) conn[s] = true;
    put(g, R.pathTile({ conn, style, seed: k + x * 7 + z * 3 }), cc(x), 0, cc(z));
  });
}
const drive = (g, list) => list.forEach(([x, z]) => put(g, P.driveway(), cc(x), 0, cc(z)));
const CROPS = ['carrot', 'cabbage', 'pumpkin', 'tomato', 'wheat', 'carrot'];
function plots(g, x0, z0, w, d) { let k = 0; for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++, k++) put(g, P.farmPlot({ type: CROPS[k % 6], stage: 'mixed', seed: k + 3 }), cc(x), 0, cc(z)); }
function market(g, x0, z0) {   // 2×2 cells, stall faces north
  g.add(box('market_paving', 2 * CELL - 0.1, 0.03, 2 * CELL - 0.1, paveM, (x0 + 1) * CELL, 0.015, (z0 + 1) * CELL));
  put(g, P.marketStall(), (x0 + 1) * CELL, 0.03, (z0 + 1) * CELL - 0.2, Math.PI);
  put(g, Kit.setAction(Kit.resident('cat', { outfit: CLOTH.lilac }), 'sell'), (x0 + 1) * CELL, 0.03, (z0 + 1) * CELL + 0.7, Math.PI);
}
const gardener = (g, x, z) => put(g, Kit.setAction(Kit.resident('frog', { outfit: CLOTH.mint }), 'water'), x, 0, z, -Math.PI / 2);

function car(k = 0) { const c = P.car({ paint: [Kit.PAINT.peach, Kit.PAINT.sky][k % 2] }); Kit.board(c, Kit.resident(k ? 'bear' : 'fox')); return c; }
function bike() { const b = P.bicycle({ paint: Kit.PAINT.mint }); Kit.board(b, Kit.resident('bunny', { outfit: CLOTH.pink, scarf: CLOTH.mint })); return b; }

// smooth a cell-centre polyline (Chaikin ×3) so turns follow the curved corner pieces
function smooth(pts) {
  let p = pts;
  for (let it = 0; it < 3; it++) { const q = [p[0]]; for (let k = 0; k < p.length - 1; k++) { const a = p[k], b = p[k + 1]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } q.push(p.at(-1)); p = q; }
  return p;
}
// ping-pong along a polyline (metres); turns on the spot at each end — single lanes have nowhere else to turn
function follow(obj, pts, { speed = 2, y = 0, wheelR = 0 } = {}) {
  const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const len = cum.at(-1), at = d => { let k = 1; while (k < cum.length - 1 && cum[k] < d) k++; const t = (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1), a = pts[k - 1], b = pts[k]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  let d = 0, dir = 1, pause = 0;
  return dt => {
    if (pause > 0) pause -= dt;
    else { d += dir * speed * dt; if (d >= len || d <= 0) { d = Math.max(0, Math.min(len, d)); dir *= -1; pause = 1.4; } }
    const p = at(d), q = at(Math.max(0, Math.min(len, d + dir * 0.6))), h = Math.atan2(q[0] - p[0], q[1] - p[1]);
    let dh = Math.atan2(Math.sin(h - obj.rotation.y), Math.cos(h - obj.rotation.y));
    obj.position.set(p[0], y, p[1]); obj.rotation.y += dh * Math.min(1, dt * (pause > 0 ? 3 : 8));
    if (wheelR && pause <= 0) obj.traverse(o => { if (o.name === 'wheel') o.rotation.x += speed * dt / wheelR; });
  };
}
const cellPts = list => smooth(list.map(([x, z]) => [cc(x), cc(z)]));
const tileCells = t => t.length * R.ROAD_CELLS * R.ROAD_CELLS;
function finish(g, inner, w, d) { inner.position.set(-w * CELL / 2, 0, -d * CELL / 2); g.add(inner); g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; }

// shared street layout for A and C (6 m tiles): main street, crossing, T, dead ends
const STREETS = [[0, 1], [1, 1], [2, 1], [3, 1], [1, 0], [1, 2], [3, 0], [3, 2]].map(([i, j]) => ({ i, j, type: 'road' }));
function streetVillage(g) {   // houses, market, plots in the 2 m cells between 6 m streets (A and C share this)
  const f1 = house(g, { x0: 0, z0: 0, w: 2, d: 2, plaster: PLASTER.pink, roof: ROOF.coral, seed: 11 });
  const f2 = house(g, { x0: 6, z0: 0, w: 3, d: 2, dx: 1, plaster: PLASTER.butter, roof: ROOF.sage, seed: 12 });
  const f3 = house(g, { x0: 6, z0: 7, w: 2, d: 2, face: 'N', plaster: PLASTER.sky, roof: ROOF.plum, seed: 13 });
  paths(g, [[...f1, 'N', 'S'], [...f2, 'N', 'S'], [...f3, 'N', 'S']]);
  drive(g, [[2, 1], [2, 2], [8, 6], [8, 7]]);
  market(g, 0, 6);
  plots(g, 9, 9, 3, 2); gardener(g, cc(12) - 0.3, cc(9.5));
  return [[2, 2], [8, 6]];   // driveway cells that need a dropped kerb
}

// ---------- Option A: 6 m streets, kit as is ----------
function buildA() {
  const g = grp('option_A_6m_streets'), v = grp('village'), tick = [];
  ground(v, 15, 12);
  const tiles = [...STREETS, { i: 4, j: 2, type: 'dirt' }, { i: 4, j: 3, type: 'dirt' }];
  const cuts = streetVillage(v), roads = R.buildRoads(tiles, { cuts, seed: 2 });
  roads.forEach(it => place(v, it));
  const c = put(v, car(0), 0, 0, 0); tick.push(R.makeDriver(roads, c, { seed: 5, speed: 2.6 }));
  const b = put(v, bike(), 0, 0, 0); tick.push(follow(b, [[2, 10], [21, 10]], { speed: 1.6, y: R.ASPH_H }));
  const road = tileCells(tiles);
  return { group: finish(g, v, 15, 12), tick, stats: { road, w: 15, d: 12, roadM2: road * 4 } };
}

// ---------- Option B: 2 m lanes ----------
const B_ROAD = [...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(x => [x, 3]), [3, 0], [3, 1], [3, 2], [3, 4], [3, 5], [8, 0], [8, 1], [8, 2], [8, 4], [8, 5]];
const B_DIRT = [[9, 5], [10, 5], [10, 6], [10, 7]];
function buildB() {
  const g = grp('option_B_2m_lanes'), v = grp('village'), tick = [];
  ground(v, 11, 8);
  const cells = [...B_ROAD.map(([x, z]) => ({ x, z, type: 'road' })), ...B_DIRT.map(([x, z]) => ({ x, z, type: 'dirt' }))];
  L.buildLanes(cells).items.forEach(it => place(v, it));
  const f1 = house(v, { x0: 0, z0: 0, w: 2, d: 2, plaster: PLASTER.pink, roof: ROOF.coral, seed: 11 });
  const f2 = house(v, { x0: 4, z0: 0, w: 3, d: 2, dx: 1, plaster: PLASTER.butter, roof: ROOF.sage, seed: 12 });
  const f3 = house(v, { x0: 5, z0: 5, w: 2, d: 2, face: 'N', plaster: PLASTER.sky, roof: ROOF.plum, seed: 13 });
  paths(v, [[...f1, 'N', 'S'], [...f2, 'N', 'S'], [...f3, 'N', 'S']]);
  drive(v, [[2, 1], [2, 2], [7, 1], [7, 2], [7, 4]]);
  market(v, 0, 4);
  plots(v, 7, 6, 3, 2); gardener(v, cc(10) - 0.3, cc(8) - 0.4);
  const c = put(v, car(0), 0, 0, 0); tick.push(follow(c, cellPts([[0, 3], [8, 3], [8, 5], [10, 5], [10, 7]]), { speed: 2.2, y: R.ASPH_H, wheelR: 0.28 }));
  const b = put(v, bike(), 0, 0, 0); tick.push(follow(b, cellPts([[3, 0], [3, 5]]), { speed: 1.4, y: R.ASPH_H }));
  const road = cells.length;
  return { group: finish(g, v, 11, 8), tick, stats: { road, w: 11, d: 8, roadM2: road * 4 } };
}

// ---------- Option C: 6 m streets in the centre, 2 m dirt lanes to the farm ----------
const C_DIRT = [[12, 7], [13, 7], [13, 8], [13, 9], [12, 9], [13, 10]];
function buildC() {
  const g = grp('option_C_mixed'), v = grp('village'), tick = [];
  ground(v, 14, 12);
  const lanes = L.buildLanes(C_DIRT.map(([x, z]) => ({ x, z, type: 'dirt' })), { streets: STREETS });
  const cuts = [...streetVillage(v), ...lanes.cuts], roads = R.buildRoads(STREETS, { cuts, seed: 2 });
  roads.forEach(it => place(v, it)); lanes.items.forEach(it => place(v, it));
  const c = put(v, car(1), 0, 0, 0); tick.push(R.makeDriver(roads, c, { seed: 9, speed: 2.6 }));
  const b = put(v, bike(), 0, 0, 0); tick.push(follow(b, cellPts([[10.6, 7], [13, 7], [13, 10]]), { speed: 1.4, y: R.DIRT_H }));
  const road = tileCells(STREETS) + C_DIRT.length;
  return { group: finish(g, v, 14, 12), tick, stats: { road, w: 14, d: 12, roadM2: road * 4 } };
}

// ---------- 2 m piece sheet (B / C additions) ----------
function buildPieces() {
  const g = grp('lane_pieces'), tick = [], gap = 3;
  g.add(box('ground_grass', 6 * gap + 3, 0.06, 4 * gap + 1, RM.grass, 2.5 * gap - 1, -0.03, 1.5 * gap));
  const set = [{ S: 1 }, { N: 1, S: 1 }, { S: 1, E: 1 }, { W: 1, E: 1, S: 1 }, { N: 1, E: 1, S: 1, W: 1 }];
  const pad = (x, z) => g.add(box('cell_pad', CELL + 0.1, 0.01, CELL + 0.1, gridM, x, 0.002, z));
  set.forEach((c, k) => {
    const a = Object.fromEntries(Object.keys(c).map(s => [s, 'road'])), d = Object.fromEntries(Object.keys(c).map(s => [s, 'dirt']));
    pad(k * gap, 0); put(g, L.laneTile({ conn: a, seed: k + 1 }), k * gap, 0, 0);
    pad(k * gap, gap); put(g, L.dirtLaneTile({ conn: d, seed: k + 1 }), k * gap, 0, gap);
  });
  // join: asphalt → dirt, two cells
  const jx = 5 * gap; pad(jx, -1); pad(jx, 1);
  put(g, L.laneTile({ conn: { N: 'road', S: 'dirt' }, seed: 3 }), jx, 0, -1 + 0);
  put(g, L.dirtLaneTile({ conn: { N: 'road', S: 'dirt' }, seed: 4 }), jx, 0, 1);
  // lane mouth onto a 6 m street (C): dead-end street tile + one dirt lane cell on its E edge
  const st = { i: 0, j: 0, type: 'road' }, mz = 2.5 * gap, lanes = L.buildLanes([{ x: 3, z: 1, type: 'dirt' }, { x: 4, z: 1, type: 'dirt' }], { streets: [st], ox: -3 }), sub = grp('lane_mouth_demo');
  R.buildRoads([st], { cuts: lanes.cuts, ox: -3 }).forEach(it => place(sub, it)); lanes.items.forEach(it => place(sub, it));
  put(g, sub, 0, 0, mz - 3);
  // width check: car + bike parked on straights
  put(g, car(0), 1 * gap, R.ASPH_H, 0); put(g, bike(), 1 * gap, R.DIRT_H, gap);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, tick, stats: null };
}

export { buildA, buildB, buildC, buildPieces };
