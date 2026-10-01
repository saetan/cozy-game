// Chunked world: sparse cell occupancy + a set of unlocked chunks. Pure TS, no three.js.
// Cell coordinates are integers centred on the origin: x in [-width/2, width/2), same for z.
import worldConfig from '../data/world.json';

export const CHUNK = 16;

export interface WorldConfig { width: number; height: number; startUnlockedRadius: number }
export interface World {
  config: WorldConfig;
  unlocked: Set<string>;
  occupied: Map<string, number>; // cell key -> occupant id
  nextId: number; // next placement id; lives on the world so it is saved with it
}

export const cellKey = (x: number, z: number) => `${x},${z}`;
export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
export const cellToChunk = (x: number, z: number): [number, number] =>
  [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];

/** New world with a (2r+1)x(2r+1) block of chunks unlocked around chunk (0,0); r=1 gives 3x3. */
export function createWorld(config: WorldConfig = worldConfig): World {
  const unlocked = new Set<string>();
  const r = config.startUnlockedRadius;
  for (let cx = -r; cx <= r; cx++) for (let cz = -r; cz <= r; cz++) unlocked.add(chunkKey(cx, cz));
  return { config, unlocked, occupied: new Map(), nextId: 1 };
}

export function inBounds(w: World, x: number, z: number): boolean {
  const hx = w.config.width / 2, hz = w.config.height / 2;
  return x >= -hx && x < hx && z >= -hz && z < hz;
}

export function isUnlocked(w: World, x: number, z: number): boolean {
  if (!inBounds(w, x, z)) return false;
  return w.unlocked.has(chunkKey(...cellToChunk(x, z)));
}

export const isFree = (w: World, x: number, z: number): boolean => !w.occupied.has(cellKey(x, z));

export function unlockChunk(w: World, cx: number, cz: number): void { w.unlocked.add(chunkKey(cx, cz)); }

export function occupy(w: World, x: number, z: number, id: number): void { w.occupied.set(cellKey(x, z), id); }

export function release(w: World, x: number, z: number): void { w.occupied.delete(cellKey(x, z)); }

export const occupantAt = (w: World, x: number, z: number): number | undefined => w.occupied.get(cellKey(x, z));
