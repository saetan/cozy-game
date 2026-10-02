// Pastel House Kit — house: modular pieces, garage, cell-based builder, fixed level path, random house.
// Conventions (see README): 1 unit = 1 m, +Y up, +Z = front/outside, pieces pivot at their ground/edge anchor.
import * as THREE from 'three';
import { CELL, WALL_H, T, FOUND_H, RISE, M, PLASTER, ROOF, PAINT, trim, wood, glass, stone, leaf, dark, box, grp, onEdge, rect, hash, rng, pick, P } from './core.js';
import { CLOTH, SPECIES, resident, setAction } from './characters.js';
import { lamp, board, parkBike } from './vehicles.js';
import { CROPS } from './farm.js';

// ---- pieces ----
P.foundation = () => grp('foundation',
  box('foundation_stone', CELL, FOUND_H - 0.04, CELL, stone, 0, (FOUND_H - 0.04) / 2, 0),
  box('foundation_floor', CELL - 0.002, 0.04, CELL - 0.002, wood, 0, FOUND_H - 0.02, 0));

P.wall = ({ plaster = PLASTER.pink } = {}) =>
  onEdge('wall', grp('wall_body', box('wall_plaster', CELL, WALL_H, T, plaster, 0, WALL_H / 2)));

P.wallWindow = ({ plaster = PLASTER.pink, shutters = true, shutterMat = wood } = {}) => {
  const b = grp('wallWindow_body');
  const ow = 0.9, sill = 0.9, top = 1.9, side = (CELL - ow) / 2;
  b.add(box('wall_left', side, WALL_H, T, plaster, -(ow / 2 + side / 2), WALL_H / 2));
  b.add(box('wall_right', side, WALL_H, T, plaster, ow / 2 + side / 2, WALL_H / 2));
  b.add(box('wall_below', ow, sill, T, plaster, 0, sill / 2));
  b.add(box('wall_above', ow, WALL_H - top, T, plaster, 0, (WALL_H + top) / 2));
  const fd = T + 0.06, fw = 0.08, oh = top - sill;
  b.add(box('frame_l', fw, oh, fd, trim, -(ow - fw) / 2, sill + oh / 2));
  b.add(box('frame_r', fw, oh, fd, trim, (ow - fw) / 2, sill + oh / 2));
  b.add(box('frame_t', ow - 2 * fw, fw, fd, trim, 0, top - fw / 2));
  b.add(box('frame_b', ow - 2 * fw, fw, fd, trim, 0, sill + fw / 2));
  b.add(box('sill', ow + 0.2, 0.06, 0.34, trim, 0, sill - 0.03, 0.07));
  b.add(box('glass', ow - 2 * fw, oh - 2 * fw, 0.03, glass, 0, sill + oh / 2));
  b.add(box('mullion_v', 0.04, oh - 2 * fw, 0.07, trim, 0, sill + oh / 2));
  b.add(box('mullion_h', ow - 2 * fw, 0.04, 0.07, trim, 0, sill + oh / 2));
  if (shutters) for (const s of [-1, 1]) {
    const sh = grp('shutter_' + (s < 0 ? 'l' : 'r'));
    sh.add(box('shutter_panel', 0.36, oh, 0.04, shutterMat, 0, 0, 0));
    for (let i = -2; i <= 2; i++) sh.add(box('shutter_slat', 0.3, 0.035, 0.02, shutterMat, 0, i * 0.17, 0.028));
    sh.position.set(s * (ow / 2 + 0.2), sill + oh / 2, T / 2 + 0.03);
    b.add(sh);
  }
  return onEdge('wallWindow', b);
};

P.wallDoor = ({ plaster = PLASTER.pink, doorMat = wood, covered = false } = {}) => {
  const b = grp('wallDoor_body');
  const ow = 0.9, oh = 2.0, side = (CELL - ow) / 2, fw = 0.08, fd = T + 0.06;
  b.add(box('wall_left', side, WALL_H, T, plaster, -(ow / 2 + side / 2), WALL_H / 2));
  b.add(box('wall_right', side, WALL_H, T, plaster, ow / 2 + side / 2, WALL_H / 2));
  b.add(box('wall_above', ow, WALL_H - oh, T, plaster, 0, (WALL_H + oh) / 2));
  b.add(box('frame_l', fw, oh, fd, trim, -(ow - fw) / 2, oh / 2));
  b.add(box('frame_r', fw, oh, fd, trim, (ow - fw) / 2, oh / 2));
  b.add(box('frame_t', ow, fw, fd, trim, 0, oh - fw / 2));
  const dw = ow - 2 * fw, dh = oh - fw;
  b.add(box('door_panel', dw, dh, 0.06, doorMat, 0, dh / 2, -0.02));
  b.add(box('door_inset_top', dw - 0.24, 0.6, 0.02, doorMat, 0, dh * 0.72, 0.02));
  b.add(box('door_inset_bot', dw - 0.24, 0.7, 0.02, doorMat, 0, dh * 0.28, 0.02));
  const knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), trim);
  knob.name = 'door_knob'; knob.position.set(dw / 2 - 0.1, 1.0, 0.04); b.add(knob);
  if (!covered) {
    b.add(box('awning', ow + 0.4, 0.08, 0.5, trim, 0, oh + 0.18, T / 2 + 0.2));
    b.add(box('step_lower', 1.3, FOUND_H / 2, 0.7, stone, 0, -FOUND_H * 0.75, T / 2 + 0.35));
    b.add(box('step_upper', 1.1, FOUND_H / 2, 0.35, stone, 0, -FOUND_H * 0.25, T / 2 + 0.175));
  }
  return onEdge('wallDoor', b);
};

P.cornerPost = () => grp('cornerPost', box('post', 0.3, WALL_H, 0.3, trim, 0, WALL_H / 2));

P.beltCourse = () => grp('beltCourse', box('belt', CELL, 0.14, T + 0.08, trim, 0, 0, -T / 2 + 0.04));

const PITCH = RISE / CELL;
// roof slope, one cell along the ridge, any half-span. Pivot = eave line on the outer wall face (z=0, y=0 = wall top);
// rises toward -z, reaching the ridge at z=-run, y=rise. Constant pitch keeps any depth of house looking consistent.
P.roofSlope = ({ roof = ROOF.coral, run = CELL, rise = run * PITCH, overhang = 0.35, width = CELL } = {}) => {
  const a = Math.atan2(rise, run), L = Math.hypot(run, rise) + overhang;
  const f = grp('roofSlope_frame');
  f.position.set(0, rise, -run);
  f.rotation.x = a;
  f.add(box('roof_deck', width, 0.1, L, roof, 0, 0.05, L / 2));
  const rows = Math.max(2, Math.round(L / 0.5)), rl = L / rows;
  for (let i = 0; i < rows; i++) {
    const s = box('shingle_row_' + i, width, 0.05, rl + 0.04, roof, 0, 0.12, (i + 0.5) * rl);
    s.rotation.x = -0.07; f.add(s);
  }
  f.add(box('fascia', width, 0.16, 0.06, trim, 0, 0.04, L + 0.03));
  return grp('roofSlope', f);
};

// pivot = wall-top level under the ridge line
P.ridgeCap = ({ roof = ROOF.coral, rise = RISE, width = CELL } = {}) => {
  const r = box('ridge', width, 0.26, 0.26, roof, 0, rise + 0.12, 0);
  r.rotation.x = Math.PI / 4;
  return grp('ridgeCap', r);
};

// gable segment for one wall edge (pivot like walls: bottom-centre of outer face, at wall-top height).
// ridgeAt = ridge position along the segment's local x; profile height = rise * (1 - |x - ridgeAt| / run)
P.gable = ({ plaster = PLASTER.pink, ridgeAt = -CELL / 2, run = CELL, rise = run * PITCH, width = CELL } = {}) => {
  const h = width / 2, H = x => Math.max(0, rise * (1 - Math.abs(x - ridgeAt) / run)), s = new THREE.Shape();
  s.moveTo(-h, 0); s.lineTo(h, 0);
  if (H(h) > 0.001) s.lineTo(h, H(h));
  if (ridgeAt > -h + 0.001 && ridgeAt < h - 0.001) s.lineTo(ridgeAt, rise);
  if (H(-h) > 0.001) s.lineTo(-h, H(-h));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
  g.translate(0, 0, -T);
  const m = new THREE.Mesh(g, plaster); m.name = 'gable_plaster';
  const out = grp('gable', m), vx = Math.min(h - 0.35, Math.max(-h + 0.35, ridgeAt));
  if (H(vx) > 0.75) {
    const vent = box('gable_vent', 0.22, 0.22, 0.04, trim, vx, 0.35, 0.02);
    vent.rotation.z = Math.PI / 4; out.add(vent);
  }
  return out;
};
P.gableHalf = o => P.gable(o);

const PORCH_RISE = 0.6, PORCH_EAVE = FOUND_H + WALL_H - PORCH_RISE - 0.12, PORCH_H = PORCH_EAVE - FOUND_H;
P.porchDeck = () => {
  const g = grp('porchDeck', box('deck_base', CELL, FOUND_H - 0.04, CELL, stone, 0, (FOUND_H - 0.04) / 2, 0));
  for (let i = 0; i < 5; i++) g.add(box('deck_plank', CELL - 0.02, 0.04, CELL / 5 - 0.03, wood, 0, FOUND_H - 0.02, -CELL / 2 + (i + 0.5) * CELL / 5));
  return g;
};
P.porchPost = () => grp('porchPost', box('porch_post', 0.14, PORCH_H, 0.14, trim, 0, PORCH_H / 2), box('post_cap', 0.22, 0.08, 0.22, trim, 0, PORCH_H - 0.04));
P.porchSteps = () => grp('porchSteps',
  box('step_lower', 1.3, FOUND_H / 2, 0.7, stone, 0, FOUND_H / 4, 0.35),
  box('step_upper', 1.1, FOUND_H / 2, 0.35, stone, 0, FOUND_H * 0.75, 0.175));

P.chimney = () => grp('chimney',
  box('chimney_stack', 0.5, 1.7, 0.5, stone, 0, 0.85),
  box('chimney_cap', 0.64, 0.12, 0.64, trim, 0, 1.76),
  box('chimney_flue', 0.3, 0.1, 0.3, dark, 0, 1.87));

P.fence = () => {
  const g = grp('fence');
  for (const x of [-0.95, 0.95]) g.add(box('fence_post', 0.1, 0.95, 0.1, trim, x, 0.475));
  g.add(box('fence_rail_low', CELL - 0.1, 0.06, 0.05, trim, 0, 0.25, -0.05));
  g.add(box('fence_rail_high', CELL - 0.1, 0.06, 0.05, trim, 0, 0.62, -0.05));
  for (let i = 0; i < 6; i++) {
    const x = -0.72 + i * 0.288;
    g.add(box('picket', 0.11, 0.7, 0.03, trim, x, 0.4, 0));
    const tip = box('picket_tip', 0.078, 0.078, 0.03, trim, x, 0.75, 0); tip.rotation.z = Math.PI / 4; g.add(tip);
  }
  return g;
};

P.shrub = () => {
  const g = grp('shrub');
  [[0, 0.32, 0, 0.38], [0.28, 0.24, 0.1, 0.26], [-0.25, 0.22, -0.08, 0.24]].forEach(([x, y, z, r], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaf);
    m.name = 'shrub_blob_' + i; m.position.set(x, y, z); m.rotation.set(i, i * 2, 0); g.add(m);
  });
  return g;
};

// ---- driveway + garage ----
const paving = M('paving', '#e8e1d5', 0.95), pavingJoint = M('paving_joint', '#d4ccbf', 0.95), concrete = M('concrete', '#e4ddd2', 0.95);
P.driveway = () => {
  const g = grp('driveway', box('drive_paving', CELL - 0.1, 0.03, CELL, paving, 0, 0.015, 0));
  for (const s of [-1, 1]) g.add(box('drive_edge', 0.08, 0.05, CELL, stone, s * (CELL / 2 - 0.04), 0.025, 0));
  for (let i = 0; i < 4; i++) g.add(box('drive_joint', CELL - 0.18, 0.006, 0.03, pavingJoint, 0, 0.033, -CELL / 2 + (i + 0.5) * CELL / 4));
  return g;
};
// ground-level floor so cars can roll in; curbs (letters N/S/E/W) sit under exterior walls in place of the raised foundation
P.garageSlab = ({ curbs = 'NEW' } = {}) => {
  const g = grp('garageSlab', box('garage_floor', CELL, 0.03, CELL, concrete, 0, 0.015, 0));
  const L = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] };
  for (const s of curbs) { const [dx, dz] = L[s]; g.add(box('garage_curb', dx ? T : CELL, FOUND_H, dz ? T : CELL, stone, dx * (CELL / 2 - T / 2), FOUND_H / 2, dz * (CELL / 2 - T / 2))); }
  return g;
};
// garage door wall: opening reaches the ground; 'garage_door' hinges at the top — rotation.x = PI/2 swings it up and inside
P.wallGarage = ({ plaster = PLASTER.pink, doorMat = trim } = {}) => {
  const b = grp('wallGarage_body'), ow = 1.64, top = 2.1 - FOUND_H, side = (CELL - ow) / 2, fw = 0.08, fd = T + 0.06, sh = WALL_H + FOUND_H;
  for (const s of [-1, 1]) {
    b.add(box('wall_side', side, sh, T, plaster, s * (ow / 2 + side / 2), sh / 2 - FOUND_H));
    b.add(box('frame_side', fw, top + FOUND_H, fd, trim, s * (ow / 2 - fw / 2), (top - FOUND_H) / 2));
  }
  b.add(box('wall_above', ow, WALL_H - top, T, plaster, 0, (WALL_H + top) / 2));
  b.add(box('frame_top', ow, fw, fd, trim, 0, top - fw / 2));
  const door = grp('garage_door'), dh = top + FOUND_H - fw, dw = ow - 2 * fw;
  door.position.set(0, top - fw, -0.05);
  door.add(box('garage_panel', dw, dh, 0.05, doorMat, 0, -dh / 2, 0));
  for (let i = 1; i < 4; i++) door.add(box('garage_groove', dw - 0.04, 0.03, 0.02, stone, 0, -i * dh / 4, 0.03));
  door.add(box('garage_window_row', dw - 0.3, 0.16, 0.02, glass, 0, -dh / 8, 0.03));
  door.add(box('garage_handle', 0.24, 0.04, 0.04, dark, 0, -dh + 0.18, 0.04));
  b.add(door);
  b.add(box('garage_lamp', 0.12, 0.16, 0.1, lamp, -(ow / 2 + side / 2), top + 0.25, T / 2 + 0.05));
  return onEdge('wallGarage', b);
};

// ---- cell-based house builder ----
// spec = { cells: [[x,z,floor]], door: [x,z] (south edge), porch: [[x,z]] (cells south of the house),
//          chimney: column|null, style: { plaster, roof, shutters, shutterMat }, seed }
// Walls go on every edge between an occupied and an empty cell; corner posts on convex corners;
// roofs on greedy rectangles of top-most cells (ridge along the longer side). Returns a flat plan of
// { key, make, x, y, z, ry } — keys are stable, so a level-up can diff old vs new plans.
const SIDES = { S: [0, 1, 0], N: [0, -1, Math.PI], E: [1, 0, Math.PI / 2], W: [-1, 0, -Math.PI / 2] };
function buildPlan(spec, ox = 0, oz = 0) {
  const has = new Set(spec.cells.map(c => c.join(','))), on = (x, z, f) => has.has(`${x},${z},${f}`);
  const st = spec.style, out = [], seen = new Set(), wx = x => x * CELL + ox, wz = z => z * CELL + oz;
  const add = (key, make, x, y, z, ry = 0) => { if (seen.has(key)) return; seen.add(key); out.push({ key, make, x, y, z, ry }); };
  const porch = new Set((spec.porch || []).map(p => p.join(',')));
  const gar = spec.garage, gset = new Set(gar ? gar.cells.map(c => c.join(',')) : []), isG = (x, z) => gset.has(x + ',' + z);
  const floors = [...new Set(spec.cells.map(c => c[2]))].sort(), maxF = Math.max(...floors);

  for (const [x, z, f] of spec.cells) {
    const cx = wx(x + 0.5), cz = wz(z + 0.5), y = FOUND_H + f * WALL_H;
    const gDoor = s => gar && f === 0 && gar.door[0] === x && gar.door[1] === z && s === 'S';
    if (f === 0 && isG(x, z)) {
      const curbs = Object.keys(SIDES).filter(s => !on(x + SIDES[s][0], z + SIDES[s][1], 0) && !gDoor(s)).join('');
      add(`gslab:${x},${z}:${curbs}`, () => P.garageSlab({ curbs }), cx, 0, cz);
    } else if (f === 0) add(`found:${x},${z}`, () => P.foundation(), cx, 0, cz);
    for (const s in SIDES) {
      const [dx, dz, ry] = SIDES[s];
      const ex = cx + dx * CELL / 2, ez = cz + dz * CELL / 2;
      if (on(x + dx, z + dz, f)) {
        // party wall between garage and living space
        if (f === 0 && isG(x, z) && !isG(x + dx, z + dz)) add(`iwall:${x},${z},${s}`, () => P.wall({ plaster: st.plaster }), ex, y, ez, ry);
        continue;
      }
      const isDoor = f === 0 && spec.door && spec.door[0] === x && spec.door[1] === z && s === 'S';
      const covered = f === 0 && porch.has(`${x + dx},${z + dz}`);
      const kind = gDoor(s) ? 'garage' : isDoor ? 'door' : hash(spec.seed, x, z, f, s) < (f ? 0.7 : 0.6) ? 'window' : 'wall';
      add(`wall:${x},${z},${f},${s}:${kind}${covered ? ':c' : ''}`, () =>
        kind === 'garage' ? P.wallGarage({ plaster: st.plaster })
        : kind === 'door' ? P.wallDoor({ plaster: st.plaster, covered })
        : kind === 'window' ? P.wallWindow({ plaster: st.plaster, shutters: st.shutters, shutterMat: st.shutterMat })
        : P.wall({ plaster: st.plaster }), ex, y, ez, ry);
      if (f > 0) add(`belt:${x},${z},${f},${s}`, () => P.beltCourse(), ex, y, ez, ry);
    }
  }

  for (const f of floors) {
    const verts = new Set();
    spec.cells.filter(c => c[2] === f).forEach(([x, z]) => { for (const a of [0, 1]) for (const b of [0, 1]) verts.add((x + a) + ',' + (z + b)); });
    for (const v of verts) {
      const [vx, vz] = v.split(',').map(Number);
      const q = [[vx - 1, vz - 1], [vx, vz - 1], [vx - 1, vz], [vx, vz]].filter(([x, z]) => on(x, z, f));
      if (q.length !== 1) continue;
      const [qx, qz] = q[0];
      add(`post:${v},${f}`, () => P.cornerPost(), wx(vx) + (qx < vx ? -0.1 : 0.1), FOUND_H + f * WALL_H, wz(vz) + (qz < vz ? -0.1 : 0.1));
    }
  }

  const endGable = (x, z, s, ridgeWorld, run, rise, f, yT) => {
    const [dx, dz, ry] = SIDES[s];
    if (on(x + dx, z + dz, f)) return;
    const ex = wx(x + 0.5) + dx * CELL / 2, ez = wz(z + 0.5) + dz * CELL / 2;
    // project the ridge onto the wall's local x axis (cos ry, 0, -sin ry)
    const ridgeAt = s === 'E' || s === 'W' ? (ridgeWorld - ez) * -Math.sin(ry) : (ridgeWorld - ex) * Math.cos(ry);
    add(`gable:${x},${z},${f},${s}:${run}:${ridgeAt.toFixed(2)}`, () => P.gable({ plaster: st.plaster, ridgeAt, run, rise }), ex, yT, ez, ry);
  };
  const roofBlock = (x0, x1, z0, z1, f) => {
    const yT = FOUND_H + (f + 1) * WALL_H, alongX = x1 - x0 >= z1 - z0, roof = st.roof;
    const run = (alongX ? z1 - z0 : x1 - x0) * CELL / 2, rise = run * PITCH;
    if (alongX) {
      const rz = wz((z0 + z1) / 2);
      for (let i = x0; i < x1; i++) {
        const cx = wx(i + 0.5);
        add(`roof:${i},${z1},${f},S:${run}`, () => P.roofSlope({ roof, run }), cx, yT, wz(z1), 0);
        add(`roof:${i},${z0},${f},N:${run}`, () => P.roofSlope({ roof, run }), cx, yT, wz(z0), Math.PI);
        add(`ridge:${i},${rz},${f}:${run}`, () => P.ridgeCap({ roof, rise }), cx, yT, rz, 0);
      }
      if (f === maxF && spec.chimney != null && spec.chimney >= x0 && spec.chimney < x1)
        add(`chimney:${spec.chimney},${f}:${run}`, () => P.chimney(), wx(spec.chimney + 0.7), yT + rise - 0.5 * PITCH - 0.4, rz - 0.5);
      for (let j = z0; j < z1; j++) { endGable(x0, j, 'W', rz, run, rise, f, yT); endGable(x1 - 1, j, 'E', rz, run, rise, f, yT); }
    } else {
      const rx = wx((x0 + x1) / 2);
      for (let j = z0; j < z1; j++) {
        const cz = wz(j + 0.5);
        add(`roof:${x1},${j},${f},E:${run}`, () => P.roofSlope({ roof, run }), wx(x1), yT, cz, Math.PI / 2);
        add(`roof:${x0},${j},${f},W:${run}`, () => P.roofSlope({ roof, run }), wx(x0), yT, cz, -Math.PI / 2);
        add(`ridge:${rx},${j},${f}:${run}`, () => P.ridgeCap({ roof, rise }), rx, yT, cz, Math.PI / 2);
      }
      for (let i = x0; i < x1; i++) { endGable(i, z0, 'N', rx, run, rise, f, yT); endGable(i, z1 - 1, 'S', rx, run, rise, f, yT); }
    }
  };
  for (const f of floors) {
    const tops = new Set(spec.cells.filter(c => c[2] === f && !on(c[0], c[1], f + 1)).map(c => c[0] + ',' + c[1])), used = new Set();
    const free = (x, z) => tops.has(x + ',' + z) && !used.has(x + ',' + z);
    const sorted = [...tops].map(s => s.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [sx, sz] of sorted) {
      if (!free(sx, sz)) continue;
      let x1 = sx + 1; while (free(x1, sz)) x1++;
      let z1 = sz + 1;
      const rowFree = z => { for (let x = sx; x < x1; x++) if (!free(x, z)) return false; return true; };
      while (rowFree(z1)) z1++;
      for (let x = sx; x < x1; x++) for (let z = sz; z < z1; z++) used.add(x + ',' + z);
      roofBlock(sx, x1, sz, z1, f);
    }
  }

  for (const [x, z] of spec.porch || []) {
    const cx = wx(x + 0.5), cz = wz(z + 0.5), fz = wz(z + 1);
    add(`porch:${x},${z}`, () => P.porchDeck(), cx, 0, cz);
    add(`porchRoof:${x},${z}`, () => P.roofSlope({ roof: st.roof, run: CELL, rise: PORCH_RISE, overhang: 0.25 }), cx, PORCH_EAVE, fz, 0);
    for (const vx of [x, x + 1]) add(`porchPost:${vx},${z}`, () => P.porchPost(), wx(vx) + (vx === x ? 0.1 : -0.1), FOUND_H, fz - 0.1);
    if (spec.door && spec.door[0] === x && spec.door[1] === z - 1) add(`porchSteps:${x},${z}`, () => P.porchSteps(), cx, 0, fz);
    else add(`rail:${x},${z}`, () => P.fence(), cx, FOUND_H, fz - 0.15);
  }
  for (const [x, z] of spec.drive || []) add(`drive:${x},${z}`, () => P.driveway(), wx(x + 0.5), 0, wz(z + 0.5));
  // bike stand: one cell, entry from +z (the street side); spec.bikeStand = [x, z] or [x, z, slots]
  if (spec.bikeStand) { const [x, z, n = 2] = spec.bikeStand; add(`bikeStand:${x},${z}:${n}`, () => P.bikeStand({ slots: n }), wx(x + 0.5), 0, wz(z + 0.5)); }
  return out;
}

// ---- fixed growth path: each level is a full spec; the diff between levels is what animates ----
const LEVEL_STYLE = { plaster: PLASTER.butter, roof: ROOF.coral, shutters: true, shutterMat: ROOF.slate };
const L_MAIN32 = rect(0, 3, 0, 2, 0), L_UP = rect(0, 3, 0, 2, 1), L_WING = rect(2, 3, 2, 4, 0), L_PORCH = [[0, 2], [1, 2]];
const L_GAR = { cells: [[-1, 0], [-1, 1]], door: [-1, 1] }, L_GCELLS = rect(-1, 0, 0, 2, 0);
const LEVELS = [
  { name: 'Cottage', note: '2×2 cells, one floor, driveway', cells: rect(0, 2, 0, 2, 0) },
  { name: 'Longer', note: 'extends to 3×2 — roof grows along the ridge', cells: L_MAIN32 },
  { name: 'Porch', note: 'covered front porch with lean-to roof', cells: L_MAIN32, porch: L_PORCH },
  { name: 'Garage', note: 'attached 1×2 garage at the end of the driveway — the car can drive in', cells: [...L_GCELLS, ...L_MAIN32], porch: L_PORCH, garage: L_GAR },
  { name: 'Second floor', note: 'upper storey + chimney; garage keeps its own roof', cells: [...L_GCELLS, ...L_MAIN32, ...L_UP], porch: L_PORCH, garage: L_GAR, chimney: 1 },
  { name: 'Side wing', note: 'L-shape: 1×2 wing with its own gable roof', cells: [...L_GCELLS, ...L_MAIN32, ...L_UP, ...L_WING], porch: L_PORCH, garage: L_GAR, chimney: 1 },
  { name: 'Deeper', note: 'back row added — 3 deep, taller roof at same pitch', cells: [...L_GCELLS, ...rect(0, 3, -1, 2, 0), ...rect(0, 3, -1, 2, 1), ...L_WING], porch: L_PORCH, garage: L_GAR, chimney: 1 },
].map(L => ({ door: [0, 1], style: LEVEL_STYLE, seed: 11, porch: [], chimney: null, garage: null, drive: [[-1, 2], [-1, 3], [-1, 4]], bikeStand: [3, 1], ...L }));

function house(seed) {
  const r = rng(seed), g = grp('house_' + seed);
  const nx = 2 + Math.floor(r() * 3), nz = 2 + (r() < 0.3 ? 1 : 0), floors = 1 + (r() < 0.55 ? 1 : 0);
  const W = nx * CELL, D = nz * CELL;
  const style = { plaster: pick(r, PLASTER), roof: pick(r, ROOF), shutters: r() < 0.6 };
  style.shutterMat = r() < 0.5 ? wood : pick(r, ROOF);
  const doorCell = Math.floor(r() * nx), hasPorch = r() < 0.35;
  const place = (p, x, y, z, ry = 0) => { p.position.set(x, y, z); p.rotation.y = ry; g.add(p); return p; };
  const cells = []; for (let f = 0; f < floors; f++) cells.push(...rect(0, nx, 0, nz, f));
  const spec = { cells, door: [doorCell, nz - 1], style, seed, chimney: r() < 0.7 ? Math.floor(r() * nx) : null, porch: hasPorch ? [[doorCell, nz]] : [] };
  for (const p of buildPlan(spec, -W / 2, -D / 2)) place(p.make(), p.x, p.y, p.z, p.ry);

  // front yard
  const fz = D / 2 + 2.6;
  for (let i = 0; i < nx; i++) if (i !== doorCell) {
    place(P.fence(), -W / 2 + CELL / 2 + i * CELL, 0, fz);
    if (r() < 0.7) place(P.shrub(), -W / 2 + CELL / 2 + i * CELL + (r() - 0.5), 0, D / 2 + 0.7);
  }
  // residents by the front door
  const dx = -W / 2 + CELL / 2 + doorCell * CELL, n = 1 + (r() < 0.6 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const sp = SPECIES[Math.floor(r() * SPECIES.length)];
    const res = resident(sp, { outfit: pick(r, CLOTH), scarf: pick(r, CLOTH) });
    setAction(res, r() < 0.5 ? 'wave' : 'stand');
    place(res, dx + (n === 1 ? 0.2 : (k ? 0.55 : -0.55)), hasPorch ? FOUND_H : 0, D / 2 + (hasPorch ? 1.0 : 1.45), (r() - 0.5) * 0.8);
  }
  // vehicles: car in the side driveway (sometimes driven), bike parked on the other side
  if (r() < 0.75) {
    const car = P.car({ paint: pick(r, PAINT) });
    if (r() < 0.5) board(car, resident(SPECIES[Math.floor(r() * 5)], { outfit: pick(r, CLOTH), scarf: pick(r, CLOTH) }));
    place(car, W / 2 + 1.5, 0, D / 2 - 0.6, 0);
    for (let k = -1; k < 3; k++) place(P.driveway(), W / 2 + 1.5, 0, D / 2 - 0.6 + k * CELL);
  }
  // bike stand beside the house, usually with a bike parked in it
  if (r() < 0.7) {
    const st = place(P.bikeStand(), -W / 2 - 1.2, 0, D / 2 - 0.4);
    const nb = r() < 0.75 ? 1 + (r() < 0.4 ? 1 : 0) : 0;
    for (let k = 0; k < nb; k++) parkBike(st, P.bicycle({ paint: pick(r, PAINT) }), k);
  } else if (r() < 0.5) place(P.wagon({ paint: pick(r, PAINT) }), -W / 2 - 1.0, 0, D / 2 + 0.4, 0.4);
  // back garden farm with a worker
  const newRes = () => resident(SPECIES[Math.floor(r() * 5)], { outfit: pick(r, CLOTH), scarf: pick(r, CLOTH) });
  if (r() < 0.7) {
    const type = CROPS[Math.floor(r() * CROPS.length)], n = Math.min(nx, 1 + Math.floor(r() * 3));
    for (let k = 0; k < n; k++) place(P.farmPlot({ type, stage: 'mixed', seed: seed + k }), -W / 2 + CELL / 2 + k * (CELL + 0.2), 0, -D / 2 - 2.5);
    place(setAction(newRes(), r() < 0.6 ? 'work' : 'water'), -W / 2 + CELL / 2, 0, -D / 2 - 0.9, Math.PI);
    if (r() < 0.5) place(P.scarecrow(), -W / 2 + CELL / 2 + n * (CELL + 0.2) - 0.4, 0, -D / 2 - 2.5, 0.3);
  }
  // roadside stall
  if (r() < 0.45) {
    const goods = [0, 1, 2].map(() => CROPS[Math.floor(r() * CROPS.length)]);
    place(P.marketStall({ awning: pick(r, ROOF), panel: pick(r, PLASTER), goods }), -W / 2 - 3.4, 0, D / 2 + 1.4);
    place(setAction(newRes(), 'sell'), -W / 2 - 3.4, 0, D / 2 + 0.6);
  }
  return g;
}


export { PITCH, PORCH_RISE, PORCH_EAVE, PORCH_H, SIDES, buildPlan, LEVELS, LEVEL_STYLE, house };
