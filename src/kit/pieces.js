// Building, vehicle, driveway and farm pieces. Populates P.
import { THREE, rng, blush, CLOTH, CELL, WALL_H, T, FOUND_H, RISE, M, PLASTER, ROOF, trim, wood, glass, stone, leaf, dark, box, grp, onEdge, P, ico, cone, PAINT, tire, lamp } from './shared.js';

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

function wheel(name, r, w, x, y, z) {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 8), tire); t.name = 'tire'; t.rotation.z = Math.PI / 2;
  const h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 6), trim); h.name = 'hub'; h.rotation.z = Math.PI / 2;
  const g = grp(name, t, h); g.position.set(x, y, z); return g;
}
function bar(name, a, b, t, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, A.distanceTo(B)), mat);
  m.name = name; m.position.copy(A).lerp(B, 0.5); m.lookAt(B); return m;
}
function riderAnchor(pose, x, y, z) { const o = new THREE.Object3D(); o.name = 'rider'; o.userData.pose = pose; o.position.set(x, y, z); return o; }

P.car = ({ paint = PAINT.peach } = {}) => {
  const g = grp('car');
  for (const x of [-0.62, 0.62]) for (const z of [-0.78, 0.8]) g.add(wheel('wheel', 0.28, 0.22, x, 0.28, z));
  g.add(box('chassis', 1.2, 0.14, 2.3, paint, 0, 0.36, 0));
  g.add(box('hood', 1.24, 0.42, 0.78, paint, 0, 0.62, 0.78));
  g.add(box('trunk', 1.24, 0.46, 0.56, paint, 0, 0.64, -0.88));
  for (const s of [-1, 1]) {
    g.add(box('door_side', 0.1, 0.38, 1.02, paint, s * 0.57, 0.6, -0.09));
    g.add(box('fender_front', 0.2, 0.1, 0.72, paint, s * 0.6, 0.84, 0.8));
    g.add(box('fender_rear', 0.2, 0.1, 0.62, paint, s * 0.6, 0.88, -0.86));
    g.add(ico('headlight', 0.1, lamp, s * 0.4, 0.66, 1.17));
    g.add(box('taillight', 0.18, 0.1, 0.04, blush, s * 0.42, 0.72, -1.17));
  }
  g.add(box('bumper_front', 1.3, 0.12, 0.12, trim, 0, 0.42, 1.2));
  g.add(box('bumper_rear', 1.3, 0.12, 0.12, trim, 0, 0.42, -1.2));
  g.add(box('grille', 0.5, 0.14, 0.03, trim, 0, 0.56, 1.18));
  g.add(box('seat_bench', 0.9, 0.14, 0.44, trim, 0, 0.5, -0.3));
  g.add(box('seat_back', 0.9, 0.5, 0.12, trim, 0, 0.78, -0.56));
  const ws = grp('windshield', box('windshield_glass', 1.04, 0.34, 0.04, glass, 0, 0.17, 0), box('windshield_frame', 1.12, 0.05, 0.07, trim, 0, 0.35, 0));
  ws.position.set(0, 0.83, 0.42); ws.rotation.x = -0.35; g.add(ws);
  g.add(bar('steering_column', [0, 0.72, 0.36], [0, 0.86, 0.14], 0.05, dark));
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 4, 10), dark);
  sw.name = 'steering_wheel'; sw.position.set(0, 0.87, 0.12); sw.rotation.x = -0.5; g.add(sw);
  g.add(box('roof_rack', 0.9, 0.05, 0.4, wood, 0, 0.89, -0.88));
  g.add(box('suitcase', 0.5, 0.26, 0.3, PAINT.butter, 0.05, 1.04, -0.88));
  g.add(riderAnchor('sit', 0, 0.29, -0.2));
  return g;
};

P.bicycle = ({ paint = PAINT.mint } = {}) => {
  const g = grp('bicycle'), r = 0.24;
  for (const z of [-0.42, 0.42]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 4, 12), tire);
    w.name = 'wheel'; w.position.set(0, r, z); w.rotation.y = Math.PI / 2; g.add(w);
    g.add(ico('hub', 0.04, trim, 0, r, z));
  }
  const BB = [0, r, 0], SEAT = [0, 0.54, -0.16], HEAD = [0, 0.58, 0.3], BAR = [0, 0.84, 0.2];
  g.add(bar('down_tube', BB, HEAD, 0.05, paint));
  g.add(bar('seat_tube', BB, SEAT, 0.05, paint));
  g.add(bar('top_tube', SEAT, HEAD, 0.05, paint));
  g.add(bar('chain_stay', BB, [0, r, -0.42], 0.04, paint));
  g.add(bar('seat_stay', SEAT, [0, r, -0.42], 0.04, paint));
  g.add(bar('fork', HEAD, [0, r, 0.42], 0.045, paint));
  g.add(bar('stem', HEAD, BAR, 0.045, trim));
  g.add(box('handlebar', 0.56, 0.04, 0.04, trim, 0, 0.84, 0.2));
  for (const s of [-1, 1]) g.add(box('grip', 0.08, 0.06, 0.06, blush, s * 0.28, 0.84, 0.2));
  g.add(box('saddle', 0.16, 0.06, 0.26, wood, 0, 0.58, -0.17));
  g.add(box('pedal_crank', 0.3, 0.03, 0.05, dark, 0, r, 0));
  g.add(box('basket', 0.34, 0.2, 0.26, wood, 0, 0.66, 0.5));
  g.add(box('basket_rim', 0.38, 0.03, 0.3, trim, 0, 0.77, 0.5));
  g.add(ico('basket_flowers', 0.1, blush, 0, 0.8, 0.5));
  g.add(riderAnchor('ride', 0, 0.33, -0.12));
  return g;
};

P.wagon = ({ paint = PAINT.sky } = {}) => {
  const g = grp('wagon');
  for (const x of [-0.38, 0.38]) for (const z of [-0.34, 0.34]) g.add(wheel('wheel', 0.15, 0.1, x, 0.15, z));
  g.add(box('tub_floor', 0.7, 0.06, 1.0, paint, 0, 0.3, 0));
  for (const s of [-1, 1]) {
    g.add(box('tub_side', 0.05, 0.26, 1.0, paint, s * 0.35, 0.44, 0));
    g.add(box('tub_end', 0.7, 0.26, 0.05, paint, 0, 0.44, s * 0.5));
  }
  g.add(box('crate', 0.4, 0.26, 0.4, wood, 0.05, 0.46, 0.2));
  for (let i = 0; i < 3; i++) g.add(ico('produce', 0.08, [blush, leaf, lamp][i], -0.08 + i * 0.1, 0.62, 0.18 + (i % 2) * 0.06));
  g.add(ico('parcel_shrub', 0.16, leaf, -0.12, 0.44, -0.24));
  g.add(bar('handle_bar', [0, 0.46, -0.5], [0, 0.6, -0.78], 0.04, trim));
  g.add(box('handle_grip', 0.5, 0.05, 0.05, trim, 0, 0.6, -0.78));
  g.add(riderAnchor('push', 0, 0, -1.08));
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

// ---- farm + market ----
const soil = M('soil', '#c9aa90', 0.95), soilDark = M('soil_furrow', '#b3947c', 0.95), metal = M('metal', '#c3c9ce', 0.4, 0.3),
      carrotM = M('veg_carrot', '#f4a468', 0.7), tomatoM = M('veg_tomato', '#ee8c84', 0.6), wheatM = M('veg_wheat', '#efd592', 0.8),
      pumpkinM = M('veg_pumpkin', '#f5b36c', 0.7), leafDark = M('foliage_dark', '#94c48b', 0.9), chalk = M('chalkboard', '#6f7d76', 0.9);
const CROPS = ['carrot', 'cabbage', 'wheat', 'pumpkin', 'tomato'];

function produce(type) {
  const g = grp('produce_' + type);
  if (type === 'carrot') {
    const c = cone('carrot_root', 0.055, 0.24, 5, carrotM, 0, 0.12, 0); c.rotation.x = Math.PI; g.add(c);
    for (let i = 0; i < 3; i++) { const l = cone('carrot_leaf', 0.03, 0.14, 3, leaf, (i - 1) * 0.03, 0.29, 0); l.rotation.z = (i - 1) * 0.4; g.add(l); }
  } else if (type === 'tomato') {
    const t = ico('tomato', 0.075, tomatoM, 0, 0.07, 0); t.scale.y = 0.85; g.add(t);
    g.add(cone('tomato_stem', 0.035, 0.04, 5, leafDark, 0, 0.145, 0));
  } else if (type === 'cabbage') {
    g.add(ico('cabbage_outer', 0.12, leafDark, 0, 0.1, 0));
    g.add(ico('cabbage_heart', 0.1, leaf, 0, 0.14, 0));
  } else if (type === 'pumpkin') {
    const p = ico('pumpkin', 0.17, pumpkinM, 0, 0.12, 0, 1); p.scale.y = 0.7; g.add(p);
    g.add(box('pumpkin_stem', 0.04, 0.08, 0.04, wood, 0, 0.26, 0));
  } else if (type === 'wheat') {
    for (let i = 0; i < 6; i++) { const s = box('wheat_stalk', 0.025, 0.42, 0.025, wheatM, 0, 0.21, 0); s.rotation.set((i % 2 - 0.5) * 0.25, 0, (i - 2.5) * 0.08); g.add(s); }
    g.add(box('wheat_tie', 0.1, 0.04, 0.1, wood, 0, 0.16, 0));
  }
  return g;
}

// stage 0 sprout, 1 growing, 2 ripe
function crop(type, stage = 2) {
  const g = grp('crop_' + type + '_s' + stage);
  if (stage === 0) {
    for (const s of [-1, 1]) { const l = cone('sprout_leaf', 0.035, 0.12, 3, leaf, s * 0.03, 0.06, 0); l.rotation.z = -s * 0.5; g.add(l); }
    if (type === 'tomato') g.add(box('stake', 0.03, 0.8, 0.03, wood, 0.08, 0.4, 0));
    return g;
  }
  const ripe = stage === 2;
  if (type === 'carrot') {
    const n = ripe ? 5 : 3, h = ripe ? 0.32 : 0.2;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, l = cone('carrot_leaf', 0.04, h, 3, leaf, Math.cos(a) * 0.03, h / 2, Math.sin(a) * 0.03); l.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(l); }
    if (ripe) g.add(ico('carrot_top', 0.055, carrotM, 0, 0.01, 0));
  } else if (type === 'cabbage') {
    const o = ico('cabbage_leaves', ripe ? 0.2 : 0.12, leafDark, 0, 0.03, 0); o.scale.y = 0.45; g.add(o);
    if (ripe) { const c = produce('cabbage'); c.scale.setScalar(1.25); g.add(c); }
  } else if (type === 'wheat') {
    const n = ripe ? 7 : 5, h = ripe ? 0.62 : 0.34, m = ripe ? wheatM : leaf;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = Math.cos(a) * 0.06, z = Math.sin(a) * 0.06;
      g.add(box('wheat_stalk', 0.025, h, 0.025, m, x, h / 2, z));
      if (ripe) g.add(box('wheat_head', 0.045, 0.14, 0.045, wheatM, x, h + 0.06, z));
    }
  } else if (type === 'pumpkin') {
    for (let i = 0; i < 3; i++) { const l = ico('pumpkin_leaf', ripe ? 0.14 : 0.1, leaf, (i - 1) * 0.14, 0.04, (i % 2) * 0.1 - 0.05); l.scale.y = 0.4; g.add(l); }
    if (ripe) { const p = produce('pumpkin'); p.position.z = 0.08; g.add(p); }
  } else if (type === 'tomato') {
    g.add(box('stake', 0.03, 0.8, 0.03, wood, 0.08, 0.4, 0));
    const n = ripe ? 4 : 2;
    for (let i = 0; i < n; i++) g.add(ico('tomato_leaves', 0.11, leaf, (i % 2 ? 0.05 : -0.04), 0.14 + i * 0.13, 0));
    if (ripe) [[0.09, 0.22, 0.07], [-0.1, 0.36, 0.05], [0.06, 0.5, 0.08]].forEach(([x, y, z]) => { const t = produce('tomato'); t.position.set(x, y - 0.07, z); g.add(t); });
  }
  return g;
}

// 1 cell plot, 3 furrows x 4 crops. stage: 0|1|2|'mixed'
P.farmPlot = ({ type = 'carrot', stage = 2, seed = 1 } = {}) => {
  const g = grp('farmPlot_' + type), r = rng(seed);
  g.add(box('plot_soil', CELL, 0.1, CELL, soil, 0, 0.05, 0));
  for (const s of [-1, 1]) {
    g.add(box('plot_border', CELL, 0.14, 0.08, wood, 0, 0.07, s * (CELL / 2 - 0.04)));
    g.add(box('plot_border', 0.08, 0.14, CELL - 0.16, wood, s * (CELL / 2 - 0.04), 0.07, 0));
  }
  for (const z of [-0.55, 0, 0.55]) {
    g.add(box('plot_furrow', CELL - 0.3, 0.08, 0.32, soilDark, 0, 0.14, z));
    for (const x of [-0.6, -0.2, 0.2, 0.6]) {
      const st = stage === 'mixed' ? Math.floor(r() * 3) : stage;
      const c = crop(type, st); c.position.set(x + (r() - 0.5) * 0.06, 0.18, z); c.rotation.y = r() * 6.28; g.add(c);
    }
  }
  return g;
};
for (const t of CROPS) P['crop_' + t] = () => grp('crop_' + t + '_stages', ...[0, 1, 2].map(s => { const c = crop(t, s); c.position.x = (s - 1) * 0.6; return c; }));

P.crate = ({ type = 'carrot', w = 0.56, d = 0.4 } = {}) => {
  const g = grp('crate_' + type), h = 0.22;
  g.add(box('crate_base', w, 0.04, d, wood, 0, 0.02, 0));
  for (const s of [-1, 1]) {
    g.add(box('crate_side', 0.04, h, d, wood, s * (w / 2 - 0.02), h / 2, 0));
    g.add(box('crate_end', w - 0.08, h, 0.04, wood, 0, h / 2, s * (d / 2 - 0.02)));
  }
  const big = type === 'pumpkin' || type === 'cabbage', step = big ? 0.26 : 0.15;
  const nx = Math.max(1, Math.floor((w - 0.06) / step)), nz = Math.max(1, Math.floor((d - 0.06) / step));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const p = produce(type), x = (i - (nx - 1) / 2) * step, z = (j - (nz - 1) / 2) * step;
    if (type === 'carrot' || type === 'wheat') { p.rotation.set(Math.PI / 2, 0, 0.3 * (i - j)); p.position.set(x, h - 0.02, z + 0.1); }
    else { p.position.set(x, h - (big ? 0.14 : 0.08), z); p.rotation.y = i + j; }
    if (big) p.scale.setScalar(0.8);
    g.add(p);
  }
  return g;
};

P.marketStall = ({ awning = ROOF.coral, panel = PLASTER.butter, goods = ['carrot', 'tomato', 'cabbage'] } = {}) => {
  const g = grp('marketStall'), W = 2.4, D = 1.0, CH = 0.9;
  g.add(box('counter_top', W, 0.08, D, wood, 0, CH, 0));
  g.add(box('counter_front', W - 0.12, CH - 0.08, 0.06, panel, 0, (CH - 0.08) / 2, D / 2 - 0.03));
  for (const s of [-1, 1]) g.add(box('counter_side', 0.06, CH - 0.08, D, panel, s * (W / 2 - 0.03), (CH - 0.08) / 2, 0));
  const sign = grp('price_sign', box('sign_frame', 0.8, 0.4, 0.03, trim, 0, 0, 0), box('sign_board', 0.7, 0.3, 0.02, chalk, 0, 0, 0.02));
  sign.position.set(0, 0.46, D / 2 + 0.01); g.add(sign);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const h = sz > 0 ? 2.0 : 2.3;
    g.add(box('stall_post', 0.08, h, 0.08, trim, sx * (W / 2 - 0.05), h / 2, sz * (D / 2 - 0.05)));
  }
  const dz = D + 0.45, dy = 0.35, len = Math.hypot(dz, dy), a = grp('awning');
  a.position.set(0, 2.33, -D / 2 - 0.1); a.rotation.x = Math.atan2(dy, dz);
  for (let i = 0; i < 6; i++) a.add(box('awning_stripe', W / 6 + 0.001, 0.05, len, i % 2 ? trim : awning, -W / 2 + W / 12 + i * W / 6, 0, len / 2));
  for (let i = 0; i < 6; i++) a.add(box('awning_valance', W / 6 - 0.02, 0.16, 0.03, i % 2 ? trim : awning, -W / 2 + W / 12 + i * W / 6, -0.08, len));
  g.add(a);
  goods.forEach((t, i) => { const c = P.crate({ type: t, w: 0.62, d: 0.5 }); c.position.set((i - (goods.length - 1) / 2) * 0.74, CH + 0.04, 0.12); c.rotation.x = 0.12; g.add(c); });
  return g;
};

P.scarecrow = () => {
  const g = grp('scarecrow');
  g.add(box('scarecrow_post', 0.08, 1.6, 0.08, wood, 0, 0.8, 0));
  g.add(box('scarecrow_arms', 1.0, 0.07, 0.07, wood, 0, 1.2, 0));
  g.add(box('scarecrow_shirt', 0.46, 0.5, 0.2, CLOTH.blue, 0, 1.1, 0));
  g.add(box('scarecrow_patch', 0.12, 0.12, 0.02, CLOTH.pink, 0.1, 1.02, 0.11));
  g.add(ico('scarecrow_head', 0.17, wheatM, 0, 1.52, 0));
  const hat = grp('scarecrow_hat', new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 8), wood), cone('hat_crown', 0.15, 0.2, 6, wood, 0, 0.1, 0));
  hat.children[0].name = 'hat_brim'; hat.position.y = 1.66; hat.rotation.z = 0.12; g.add(hat);
  for (const s of [-1, 1]) g.add(cone('straw', 0.05, 0.14, 4, wheatM, s * 0.55, 1.2, 0));
  return g;
};

export { CROPS, produce, crop, PITCH, PORCH_RISE, PORCH_EAVE, bar, wheel, riderAnchor, soil, metal, chalk };
