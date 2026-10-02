// Pastel House Kit — characters: 5 species on one shared rig, poses, action registry, procedural animation.
// Conventions (see README): 1 unit = 1 m, +Y up, +Z = front/outside, pieces pivot at their ground/edge anchor.
import * as THREE from 'three';
import { CELL, M, trim, P, box, grp, ico, cone, ease, lerp, frac } from './core.js';

// ---- residents (pivot = between feet, facing +z, ~1.4 m tall) ----
const FUR = { bunny: M('fur_bunny', '#f8f3ec'), bear: M('fur_bear', '#d9b28e'), cat: M('fur_cat', '#bcb3c9'),
              fox: M('fur_fox', '#f2a97c'), frog: M('fur_frog', '#b6dca2') };
const CLOTH = { blue: M('cloth_blue', '#a9c4e8'), pink: M('cloth_pink', '#f3b3c1'), yellow: M('cloth_yellow', '#f2d98c'),
                lilac: M('cloth_lilac', '#c9b3e0'), mint: M('cloth_mint', '#a8d8c0') };
const cream = M('fur_cream', '#fbf3e6'), blush = M('blush_pink', '#f4b3b3'), eyeMat = M('eye_dark', '#3a3230', 0.4);
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


// ---- arm IK helpers (rig space) ----
const SH_L = new THREE.Vector3(-0.25, 0.7, 0), SH_R = new THREE.Vector3(0.25, 0.7, 0), ARM = 0.32, Y_AXIS = new THREE.Vector3(0, 1, 0), X_AXIS = new THREE.Vector3(1, 0, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

// unit direction of an arm (rest = straight down) for Euler XYZ (x, 0, z)
const armDir = (x, z, out) => out.set(Math.sin(z), -Math.cos(z) * Math.cos(x), -Math.cos(z) * Math.sin(x));
// point an arm from its shoulder toward a rig-space target
function aimArm(arm, sh, target) {
  _a.copy(target).sub(sh).normalize();
  arm.rotation.set(Math.atan2(-_a.z, -_a.y), 0, Math.asin(Math.max(-1, Math.min(1, _a.x))));
}
// keep a hand-held prop upright in rig space, tilted by `tilt` about X; `off` is a rig-space nudge from the hand
function holdUpright(prop, arm, tilt, hx, hy, hz, ox = 0, oy = 0, oz = 0) {
  _q.copy(arm.quaternion).invert();
  prop.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(X_AXIS, tilt));
  prop.position.set(ox, oy, oz).applyQuaternion(_q).add(_b.set(hx, hy, hz));
}

// ---- action registry ----
// defineAction(name, { label, pose, setup(res, parts), tick(res, t, parts) }). setup adds props (parts.prop) and particles (parts.fx);
// tick is a pure function of t, so any action can loop forever and be cut at any frame.
const ACTIONS = {}, ACTION_DEFS = {};
function defineAction(name, { label, pose = 'stand', setup, tick } = {}) { ACTION_DEFS[name] = { pose, setup, tick }; if (label) ACTIONS[name] = label; }
function setAction(res, action) {
  const p = res.userData.parts, d = ACTION_DEFS[action] || ACTION_DEFS.stand;
  if (p.prop) { p.prop.removeFromParent(); p.prop = null; }
  if (p.fx) { p.fx.removeFromParent(); p.fx = null; }
  setPose(res, d.pose);
  p.head.rotation.set(0, 0, 0); p.rig.position.y = 0; p.rig.rotation.set(0, 0, 0); p.legL.rotation.y = p.legR.rotation.y = 0;
  if (d.setup) d.setup(res, p);
  res.userData.action = action; return res;
}
function animate(res, t) {
  const p = res.userData.parts, d = ACTION_DEFS[res.userData.action];
  p.rig.position.y = 0; p.head.rotation.set(0, 0, 0);
  if (d && d.tick) d.tick(res, t, p);
}
// shared gait: legs swing ±amp at k rad/s, bob 0.045 m; arms swing unless they're busy
function walkCycle(p, t, k = 7.5, amp = 0.6, arms = true) {
  const s = Math.sin(t * k);
  p.legL.rotation.x = s * amp; p.legR.rotation.x = -s * amp;
  p.rig.position.y = Math.abs(Math.cos(t * k)) * 0.045;
  p.head.rotation.z = s * 0.05;
  if (arms) { p.armL.rotation.x = -s * 0.55; p.armR.rotation.x = s * 0.55; }
}
defineAction('stand', { label: 'Stand',
  tick(res, t, { rig, head, legL, legR, armL, armR, prop }) {
    const b = Math.sin(t * 2);
    head.rotation.z = Math.sin(t * 0.9) * 0.07; rig.position.y = b * 0.006;
    armL.rotation.z = -0.28 - b * 0.04; armR.rotation.z = 0.28 + b * 0.04;
  },
});
defineAction('walk', { label: 'Walk', tick: (res, t, p) => walkCycle(p, t) });
defineAction('wave', { label: 'Wave',
  tick(res, t, { rig, head, legL, legR, armL, armR, prop }) {
    armR.rotation.x = 0; armR.rotation.z = 2.5 + Math.sin(t * 9) * 0.35;
    head.rotation.z = 0.12; rig.position.y = Math.abs(Math.sin(t * 4.5)) * 0.02;
  },
});
defineAction('sit', { label: 'Sit · car', pose: 'sit',
  tick(res, t, { rig, head, legL, legR, armL, armR, prop }) {
    head.rotation.y = Math.sin(t * 0.7) * 0.3; head.rotation.z = Math.sin(t * 1.3) * 0.05;
    rig.position.y = Math.abs(Math.sin(t * 6)) * 0.008;
  },
});
defineAction('ride', { label: 'Ride · bike', pose: 'ride',
  tick(res, t, { rig, head, legL, legR, armL, armR, prop }) {
    const s = Math.sin(t * 6);
    legL.rotation.x = -0.9 + s * 0.45; legR.rotation.x = -0.9 - s * 0.45;
    rig.position.y = Math.abs(s) * 0.01; head.rotation.z = s * 0.03;
  },
});
defineAction('push', { label: 'Push · wagon', pose: 'push', tick: (res, t, p) => walkCycle(p, t, 5.5, 0.45, false) });

// residents created since the last clearActors(); tick these with animate(res, t)
const getActors = () => actors;
const clearActors = () => { actors = []; };
const newResident = (sp, r = Math.random) => resident(sp, { outfit: CLOTH[RES_DEFAULT[sp][0]], scarf: CLOTH[RES_DEFAULT[sp][1]] });

export {
  FUR, CLOTH, cream, blush, eyeMat, SPECIES, RES_DEFAULT, POSES, ACTIONS,
  resident, newResident, setPose, setAction, defineAction, animate, walkCycle, getActors, clearActors,
  SH_L, SH_R, ARM, Y_AXIS, X_AXIS, armDir, aimArm, holdUpright,
};
