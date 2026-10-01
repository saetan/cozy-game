// Ground: grid-lined grass for unlocked chunks, a muted meadow plane everywhere else.
import * as THREE from 'three';
import { CELL, M, box, grp } from '../kit/index.js';
import { CHUNK, type World } from '../sim/world';

const grassM = M('grass', '#d3e8c2', 0.95), gridM = M('grid_line', '#eaf4e0', 0.9);
const meadowM = M('meadow_locked', '#c4d4b4', 1);

export function createChunkView(world: World) {
  const root = grp('chunks');
  const span = Math.max(world.config.width, world.config.height) * CELL;
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(span, span), meadowM);
  meadow.name = 'meadow'; meadow.rotation.x = -Math.PI / 2; meadow.position.y = -0.08;
  meadow.receiveShadow = true;
  root.add(meadow);

  const built = new Set<string>();
  function chunkMesh(cx: number, cz: number) {
    const size = CHUNK * CELL, g = grp(`chunk_${cx}_${cz}`), x0 = cx * size, z0 = cz * size;
    const grass = box('chunk_grass', size, 0.06, size, grassM, x0 + size / 2, -0.03, z0 + size / 2);
    grass.receiveShadow = true;
    g.add(grass);
    for (let i = 0; i <= CHUNK; i++) {
      g.add(box('grid_line', 0.04, 0.006, size, gridM, x0 + i * CELL, 0.003, z0 + size / 2));
      g.add(box('grid_line', size, 0.006, 0.04, gridM, x0 + size / 2, 0.003, z0 + i * CELL));
    }
    return g;
  }
  /** Adds meshes for any newly unlocked chunks; call again after unlocking more. */
  function sync() {
    for (const k of world.unlocked) if (!built.has(k)) {
      built.add(k);
      const [cx, cz] = k.split(',').map(Number);
      root.add(chunkMesh(cx, cz));
    }
  }
  sync();
  return { root, sync };
}
