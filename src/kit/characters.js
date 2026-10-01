// Residents (species rigs) and their materials.
import { THREE, M, trim, grp, box, P, ico, cone, FUR, CLOTH, cream, blush, eyeMat } from './shared.js';
import { setAction } from './actions.js';

// ---- residents (pivot = between feet, facing +z, ~1.4 m tall) ----
// poses: stand | sit (car) | ride (bike) | push (wagon). Hip pivot at y 0.28, shoulder at y 0.7
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

export const getActors = () => actors;
export const clearActors = () => { actors = []; };
export { SPECIES, RES_DEFAULT, POSES, resident, setPose };
