// Actions (props + per-frame animation), boarding vehicles, demo scenes.
import { THREE, CELL, M, CLOTH, PAINT, trim, wood, grp, box, P } from './shared.js';
import { bar, metal } from './pieces.js';
import { RES_DEFAULT, resident, setPose } from './characters.js';

// put a resident on a vehicle: parents it to the 'rider' anchor and applies the anchor's pose
function board(vehicle, res) {
  const a = vehicle.getObjectByName('rider');
  setAction(res, a.userData.pose); a.add(res); return vehicle;
}
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

export { ACTIONS, setAction, animate, board, actorScene, withRider };
