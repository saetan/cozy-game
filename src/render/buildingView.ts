// Building objects in a "corner frame": local (0,0) is the footprint's top-left corner, so
// setHousePose (rotationShift) rotates every type identically.
import * as THREE from 'three';
import { CELL, P, grp } from '../kit/index.js';
import balance from '../data/balance.json';
import type { BuildingType } from '../sim/state';
import { isDecor } from '../sim/decor';
import { levelSpec } from '../sim/levels';
import { createHouseObject, popIn } from './houseView';

const fpSize = (t: BuildingType): readonly [number, number] => {
  const spec = levelSpec(t);
  if (spec) return spec.frame;
  const fp = balance.footprints[t as 'farmPlot'];
  return [Math.max(...fp.map(c => c[0])) + 1, Math.max(...fp.map(c => c[1])) + 1] as const;
};

function ghostify(o: THREE.Object3D, mat: THREE.Material) {
  o.traverse(m => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).material = mat; });
}
function shadows(o: THREE.Object3D) {
  o.traverse(m => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = (m as THREE.Mesh).receiveShadow = true; });
}

/** Centre a centred kit piece inside its footprint box. */
function centred(type: BuildingType, piece: THREE.Object3D) {
  const [w, h] = fpSize(type);
  piece.position.set(w * CELL / 2, 0, h * CELL / 2);
  return piece;
}

/** Market stalls sit side by side in the corner frame: stall i is centred at x = 2 + i * 2.4 m (a stall is 2.4 m wide). */
const STALL_W = 2.4, STALL_GOODS = [['carrot', 'tomato', 'cabbage'], ['wheat', 'pumpkin', 'carrot'], ['cabbage', 'tomato', 'wheat']];
function makeStall(i: number, shade: boolean): THREE.Object3D {
  const s = P.marketStall({ goods: STALL_GOODS[i % STALL_GOODS.length] });
  s.position.set(CELL + i * STALL_W, 0, CELL);
  if (shade) shadows(s);
  return s;
}
/** Brings a market group to `level` stalls; new stalls pop in when animated. */
export function setMarketLevel(g: THREE.Object3D, level: number, now: number, animate = true) {
  const stalls = g.userData.stalls as THREE.Object3D[];
  while (stalls.length < level) {
    const s = makeStall(stalls.length, true);
    g.add(s); stalls.push(s);
    if (animate) popIn(s, now);
  }
}

export function createBuildingObject(type: BuildingType, ghostMat?: THREE.Material, animateIn = false, now = 0, level = 1): THREE.Group {
  if (type === 'house') return createHouseObject(level, ghostMat, animateIn, now);
  const g = grp(type);
  if (type === 'market') {
    g.userData.stalls = [];
    if (ghostMat) { const s = makeStall(0, false); g.add(s); ghostify(g, ghostMat); }
    else setMarketLevel(g, level, now, animateIn);
    return g;
  }
  if (isDecor(type)) g.add(centred(type, P[type]())); // kit shrub / fence / scarecrow
  else g.add(centred(type, P.farmPlot({ stage: 2 })));
  if (ghostMat) ghostify(g, ghostMat); else shadows(g);
  return g;
}

export const footprintSize = fpSize;

/** A stack of small crates in a row, in corner-frame coords. */
export function crateRow(n: number, x: number, z0: number, dz: number, type: string | string[] = 'carrot'): THREE.Group {
  const g = grp('crates');
  for (let i = 0; i < n; i++) {
    const c = P.crate({ type: typeof type === 'string' ? type : type[i], w: 0.5, d: 0.36 });
    c.position.set(x, 0, z0 + i * dz); c.rotation.y = (i % 2) * 0.15;
    g.add(c);
  }
  shadows(g);
  return g;
}
