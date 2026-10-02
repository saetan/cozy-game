// Pastel House Kit — farm & market: plots, crops (incl. thirsty), produce, crates, stall, tools, farming actions.
// Conventions (see README): 1 unit = 1 m, +Y up, +Z = front/outside, pieces pivot at their ground/edge anchor.
import * as THREE from 'three';
import { CELL, M, PAINT, trim, wood, leaf, dark, box, grp, ico, cone, bar, rng, ease, lerp, frac, rnd, P, PLASTER, ROOF } from './core.js';
import { CLOTH, blush, defineAction, walkCycle, SH_L, SH_R, ARM, Y_AXIS, armDir, aimArm, holdUpright } from './characters.js';

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

// ---- thirsty young stage: same footprint as crop(type, 1); leaves droop, colour dries to yellow-olive ----
const leafDry = M('foliage_thirsty', '#d9cd7c', 0.95), leafDryTip = M('foliage_thirsty_tip', '#dcb57c', 0.95),
      soilDry = M('soil_dry', '#e8d6bd', 0.95), soilDryDark = M('soil_furrow_dry', '#dcc4a6', 0.95),
      waterM = M('water', '#8fc8f0', 0.25), seedM = M('seed', '#f8eed6', 0.8);
// two-segment wilted leaf: base leans by `lean`, tip folds over by `bend` (radians from vertical); leans toward local +x, then yawed
function droop(name, w, h1, h2, lean, bend, yaw, x = 0, z = 0) {
  const tip = grp(name + '_tip', box(name + '_tip_blade', w * 0.85, h2, w * 0.6, leafDryTip, 0, h2 / 2, 0));
  tip.position.y = h1; tip.rotation.z = -bend;
  const l = grp(name + '_lean', box(name + '_blade', w, h1, w * 0.7, leafDry, 0, h1 / 2, 0), tip); l.rotation.z = -lean;
  const g = grp(name, l); g.rotation.y = yaw; g.position.set(x, 0, z); return g;
}
function cropThirsty(type) {
  const g = grp('crop_' + type + '_s1_thirsty');
  if (type === 'carrot') {
    for (let i = 0; i < 3; i++) g.add(droop('carrot_leaf', 0.05, 0.11, 0.1, 0.6, 1.3, i / 3 * Math.PI * 2 + 0.3));
  } else if (type === 'cabbage') {
    const o = ico('cabbage_leaves', 0.095, leafDry, 0, 0.025, 0); o.scale.y = 0.4; g.add(o);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.4, l = ico('cabbage_leaf_limp', 0.08, i % 2 ? leafDryTip : leafDry, Math.cos(a) * 0.1, 0.012, Math.sin(a) * 0.1);
      l.scale.set(1, 0.2, 0.75); l.rotation.y = -a; g.add(l);
    }
  } else if (type === 'wheat') {
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.add(droop('wheat_stalk', 0.028, 0.21, 0.12, 0.18, 1.75, -a, Math.cos(a) * 0.06, Math.sin(a) * 0.06)); }
  } else if (type === 'pumpkin') {
    for (let i = 0; i < 3; i++) {
      const l = ico('pumpkin_leaf', 0.105, i === 1 ? leafDryTip : leafDry, (i - 1) * 0.15, 0.02, (i % 2) * 0.1 - 0.05);
      l.scale.set(1.1, 0.2, 0.95); l.rotation.z = (i - 1) * 0.4; g.add(l);
    }
    g.add(droop('pumpkin_stem', 0.025, 0.07, 0.07, 0.3, 1.5, 1.2, 0, 0.03));
  } else if (type === 'tomato') {
    g.add(box('stake', 0.03, 0.8, 0.03, wood, 0.08, 0.4, 0));
    g.add(droop('tomato_stem', 0.032, 0.2, 0.13, 0.1, 1.5, Math.PI, -0.01, 0));
    [[-0.07, 0.1, 0.45], [0.0, 0.19, -0.4]].forEach(([x, y, rz]) => { const l = ico('tomato_leaves', 0.1, leafDry, x, y, 0); l.scale.set(1.05, 0.5, 0.85); l.rotation.z = rz; g.add(l); });
  }
  return g;
}

// stage 0 sprout, 1 growing, 2 ripe. opts.thirsty swaps stage 1 for its wilted variant
function crop(type, stage = 2, { thirsty = false } = {}) {
  if (thirsty && stage === 1) return cropThirsty(type);
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
// thirsty: dry soil + wilted stage-1 crops + floating water-drop marker (marker: false to hide it)
P.farmPlot = ({ type = 'carrot', stage = 2, seed = 1, thirsty = false, marker = thirsty } = {}) => {
  const g = grp('farmPlot_' + type + (thirsty ? '_thirsty' : '')), r = rng(seed);
  g.add(box('plot_soil', CELL, 0.1, CELL, thirsty ? soilDry : soil, 0, 0.05, 0));
  if (marker) g.add(P.waterMarker());
  for (const s of [-1, 1]) {
    g.add(box('plot_border', CELL, 0.14, 0.08, wood, 0, 0.07, s * (CELL / 2 - 0.04)));
    g.add(box('plot_border', 0.08, 0.14, CELL - 0.16, wood, s * (CELL / 2 - 0.04), 0.07, 0));
  }
  for (const z of [-0.55, 0, 0.55]) {
    g.add(box('plot_furrow', CELL - 0.3, 0.08, 0.32, thirsty ? soilDryDark : soilDark, 0, 0.14, z));
    for (const x of [-0.6, -0.2, 0.2, 0.6]) {
      const st = stage === 'mixed' ? Math.floor(r() * 3) : stage;
      const c = crop(type, st, { thirsty }); c.position.set(x + (r() - 0.5) * 0.06, 0.18, z); c.rotation.y = r() * 6.28; g.add(c);
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
// seed pouch (~0.13 m): pivot at the bottom of the sack so it sits in a palm
function makePouch(cloth = CLOTH.pink, tie = CLOTH.yellow) {
  const g = grp('seedPouch');
  const sack = ico('pouch_sack', 0.058, cloth, 0, 0.055, 0, 1); sack.scale.set(1.1, 1, 1); g.add(sack);
  const neck = cone('pouch_neck', 0.045, 0.05, 6, cloth, 0, 0.115, 0); neck.rotation.x = Math.PI; g.add(neck);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.009, 4, 8), tie); band.name = 'pouch_tie'; band.rotation.x = Math.PI / 2; band.position.y = 0.098; g.add(band);
  const seeds = ico('pouch_seeds', 0.034, seedM, 0, 0.135, 0); seeds.scale.y = 0.35; g.add(seeds);
  return g;
}
// floating water-drop hint above a thirsty plot; tick with animateMarker(plotOrMarker, t)
P.waterMarker = () => {
  const drop = grp('marker_drop', ico('drop_body', 0.13, waterM, 0, 0, 0, 1), cone('drop_tip', 0.112, 0.2, 8, waterM, 0, 0.15, 0), ico('drop_shine', 0.035, trim, -0.055, 0.04, 0.105));
  drop.scale.setScalar(2.2); drop.position.y = 1.7;
  const g = grp('marker_water', drop); g.userData.marker = drop; return g;
};
function animateMarker(o, t) {
  o.traverse(m => { const d = m.userData.marker; if (d) { d.position.y = 1.7 + Math.sin(t * 2.4) * 0.08; d.rotation.y = t * 1.2; } });
}
P.hoe = makeHoe; P.wateringCan = () => makeCan(); P.seedPouch = () => makePouch();

// ---- farming actions ----
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const GROUND_FX = 0.17; // particles settle at plot-furrow height (resident and plot on the same ground)
function fxPool(name, n, make) { const g = grp(name); for (let i = 0; i < n; i++) { const m = make(i); m.visible = false; g.add(m); } return g; }
// sow: 1.2 s — grab in pouch (0–.18), sweep out (.18–.55), hold (.55–.65), return (.65–1). Seeds leave the hand at .43
const SOW_T = 1.2, SOW_REL = 0.43;
function sowPose(ph) {
  const s = ph < 0.18 ? 0 : ph < 0.55 ? ease((ph - 0.18) / 0.37) : ph < 0.65 ? 1 : 1 - ease((ph - 0.65) / 0.35);
  const grab = ph < 0.18 ? Math.sin(ph / 0.18 * Math.PI * 2) * 0.07 : 0;
  return { s, xR: lerp(-1.62, -1.72, s) - Math.sin(s * Math.PI) * 0.18 + grab, zR: lerp(-0.72, 1.0, s), yaw: -0.12 + 0.34 * s };
}

defineAction('carry', { label: 'Carry crate',
  setup(res, p) { p.armL.rotation.set(-1.15, 0, 0.12); p.armR.rotation.set(-1.15, 0, -0.12); p.prop = P.crate({ type: 'tomato', w: 0.44, d: 0.3 }); p.prop.position.set(0, 0.48, 0.42); p.rig.add(p.prop); },
  tick: (res, t, p) => walkCycle(p, t, 7.5, 0.6, false),
});
defineAction('sell', { label: 'Sell at stall',
  tick(res, t, { rig, head, legL, legR, armL, armR, prop }) {
    const c = (t * 0.5) % 1, waving = c < 0.4;
    armR.rotation.x = 0; armR.rotation.z = waving ? 2.4 + Math.sin(t * 10) * 0.3 : 0.28;
    armL.rotation.x = waving ? 0 : -1.0 + Math.sin(t * 3) * 0.15;
    head.rotation.y = Math.sin(t * 1.1) * 0.35; rig.position.y = Math.abs(Math.sin(t * 3)) * 0.015;
  },
});
defineAction('sow', { label: 'Sow seeds',
  setup(res, p) { p.prop = makePouch(); p.armL.add(p.prop); p.fx = fxPool('fx_seeds', 14, () => box('fx_seed', 0.03, 0.02, 0.022, seedM)); res.add(p.fx); },
  tick(res, t, { rig, head, legL, legR, armL, armR, prop }) {
    const ph = frac(t / SOW_T), P0 = sowPose(ph);
    armL.rotation.set(-1.45 + Math.sin(ph * Math.PI * 2) * 0.03, 0, 0.85);
    armR.rotation.set(P0.xR, 0, P0.zR);
    rig.rotation.set(0, P0.yaw, 0); legL.rotation.y = legR.rotation.y = -P0.yaw;
    rig.position.y = 0.012 * (1 - Math.cos(ph * Math.PI * 2)) / 2;
    head.rotation.set(0.16, 0.38 * P0.s - 0.12, 0);
    if (prop) holdUpright(prop, armL, 0, 0, -0.32, 0, 0, 0.03, 0.07);
    const fx = res.userData.parts.fx;
    if (fx) {
      const R = sowPose(SOW_REL), k = Math.floor(t / SOW_T - SOW_REL), age = frac(t / SOW_T - SOW_REL) * SOW_T;
      armDir(R.xR, R.zR, _c).multiplyScalar(ARM + 0.04).add(SH_R).applyAxisAngle(Y_AXIS, R.yaw);
      fx.children.forEach((m, i) => {
        const n = k * 37 + i * 3;
        _a.set(0.35 + rnd(n) * 1.1, 0.55 + rnd(n + 1) * 0.6, 0.8 + rnd(n + 2) * 1.0).applyAxisAngle(Y_AXIS, R.yaw);
        const land = (_a.y + Math.sqrt(_a.y * _a.y + 19.6 * (_c.y - GROUND_FX))) / 9.8, tt = Math.min(age, land);
        m.visible = age < 1.05;
        m.position.set(_c.x + _a.x * tt, Math.max(GROUND_FX, _c.y + _a.y * tt - 4.9 * tt * tt), _c.z + _a.z * tt);
        m.rotation.set(n + tt * 9, n * 2 + tt * 7, 0);
      });
    }
  },
});
const hoeDef = {
  // hoe lives on the rig; tick places it at the right hand and IK-aims both arms onto the handle
  setup(res, p) { const h = makeHoe(); h.position.z = 0.135; p.prop = grp('hoe_grip', h); p.rig.add(p.prop); },
  tick(res, t, { rig, head, legL, legR, armL, armR, prop }) {
    // 0.9 Hz: raise 70% (ease), strike 30% (accelerating into the soil)
    const ph = frac(t * 0.9), k = ph < 0.7 ? ease(ph / 0.7) : 1 - Math.pow((ph - 0.7) / 0.3, 2);
    const pitch = lerp(-0.4, 0.85, k);
    _c.set(0.03, lerp(0.6, 0.84, k), lerp(0.24, 0.2, k));            // right hand = grip point on the handle
    _b.set(0, Math.sin(pitch), Math.cos(pitch));                      // handle direction (toward the blade)
    if (prop) { prop.position.copy(_c); prop.rotation.set(-pitch, 0, 0); }
    aimArm(armR, SH_R, _c);
    aimArm(armL, SH_L, _b.multiplyScalar(-0.08).add(_c));             // left hand 8 cm further back on the handle
    rig.rotation.set(lerp(0.1, -0.04, k), 0, 0);
    rig.position.y = 0.028 * k;
    head.rotation.x = lerp(0.3, -0.1, k);
  },
};
defineAction('hoe', { label: 'Hoe (cover seeds)', ...hoeDef });
defineAction('work', hoeDef); // legacy alias
defineAction('water', { label: 'Water crops',
  setup(res, p) { p.prop = makeCan(); p.prop.position.set(0, -0.34, 0.02); p.armR.add(p.prop); p.fx = fxPool('fx_water', 18, () => { const d = ico('fx_droplet', 0.022, waterM); d.scale.y = 1.6; return d; }); res.add(p.fx); },
  tick(res, t, { rig, head, legL, legR, armL, armR, prop }) {
    // 0.5 Hz sweep along the furrows: torso twist + arm swing, can tilted to pour
    const s = Math.sin(t * Math.PI), yaw = 0.32 * s;
    rig.rotation.set(0, yaw, 0); legL.rotation.y = legR.rotation.y = -yaw;
    armR.rotation.set(-1.05, 0, 0.1 + 0.12 * s);
    armL.rotation.set(-0.35, 0, -0.42 - 0.04 * s);
    head.rotation.set(0.28, 0.25 * s, 0);
    rig.position.y = 0.004 * (1 + Math.sin(t * Math.PI * 2));
    if (prop) holdUpright(prop, armR, 0.7 + 0.06 * Math.sin(t * Math.PI * 2), 0, -0.34, 0.02);
    const fx = res.userData.parts.fx;
    if (fx && prop) {
      res.updateMatrixWorld(true);
      const p0 = res.worldToLocal(prop.localToWorld(_c.set(0, -0.04, 0.37)));
      const v0 = res.worldToLocal(prop.localToWorld(_a.set(0, 0.13, 0.55))).sub(p0).normalize();
      fx.children.forEach((m, i) => {
        const tt = frac(t * 1.8 + i / fx.children.length) * 0.42, sp = 1.0 + rnd(i) * 0.5;
        const y = p0.y + v0.y * sp * tt - 4.9 * tt * tt;
        m.visible = y > GROUND_FX;
        m.position.set(p0.x + (v0.x * sp + (rnd(i + 9) - 0.5) * 0.3) * tt, y, p0.z + v0.z * sp * tt);
      });
    }
  },
});

export { CROPS, produce, crop, cropThirsty, makeHoe, makeCan, makePouch, animateMarker, GROUND_FX, SOW_T };
