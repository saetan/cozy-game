// Renders a placed house at its current level. Every level is drawn in ONE fixed frame (the bbox of
// the union of all kit levels, see sim/houses), so levelling up only adds/removes pieces; nothing moves.
// Level-up diffs the plan by piece key: new keys pop in (back-out), removed keys shrink out.
import * as THREE from 'three';
import { CELL, LEVELS, buildPlan, grp, type PlanPiece } from '../kit/index.js';
import { HOUSE_FRAME, HOUSE_OFFSET } from '../sim/houses';
import type { Footprint, Frame, Placement, Rotation } from '../systems/placement';

const backOut = (x: number) => { const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const smoothstep = (x: number) => x * x * (3 - 2 * x);
interface Tween { obj: THREE.Object3D; t0: number; dur: number; out: boolean }
const tweens: Tween[] = [];
export function stepTweens(now: number) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i], k = Math.min(1, Math.max(0, (now - w.t0) / w.dur));
    w.obj.scale.setScalar(Math.max(0.001, w.out ? 1 - smoothstep(k) : backOut(k)));
    if (k >= 1) { tweens.splice(i, 1); if (w.out) w.obj.removeFromParent(); }
  }
}
/** Scale an object in from nothing (shared with the market's new stalls). */
export function popIn(obj: THREE.Object3D, now: number, delay = 0) {
  obj.scale.setScalar(0.001); tweens.push({ obj, t0: now + delay, dur: 0.45, out: false });
}
/** Tweens still running (tests). */
export const activeTweens = () => tweens.length;

/** Every cell of the fixed house frame; the footprint used to pose a house group. */
export const frameFootprint = (f: Frame): Footprint => Array.from({ length: f[0] * f[1] }, (_, i) => [Math.floor(i / f[1]), i % f[1]] as const);
export const HOUSE_FRAME_FOOTPRINT: Footprint = frameFootprint(HOUSE_FRAME);
/** Footprint to pose a placement with: the whole frame for growing buildings, the footprint itself otherwise. */
export const poseFootprint = (p: Pick<Placement, 'footprint' | 'frame'>): Footprint => (p.frame ? frameFootprint(p.frame) : p.footprint);

/** Offset (cells) that keeps a footprint rotated by r*90 degrees inside its normalised box.
 *  Rotation about +Y by -r*90 deg maps local (x,z) -> (-z,x) per turn, matching rotateFootprint. */
export function rotationShift(fp: Footprint, r: number): [number, number] {
  const xs = fp.map(c => c[0]), zs = fp.map(c => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, z0 = Math.min(...zs), z1 = Math.max(...zs) + 1;
  let corners: [number, number][] = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]];
  for (let i = 0; i < ((r % 4) + 4) % 4; i++) corners = corners.map(([x, z]) => [-z, x]);
  return [-Math.min(...corners.map(c => c[0])), -Math.min(...corners.map(c => c[1]))];
}

/** Plan pieces of a level in frame coordinates. Driveways are separate tiles, so they are excluded.
 *  Bike stands (kit 0.2) sit outside the sim's house frame; a later PR decides where the stand goes. */
export const housePlan = (level: number): PlanPiece[] =>
  buildPlan(LEVELS[level - 1], HOUSE_OFFSET[0] * CELL, HOUSE_OFFSET[1] * CELL).filter(p => !p.key.startsWith('drive:') && !p.key.startsWith('bikeStand:'));

interface HouseData { level: number; pieces: Map<string, THREE.Object3D>; ghostMat?: THREE.Material }
const dataOf = (g: THREE.Object3D) => g.userData.house as HouseData;

function makePiece(p: PlanPiece, ghostMat?: THREE.Material): THREE.Object3D {
  const o = p.make();
  o.position.set(p.x, p.y, p.z); o.rotation.y = p.ry; o.userData.key = p.key;
  o.traverse(m => {
    if (!(m as THREE.Mesh).isMesh) return;
    const mesh = m as THREE.Mesh;
    if (ghostMat) mesh.material = ghostMat; else mesh.castShadow = mesh.receiveShadow = true;
  });
  return o;
}

/** Brings the group to `level`. With `animate`, new pieces pop in bottom-up and removed ones shrink out. */
function showLevel(g: THREE.Object3D, level: number, animate: boolean, now: number, delay: number) {
  const d = dataOf(g), plan = housePlan(level), keep = new Set(plan.map(p => p.key));
  for (const [key, o] of d.pieces) if (!keep.has(key)) {
    d.pieces.delete(key);
    if (animate) tweens.push({ obj: o, t0: now, dur: 0.3, out: true }); else o.removeFromParent();
  }
  const fresh = plan.filter(p => !d.pieces.has(p.key)).sort((a, b) => a.y - b.y || a.z - b.z);
  const step = Math.min(0.04, 1.6 / Math.max(1, fresh.length));
  fresh.forEach((p, i) => {
    const o = makePiece(p, d.ghostMat);
    g.add(o); d.pieces.set(p.key, o);
    if (animate) { o.scale.setScalar(0.001); tweens.push({ obj: o, t0: now + delay + i * step, dur: 0.45, out: false }); }
  });
  d.level = level;
}

/** Builds the (unplaced) house group; the caller positions it with setHousePose. */
export function createHouseObject(level = 1, ghostMat?: THREE.Material, animateIn = false, now = 0) {
  const g = grp('house');
  g.userData.house = { level: 0, pieces: new Map(), ghostMat } satisfies HouseData;
  showLevel(g, level, animateIn && !ghostMat, now, 0.05);
  return g;
}
/** Animated level change (no-op when already at that level). */
export function setHouseLevel(g: THREE.Object3D, level: number, now: number) {
  if (dataOf(g).level !== level) showLevel(g, level, true, now, 0.25);
}
export const houseLevel = (g: THREE.Object3D): number => dataOf(g).level;

export function setHousePose(g: THREE.Object3D, fp: Footprint, r: Rotation, ox: number, oz: number) {
  const [sx, sz] = rotationShift(fp, r);
  g.rotation.y = -r * Math.PI / 2;
  g.position.set((ox + sx) * CELL, 0, (oz + sz) * CELL);
}
