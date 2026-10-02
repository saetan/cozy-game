// Flat ground tiles: path = light paving slab (slightly inset), road = the kit's driveway piece.
import * as THREE from 'three';
import { CELL, M, P, box, grp } from '../kit/index.js';
import type { TileKind } from '../sim/state';

const pavingM = M('paving', '#e8e1d5', 0.95), jointM = M('paving_joint', '#d4ccbf', 0.95);

export function createTileObject(kind: TileKind): THREE.Group {
  if (kind === 'road') {
    const road = P.driveway();
    road.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = true; });
    return road;
  }
  const g = grp('path_tile', box('path_paving', CELL - 0.3, 0.025, CELL - 0.3, pavingM, 0, 0.0125, 0));
  for (const s of [-1, 1]) g.add(box('path_joint', CELL - 0.46, 0.006, 0.03, jointM, 0, 0.028, s * (CELL - 0.3) / 4));
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = true; });
  return g;
}
