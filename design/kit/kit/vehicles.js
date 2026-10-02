// Pastel House Kit — vehicles: car, bicycle, wagon, bike stand; boarding / parking helpers.
// Conventions (see README): 1 unit = 1 m, +Y up, +Z = front/outside, pieces pivot at their ground/edge anchor.
import * as THREE from 'three';
import { CELL, M, PAINT, trim, wood, glass, leaf, dark, box, grp, ico, bar, P } from './core.js';
import { blush, setAction, defineAction, walkCycle, aimArm, SH_R } from './characters.js';

// ---- vehicles (pivot = ground centre, facing +z). Each has an empty named 'rider' = resident origin + pose ----
const tire = M('tire', '#5f5956', 0.95), lamp = M('lamp', '#fff4c9', 0.3);
function wheel(name, r, w, x, y, z) {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 8), tire); t.name = 'tire'; t.rotation.z = Math.PI / 2;
  const h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 6), trim); h.name = 'hub'; h.rotation.z = Math.PI / 2;
  const g = grp(name, t, h); g.position.set(x, y, z); return g;
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

// put a resident on a vehicle: parents it to the 'rider' anchor and applies the anchor's pose
function board(vehicle, res) {
  const a = vehicle.getObjectByName('rider');
  setAction(res, a.userData.pose); a.add(res); return vehicle;
}
// take the rider off: returns the resident (unparented) set to 'stand', or null
function alight(vehicle) {
  const a = vehicle.getObjectByName('rider'), res = a && a.children.find(c => c.userData.parts);
  if (!res) return null;
  res.removeFromParent(); setAction(res, 'stand'); return res;
}

// ---- bike stand (front-wheel rack). Pivot = ground centre, entry side +z, fits one 2 m cell ----
// Each slot is an empty 'bike_slot_<i>' at the bike's pivot + heading (nose in, facing -z).
P.bikeStand = ({ slots = 2, paint = PAINT.sky } = {}) => {
  const g = grp('bikeStand'), gap = 0.84, w = slots * gap + 0.16, hz = -0.55;
  g.add(box('stand_base', w, 0.05, 0.4, wood, 0, 0.025, hz));
  for (const s of [-1, 1]) g.add(box('stand_rail', w, 0.04, 0.05, trim, 0, 0.07, hz + s * 0.18));
  for (let i = 0; i < slots; i++) {
    const x = (i - (slots - 1) / 2) * gap;
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.024, 4, 10, Math.PI), paint);
      h.name = 'stand_hoop'; h.position.set(x + s * 0.065, 0.05, hz); h.rotation.y = Math.PI / 2; g.add(h);
    }
    const a = new THREE.Object3D(); a.name = 'bike_slot_' + i; a.position.set(x, 0, hz + 0.42); a.rotation.y = Math.PI; g.add(a);
  }
  g.userData.slots = slots;
  return g;
};
// park / unpark: parents the bike to the slot anchor (or back to `to`, keeping its world transform)
function parkBike(stand, bike, i = 0) {
  const a = stand.getObjectByName('bike_slot_' + i);
  a.add(bike); bike.position.set(0, 0, 0); bike.rotation.set(0, 0, 0); return bike;
}
function unparkBike(bike, to) { to.attach(bike); return bike; }
// world-space slot pose: { pos, ry } where the bike sits, and `approach` = 1.4 m out of the entry side (ride/walk in from there)
function slotWorld(stand, i = 0) {
  const a = stand.getObjectByName('bike_slot_' + i); stand.updateMatrixWorld(true);
  const pos = a.getWorldPosition(new THREE.Vector3()), q = a.getWorldQuaternion(new THREE.Quaternion());
  const ry = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
  return { pos, ry, approach: new THREE.Vector3(0, 0, -1.4).applyQuaternion(q).add(pos) };
}
// walking beside a bike: resident at bike-local WALK_BIKE_OFFSET, same heading; one hand on the grip
const WALK_BIKE_OFFSET = [-0.55, 0, 0];
const _grip = new THREE.Vector3(0.27, 0.84, 0.2);
defineAction('walkBike', { label: 'Walk bike',
  tick(res, t, p) { walkCycle(p, t, 7.5, 0.5, false); p.armL.rotation.x = Math.sin(t * 7.5) * 0.45; aimArm(p.armR, SH_R, _grip); },
});

export { tire, lamp, wheel, riderAnchor, board, alight, parkBike, unparkBike, slotWorld, WALK_BIKE_OFFSET };
