// Pastel House Kit — procedural low-poly building, character and prop kit for three.js.
// Single ES module. Everything is generated from code: no external assets.
// Conventions (see README): 1 unit = 1 m, +Y up, +Z = "front/outside", pieces pivot at their ground/edge anchor.
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

// ---- pieces ----
const P = {};
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

// ---- residents (pivot = between feet, facing +z, ~1.4 m tall) ----
const FUR = { bunny: M('fur_bunny', '#f8f3ec'), bear: M('fur_bear', '#d9b28e'), cat: M('fur_cat', '#bcb3c9'),
              fox: M('fur_fox', '#f2a97c'), frog: M('fur_frog', '#b6dca2') };
const CLOTH = { blue: M('cloth_blue', '#a9c4e8'), pink: M('cloth_pink', '#f3b3c1'), yellow: M('cloth_yellow', '#f2d98c'),
                lilac: M('cloth_lilac', '#c9b3e0'), mint: M('cloth_mint', '#a8d8c0') };
const cream = M('fur_cream', '#fbf3e6'), blush = M('blush_pink', '#f4b3b3'), eyeMat = M('eye_dark', '#3a3230', 0.4);
function ico(name, r, mat, x = 0, y = 0, z = 0, detail = 0) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat);
  m.name = name; m.position.set(x, y, z); return m;
}
function cone(name, r, h, seg, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
  m.name = name; m.position.set(x, y, z); return m;
}
// poses: stand | sit (car) | ride (bike) | push (wagon). Hip pivot at y 0.28, shoulder at y 0.7
const POSES = { stand: [0, 0, 0.28], sit: [-1.5, -1.0, 0.08], ride: [-0.9, -1.2, 0.08], push: [0, -1.2, 0.08] };
function setPose(res, pose) {
  const [leg, armX, armZ] = POSES[pose];
  for (const s of ['l', 'r']) {
    const sign = s === 'l' ? -1 : 1;
    res.getObjectByName('leg_' + s).rotation.x = leg;
    const a = res.getObjectByName('arm_' + s); a.rotation.x = armX; a.rotation.z = sign * armZ;
  }
  res.userData.pose = pose; return res;
}
let actors = [];
function resident(species, { outfit = CLOTH.blue, scarf = CLOTH.yellow, pose = 'stand' } = {}) {
  const fur = FUR[species], g = grp('rig');
  for (const s of [-1, 1]) {
    const leg = grp('leg_' + (s < 0 ? 'l' : 'r'), box('leg', 0.15, 0.28, 0.17, fur, 0, -0.14, 0), box('foot', 0.17, 0.08, 0.24, fur, 0, -0.24, 0.03));
    leg.position.set(s * 0.11, 0.28, 0); g.add(leg);
    const arm = grp('arm_' + (s < 0 ? 'l' : 'r'), box('arm', 0.11, 0.32, 0.11, fur, 0, -0.15, 0), ico('hand', 0.075, fur, 0, -0.32, 0));
    arm.position.set(s * 0.25, 0.7, 0); arm.rotation.z = s * 0.28; g.add(arm);
  }
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.46, 7), outfit);
  body.name = 'body_outfit'; body.position.y = 0.51; g.add(body);
  g.add(box('pocket', 0.14, 0.1, 0.03, scarf, 0, 0.45, 0.245));
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.055, 4, 8), scarf);
  collar.name = 'scarf'; collar.rotation.x = Math.PI / 2; collar.position.y = 0.76; g.add(collar);

  const head = grp('head');
  head.position.y = 1.05; g.add(head);
  const skull = ico('head_fur', 0.3, fur, 0, 0, 0, 1); skull.scale.set(1, 0.92, 0.95); head.add(skull);
  for (const s of [-1, 1]) {
    const c = ico('cheek', 0.055, blush, s * 0.19, -0.06, 0.21); c.scale.set(1, 0.7, 0.4); head.add(c);
  }
  if (species === 'frog') {
    for (const s of [-1, 1]) {
      head.add(ico('eye_bulb', 0.11, fur, s * 0.13, 0.22, 0.1));
      head.add(ico('eye', 0.055, eyeMat, s * 0.13, 0.24, 0.19));
      head.add(ico('eye_shine', 0.018, trim, s * 0.12, 0.27, 0.235));
    }
    head.add(box('mouth', 0.22, 0.025, 0.02, eyeMat, 0, -0.07, 0.27));
  } else {
    for (const s of [-1, 1]) {
      head.add(ico('eye', 0.045, eyeMat, s * 0.11, 0.03, 0.26));
      head.add(ico('eye_shine', 0.015, trim, s * 0.1, 0.05, 0.3));
    }
    const muzzle = ico('muzzle', 0.12, cream, 0, -0.08, 0.23);
    muzzle.scale.set(1.15, 0.8, species === 'fox' ? 1.3 : 0.7); head.add(muzzle);
    head.add(box('nose', 0.07, 0.045, 0.04, eyeMat, 0, -0.04, species === 'fox' ? 0.37 : 0.32));
  }
  for (const s of [-1, 1]) {
    if (species === 'bunny') {
      const ear = grp('ear', box('ear_fur', 0.12, 0.42, 0.07, fur, 0, 0.2, 0), box('ear_inner', 0.07, 0.32, 0.02, blush, 0, 0.2, 0.04));
      ear.position.set(s * 0.1, 0.22, 0); ear.rotation.z = -s * 0.14; head.add(ear);
    } else if (species === 'bear') {
      head.add(ico('ear_fur', 0.1, fur, s * 0.2, 0.21, 0));
      head.add(ico('ear_inner', 0.055, blush, s * 0.2, 0.21, 0.06));
    } else if (species === 'cat' || species === 'fox') {
      const big = species === 'fox';
      const e = cone('ear_fur', big ? 0.12 : 0.1, big ? 0.3 : 0.22, 4, fur, s * 0.16, big ? 0.3 : 0.27, 0);
      e.rotation.set(0, Math.PI / 4, -s * 0.22); head.add(e);
    }
  }
  if (species === 'bunny') g.add(ico('tail', 0.1, cream, 0, 0.36, -0.26));
  if (species === 'bear') g.add(ico('tail', 0.07, fur, 0, 0.36, -0.26));
  if (species === 'cat') {
    const t = grp('tail', box('tail_fur', 0.07, 0.48, 0.07, fur, 0, 0.24, 0));
    t.position.set(0, 0.34, -0.22); t.rotation.x = -0.8; g.add(t);
  }
  if (species === 'fox') {
    const t = grp('tail', cone('tail_fur', 0.13, 0.5, 5, fur, 0, 0.25, 0), cone('tail_tip', 0.055, 0.1, 5, cream, 0, 0.47, 0));
    t.position.set(0, 0.34, -0.22); t.rotation.x = -1.15; g.add(t);
  }
  const root = grp('resident_' + species, g);
  root.userData.parts = { rig: g, head, legL: g.getObjectByName('leg_l'), legR: g.getObjectByName('leg_r'),
    armL: g.getObjectByName('arm_l'), armR: g.getObjectByName('arm_r'), prop: null };
  root.userData.phase = Math.random() * 10;
  actors.push(root);
  return setAction(root, pose);
}
const SPECIES = ['bunny', 'bear', 'cat', 'fox', 'frog'];
const RES_DEFAULT = { bunny: ['pink', 'mint'], bear: ['blue', 'yellow'], cat: ['lilac', 'pink'], fox: ['mint', 'yellow'], frog: ['yellow', 'blue'] };
for (const sp of SPECIES) P[sp] = () => resident(sp, { outfit: CLOTH[RES_DEFAULT[sp][0]], scarf: CLOTH[RES_DEFAULT[sp][1]] });

// ---- vehicles (pivot = ground centre, facing +z). Each has an empty named 'rider' = resident origin + pose ----
const PAINT = { peach: M('paint_peach', '#f6b89a', 0.5), sky: M('paint_sky', '#9fc3ea', 0.5), mint: M('paint_mint', '#a6dcc4', 0.5), butter: M('paint_butter', '#f3d98a', 0.5) };
const tire = M('tire', '#5f5956', 0.95), lamp = M('lamp', '#fff4c9', 0.3);
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

// put a resident on a vehicle: parents it to the 'rider' anchor and applies the anchor's pose
function board(vehicle, res) {
  const a = vehicle.getObjectByName('rider');
  setAction(res, a.userData.pose); a.add(res); return vehicle;
}
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

function makeHoe() {
  return grp('hoe', box('hoe_handle', 0.045, 0.045, 1.15, wood, 0, 0, 0.3),
    box('hoe_neck', 0.04, 0.06, 0.06, metal, 0, -0.01, 0.86), box('hoe_blade', 0.24, 0.2, 0.035, metal, 0, -0.1, 0.88));
}
function makeCan(paint = PAINT.sky) {
  const g = grp('wateringCan');
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 7), paint); b.name = 'can_body'; b.position.y = -0.17; g.add(b);
  g.add(bar('can_spout', [0, -0.22, 0.1], [0, -0.05, 0.34], 0.035, paint));
  g.add(box('can_rose', 0.08, 0.08, 0.03, trim, 0, -0.04, 0.35));
  g.add(box('can_handle', 0.04, 0.04, 0.22, paint, 0, 0, -0.01));
  for (const z of [-0.1, 0.08]) g.add(box('can_handle_post', 0.04, 0.08, 0.04, paint, 0, -0.04, z));
  return g;
}
P.hoe = makeHoe; P.wateringCan = () => makeCan();

// ---- actions (setPose is the static layer; setAction adds props + per-frame animation) ----
const ACTIONS = { stand: 'Stand', walk: 'Walk', wave: 'Wave', carry: 'Carry crate', work: 'Farm (hoe)', water: 'Water crops',
                  sell: 'Sell at stall', sit: 'Sit · car', ride: 'Ride · bike', push: 'Push · wagon' };
function setAction(res, action) {
  const p = res.userData.parts;
  if (p.prop) { p.prop.removeFromParent(); p.prop = null; }
  setPose(res, { sit: 'sit', ride: 'ride', push: 'push' }[action] || 'stand');
  p.head.rotation.set(0, 0, 0); p.rig.position.y = 0;
  if (action === 'carry') {
    p.armL.rotation.set(-1.15, 0, 0.12); p.armR.rotation.set(-1.15, 0, -0.12);
    p.prop = P.crate({ type: 'tomato', w: 0.44, d: 0.3 }); p.prop.position.set(0, 0.48, 0.42); p.rig.add(p.prop);
  } else if (action === 'work') {
    p.prop = makeHoe(); p.prop.position.set(0, -0.32, 0); p.prop.rotation.x = 0.6; p.armR.add(p.prop);
  } else if (action === 'water') {
    p.prop = makeCan(); p.prop.position.set(0, -0.34, 0.02); p.armR.add(p.prop);
  }
  res.userData.action = action; return res;
}
const ease = x => x * x * (3 - 2 * x);
function animate(res, t) {
  const { rig, head, legL, legR, armL, armR, prop } = res.userData.parts, a = res.userData.action;
  rig.position.y = 0; head.rotation.set(0, 0, 0);
  if (a === 'stand') {
    const b = Math.sin(t * 2);
    head.rotation.z = Math.sin(t * 0.9) * 0.07; rig.position.y = b * 0.006;
    armL.rotation.z = -0.28 - b * 0.04; armR.rotation.z = 0.28 + b * 0.04;
  } else if (a === 'walk' || a === 'carry' || a === 'push') {
    const k = a === 'push' ? 5.5 : 7.5, amp = a === 'push' ? 0.45 : 0.6, s = Math.sin(t * k);
    legL.rotation.x = s * amp; legR.rotation.x = -s * amp;
    rig.position.y = Math.abs(Math.cos(t * k)) * 0.045;
    head.rotation.z = s * 0.05;
    if (a === 'walk') { armL.rotation.x = -s * 0.55; armR.rotation.x = s * 0.55; }
  } else if (a === 'wave') {
    armR.rotation.x = 0; armR.rotation.z = 2.5 + Math.sin(t * 9) * 0.35;
    head.rotation.z = 0.12; rig.position.y = Math.abs(Math.sin(t * 4.5)) * 0.02;
  } else if (a === 'sell') {
    const c = (t * 0.5) % 1, waving = c < 0.4;
    armR.rotation.x = 0; armR.rotation.z = waving ? 2.4 + Math.sin(t * 10) * 0.3 : 0.28;
    armL.rotation.x = waving ? 0 : -1.0 + Math.sin(t * 3) * 0.15;
    head.rotation.y = Math.sin(t * 1.1) * 0.35; rig.position.y = Math.abs(Math.sin(t * 3)) * 0.015;
  } else if (a === 'work') {
    const ph = (t * 0.9) % 1;
    const ang = ph < 0.7 ? -0.3 - 2.3 * ease(ph / 0.7) : -2.6 + 2.3 * ease((ph - 0.7) / 0.3);
    armL.rotation.x = armR.rotation.x = ang; armL.rotation.z = 0.25; armR.rotation.z = -0.25;
    head.rotation.x = ang < -1.5 ? -0.12 : 0.15;
    rig.position.y = ph < 0.7 ? 0.03 * ease(ph / 0.7) : 0;
  } else if (a === 'water') {
    armR.rotation.x = -1.0; armR.rotation.z = 0.1;
    if (prop) prop.rotation.x = 1.0 + 0.35 + Math.sin(t * 2) * 0.15;
    head.rotation.x = 0.2; head.rotation.z = Math.sin(t) * 0.05;
  } else if (a === 'sit') {
    head.rotation.y = Math.sin(t * 0.7) * 0.3; head.rotation.z = Math.sin(t * 1.3) * 0.05;
    rig.position.y = Math.abs(Math.sin(t * 6)) * 0.008;
  } else if (a === 'ride') {
    const s = Math.sin(t * 6);
    legL.rotation.x = -0.9 + s * 0.45; legR.rotation.x = -0.9 - s * 0.45;
    rig.position.y = Math.abs(s) * 0.01; head.rotation.z = s * 0.03;
  }
}

// demo scene per action: resident + the thing it interacts with
function actorScene(sp, action) {
  const res = resident(sp, { outfit: CLOTH[RES_DEFAULT[sp][0]], scarf: CLOTH[RES_DEFAULT[sp][1]] });
  const vehicle = { sit: 'car', ride: 'bicycle', push: 'wagon' }[action];
  if (vehicle) return board(P[vehicle](), res);
  const g = grp('scene_' + action, res);
  setAction(res, action);
  if (action === 'work' || action === 'water') {
    g.add(P.farmPlot({ type: action === 'work' ? 'carrot' : 'cabbage', stage: action === 'work' ? 0 : 1, seed: 4 }));
    res.position.z = CELL / 2 + 0.6; res.rotation.y = Math.PI;
  } else if (action === 'sell') {
    g.add(P.marketStall()); res.position.z = -0.8;
  }
  return g;
}

const withRider = (k, sp) => board(P[k](), resident(sp, { outfit: CLOTH[RES_DEFAULT[sp][0]], scarf: CLOTH[RES_DEFAULT[sp][1]] }));


function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (r, o) => { const v = Object.values(o); return v[Math.floor(r() * v.length)]; };

// ---- cell-based house builder ----
// spec = { cells: [[x,z,floor]], door: [x,z] (south edge), porch: [[x,z]] (cells south of the house),
//          chimney: column|null, style: { plaster, roof, shutters, shutterMat }, seed }
// Walls go on every edge between an occupied and an empty cell; corner posts on convex corners;
// roofs on greedy rectangles of top-most cells (ridge along the longer side). Returns a flat plan of
// { key, make, x, y, z, ry } — keys are stable, so a level-up can diff old vs new plans.
const SIDES = { S: [0, 1, 0], N: [0, -1, Math.PI], E: [1, 0, Math.PI / 2], W: [-1, 0, -Math.PI / 2] };
const rect = (x0, x1, z0, z1, f) => { const a = []; for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) a.push([x, z, f]); return a; };
function hash(...n) { let h = 2166136261; for (const ch of n.join(',')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }
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
].map(L => ({ door: [0, 1], style: LEVEL_STYLE, seed: 11, porch: [], chimney: null, garage: null, drive: [[-1, 2], [-1, 3], [-1, 4]], ...L }));

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
  if (r() < 0.6) place(P.bicycle({ paint: pick(r, PAINT) }), -W / 2 - 0.8, 0, D / 2 + 0.3, Math.PI / 2 + 0.2);
  else if (r() < 0.5) place(P.wagon({ paint: pick(r, PAINT) }), -W / 2 - 1.0, 0, D / 2 + 0.4, 0.4);
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


// residents created since the last clearActors(); tick these with animate(res, t)
export const getActors = () => actors;
export const clearActors = () => { actors = []; };

export {
  CELL, WALL_H, T, FOUND_H, RISE, PITCH, PORCH_RISE, PORCH_EAVE,
  M, PLASTER, ROOF, FUR, CLOTH, PAINT, CROPS, SPECIES, RES_DEFAULT, POSES, ACTIONS, SIDES,
  box, grp, P, resident, setPose, setAction, animate, board, produce, crop, actorScene,
  rect, hash, rng, pick, buildPlan, LEVELS, LEVEL_STYLE, house,
};
