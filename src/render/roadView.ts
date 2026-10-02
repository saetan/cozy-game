// Renders the road network: 6 m streets and dirt roads (kit roads.js), 2 m lanes (kit lanes.js) and garden paths.
// The kit builds pieces from the whole network and gives each a `key` that encodes its neighbour signature, so
// we diff by key: editing the network only rebuilds the pieces whose shape changed (new ones pop in).
// Alignment: the kit tile grid already is the game grid. Street tile (i, j) is centred on (6i + 3, 6j + 3), the centre of
// its 3x3 cells; a lane or path piece on cell (x, z) sits at ((x + 0.5) * 2, (z + 0.5) * 2). So ox = oz = 0.
import * as THREE from 'three';
import { CELL, ORDER, SIDE, buildLanes, buildRoads, pathTile, type RoadItem } from '../kit/index.js';
import type { SimState } from '../sim/state';
import { cellKey } from '../sim/world';
import { popIn } from './houseView';

export interface RoadSource { streets: SimState['streets']; tiles: SimState['tiles'] }

/** Every piece the network needs, in kit terms. Pure: nothing is built until `make()`. */
export function buildRoadItems(src: RoadSource): RoadItem[] {
  const streets = [...src.streets].map(([k, type]) => { const [i, j] = k.split(',').map(Number); return { i, j, type }; });
  const laneCells: { x: number; z: number; type: 'road' | 'dirt' }[] = [], paths = new Set<string>();
  for (const [k, kind] of src.tiles) {
    const [x, z] = k.split(',').map(Number);
    if (kind === 'path') paths.add(k); else laneCells.push({ x, z, type: kind === 'lane' ? 'road' : 'dirt' });
  }
  const lanes = buildLanes(laneCells, { streets: streets.filter(t => t.type === 'road'), ox: 0, oz: 0 });
  const items = [...buildRoads(streets, { ox: 0, oz: 0, cuts: lanes.cuts }), ...lanes.items];
  for (const k of paths) {
    const [x, z] = k.split(',').map(Number), conn: Record<string, boolean> = {};
    for (const s of ORDER) if (paths.has(cellKey(x + SIDE[s][0], z + SIDE[s][1]))) conn[s] = true;
    const sig = ORDER.map(s => (conn[s] ? s : '-')).join('');
    items.push({ key: `path:${x},${z}:${sig}`, make: () => pathTile({ conn, seed: x * 31 + z }), x: (x + 0.5) * CELL, y: 0, z: (z + 0.5) * CELL, ry: 0, conn });
  }
  return items;
}

export function createRoadView(scene: THREE.Scene, src: RoadSource) {
  const views = new Map<string, THREE.Object3D>();
  let first = true, last = '';
  function sync(now: number) {
    const sig = `${[...src.streets].join(';')}|${[...src.tiles].join(';')}`; // cheap: skips the kit's network pass on frames where nothing changed
    if (sig === last) return;
    last = sig;
    const items = buildRoadItems(src), keep = new Set(items.map(i => i.key));
    for (const [key, o] of views) if (!keep.has(key)) { scene.remove(o); views.delete(key); }
    for (const it of items) {
      if (views.has(it.key)) continue;
      const o = it.make();
      o.position.set(it.x, it.y, it.z); o.rotation.y = it.ry; o.userData.key = it.key;
      o.traverse(m => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).receiveShadow = true; });
      scene.add(o); views.set(it.key, o);
      if (!first) popIn(o, now);
    }
    first = false;
  }
  /** Keys of the rendered road pieces, sorted (tests). */
  const keys = (): string[] => [...views.keys()].sort();
  return { sync, keys };
}
