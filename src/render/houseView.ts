// Renders a placed house: Lv1 plan pieces inside a group rotated about the footprint, with pop-in.
import * as THREE from 'three';
import { CELL, LEVELS, buildPlan, grp } from '../kit/index.js';
import type { Footprint, Rotation } from '../systems/placement';

/** Cells of the Lv1 house footprint (ground cells of LEVELS[0]). */
export const HOUSE_FOOTPRINT: Footprint = LEVELS[0].cells.map(([x, z]) => [x, z] as const);

const backOut = (x: number) => { const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
interface Tween { obj: THREE.Object3D; t0: number; dur: number }
const tweens: Tween[] = [];
export function stepTweens(now: number) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i], k = Math.min(1, Math.max(0, (now - w.t0) / w.dur));
    w.obj.scale.setScalar(Math.max(0.001, backOut(k)));
    if (k >= 1) tweens.splice(i, 1);
  }
}

/** Offset (cells) that keeps a footprint rotated by r*90 degrees inside its normalised box.
 *  Rotation about +Y by -r*90 deg maps local (x,z) -> (-z,x) per turn, matching rotateFootprint. */
export function rotationShift(fp: Footprint, r: number): [number, number] {
  const xs = fp.map(c => c[0]), zs = fp.map(c => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, z0 = Math.min(...zs), z1 = Math.max(...zs) + 1;
  let corners: [number, number][] = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]];
  for (let i = 0; i < ((r % 4) + 4) % 4; i++) corners = corners.map(([x, z]) => [-z, x]);
  return [-Math.min(...corners.map(c => c[0])), -Math.min(...corners.map(c => c[1]))];
}

/** Builds the (unplaced) house group; the caller positions it with setHousePose. */
export function createHouseObject(ghostMat?: THREE.Material, animateIn = false, now = 0) {
  const g = grp('house');
  const plan = buildPlan(LEVELS[0], 0, 0).filter(p => !p.key.startsWith('drive:'));
  const fresh = [...plan].sort((a, b) => a.y - b.y || a.z - b.z);
  const step = Math.min(0.04, 1.6 / Math.max(1, fresh.length));
  fresh.forEach((p, i) => {
    const o = p.make();
    o.position.set(p.x, p.y, p.z); o.rotation.y = p.ry;
    o.traverse(m => {
      if (!(m as THREE.Mesh).isMesh) return;
      const mesh = m as THREE.Mesh;
      if (ghostMat) mesh.material = ghostMat; else mesh.castShadow = mesh.receiveShadow = true;
    });
    g.add(o);
    if (animateIn) { o.scale.setScalar(0.001); tweens.push({ obj: o, t0: now + 0.05 + i * step, dur: 0.45 }); }
  });
  return g;
}

export function setHousePose(g: THREE.Object3D, fp: Footprint, r: Rotation, ox: number, oz: number) {
  const [sx, sz] = rotationShift(fp, r);
  g.rotation.y = -r * Math.PI / 2;
  g.position.set((ox + sx) * CELL, 0, (oz + sz) * CELL);
}
