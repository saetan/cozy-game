// Renders the road network: 6 m streets and dirt roads (kit roads.js), 2 m lanes (kit lanes.js) and garden paths.
// The kit builds pieces from the whole network and gives each a `key` that encodes its neighbour signature, so
// we diff by key: editing the network only rebuilds the pieces whose shape changed (new ones pop in).
// Alignment: the kit tile grid already is the game grid. Street tile (i, j) is centred on (6i + 3, 6j + 3), the centre of
// its 3x3 cells; a lane or path piece on cell (x, z) sits at ((x + 0.5) * 2, (z + 0.5) * 2). So ox = oz = 0.
import * as THREE from 'three';
import { CELL, DIRT_H, ORDER, ROAD_MAT, SIDE, TILE, buildLanes, buildRoads, grp, pathTile, type RoadItem } from '../kit/index.js';
import type { SimState } from '../sim/state';
import { roadRevision } from '../sim/surfaces';
import { cellKey } from '../sim/world';
import { popIn } from './houseView';

export interface RoadSource { streets: SimState['streets']; tiles: SimState['tiles'] }

// A 6 m dirt road is 3.2 m wide (kit README), so a grass margin separates it from the tile edge where a lane arrives.
// The kit's lane mouth is made for a street's sidewalk, so the game bridges that margin with a dirt spur.
const DIRT_ROAD_HW = 1.6, SPUR_LEN = TILE / 2 - DIRT_ROAD_HW + 0.15, SPUR_W = 1.6;
function dirtSpur(): THREE.Group { // authored for a lane arriving from the S edge, pointing N into the tile
  const m = new THREE.Mesh(new THREE.BoxGeometry(SPUR_W, DIRT_H, SPUR_LEN), ROAD_MAT.dirt);
  m.name = 'dirt_spur'; m.position.set(0, DIRT_H / 2, -SPUR_LEN / 2);
  return grp('lane_dirt_spur', m);
}

/** Every piece the network needs, in kit terms. Pure: nothing is built until `make()`. */
export function buildRoadItems(src: RoadSource): RoadItem[] {
  const streets = [...src.streets].map(([k, type]) => { const [i, j] = k.split(',').map(Number); return { i, j, type }; });
  const laneCells: { x: number; z: number; type: 'road' | 'dirt' }[] = [], paths = new Set<string>();
  for (const [k, kind] of src.tiles) {
    const [x, z] = k.split(',').map(Number);
    if (kind === 'path') paths.add(k); else laneCells.push({ x, z, type: kind === 'lane' ? 'road' : 'dirt' });
  }
  const lanes = buildLanes(laneCells, { streets, ox: 0, oz: 0 });
  const items = [...buildRoads(streets, { ox: 0, oz: 0, cuts: lanes.cuts }), ...lanes.items];
  for (const c of laneCells) for (const s of ORDER) {
    const nx = c.x + SIDE[s][0], nz = c.z + SIDE[s][1];
    if (src.streets.get(`${Math.floor(nx / 3)},${Math.floor(nz / 3)}`) !== 'dirt') continue;
    // the spur starts on the shared edge and runs into the tile; SIDE[s][2] turns an S-authored piece to face side s
    const ry = SIDE[s][2] + Math.PI, ex = (c.x + 0.5 + SIDE[s][0] / 2) * CELL, ez = (c.z + 0.5 + SIDE[s][1] / 2) * CELL;
    items.push({ key: `dirtSpur:${c.x},${c.z}:${s}`, make: dirtSpur, x: ex, y: 0, z: ez, ry });
  }
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
  let first = true, last = -1;
  function sync(now: number) {
    const rev = roadRevision(); // a counter the road commands bump: nothing to compare or build on frames where roads did not change
    if (rev === last) return;
    last = rev;
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
