// Building objects in a "corner frame": local (0,0) is the footprint's top-left corner, so
// setHousePose (rotationShift) rotates every type identically.
import * as THREE from 'three';
import { CELL, P, grp } from '../kit/index.js';
import balance from '../data/balance.json';
import type { BuildingType } from '../sim/state';
import { createHouseObject } from './houseView';

const fpSize = (t: BuildingType) => {
  const fp = balance.footprints[t];
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

export function createBuildingObject(type: BuildingType, ghostMat?: THREE.Material, animateIn = false, now = 0): THREE.Group {
  if (type === 'house') return createHouseObject(ghostMat, animateIn, now);
  const g = grp(type);
  const piece = type === 'farmPlot' ? P.farmPlot({ stage: 2 }) : P.marketStall();
  g.add(centred(type, piece));
  if (ghostMat) ghostify(g, ghostMat); else shadows(g);
  return g;
}

export const footprintSize = fpSize;

/** A stack of small crates in a row, in corner-frame coords. */
export function crateRow(n: number, x: number, z0: number, dz: number): THREE.Group {
  const g = grp('crates');
  for (let i = 0; i < n; i++) {
    const c = P.crate({ type: 'carrot', w: 0.5, d: 0.36 });
    c.position.set(x, 0, z0 + i * dz); c.rotation.y = (i % 2) * 0.15;
    g.add(c);
  }
  shadows(g);
  return g;
}
