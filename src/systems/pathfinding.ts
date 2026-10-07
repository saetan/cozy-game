// A* on a 4-neighbour grid. Pure TS. Cost per step = walking.speed.grass / speed[surface], i.e. in "grass-walking cells",
// so walking costs are unchanged and a vehicle's speed table (per surface) just scales them.
import balance from '../data/balance.json';
import { MinHeap } from '../sim/heap';
import { cellKey, isFree, isUnlocked, type World } from '../sim/world';
import { rotatedCells, type Placement } from './placement';

export const CELL = 2; // metres per cell (kit-independent copy)
export type Cell = [number, number];
export interface PathResult { cells: Cell[]; cost: number; cum: number[] }
/** Metres per second by surface ('grass' is the default; add a surface by adding a key here, a Surface and a rule in sim/surfaces.ts). */
export type SpeedTable = Readonly<Record<string, number>>;
export type TileLookup = { has(key: string): boolean; get?(key: string): string | undefined };

export const WALKING: SpeedTable = balance.walking.speed;
const REF_SPEED = balance.walking.speed.grass;
const surfaceOf = (tiles: TileLookup, k: string): string => tiles.get?.(k) ?? (tiles.has(k) ? 'path' : 'grass');
const DIRS: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function findPath(w: World, tiles: TileLookup, from: Cell, to: Cell, speeds: SpeedTable = WALKING): PathResult | null {
  if (!isUnlocked(w, to[0], to[1]) || (!isFree(w, to[0], to[1]) && !(from[0] === to[0] && from[1] === to[1]))) return null;
  const step = (k: string) => REF_SPEED / (speeds[surfaceOf(tiles, k)] ?? speeds.grass);
  const hUnit = REF_SPEED / Math.max(...Object.values(speeds)); // admissible: fastest surface everywhere
  const h = (x: number, z: number) => (Math.abs(x - to[0]) + Math.abs(z - to[1])) * hUnit;
  interface N { x: number; z: number; g: number; f: number; n: number }
  let n = 0;
  const open = new MinHeap<N>((a, b) => a.f < b.f || (a.f === b.f && a.n < b.n));
  const best = new Map<string, number>(), prev = new Map<string, string>();
  const sk = cellKey(from[0], from[1]);
  best.set(sk, 0);
  open.push({ x: from[0], z: from[1], g: 0, f: h(from[0], from[1]), n: n++ });
  const tk = cellKey(to[0], to[1]);
  while (open.size) {
    const c = open.pop()!, ck = cellKey(c.x, c.z);
    if (c.g > (best.get(ck) ?? Infinity)) continue;
    if (ck === tk) {
      const cells: Cell[] = [];
      for (let k: string | undefined = tk; k !== undefined; k = prev.get(k)) {
        const [x, z] = k.split(',').map(Number); cells.push([x, z]);
      }
      cells.reverse();
      const cum = [0]; let acc = 0;
      for (let i = 1; i < cells.length; i++) {
        acc += step(cellKey(cells[i][0], cells[i][1]));
        cum.push(acc);
      }
      return { cells, cost: acc, cum: cum.map(v => (acc > 0 ? v / acc : 1)) };
    }
    for (const [dx, dz] of DIRS) {
      const x = c.x + dx, z = c.z + dz;
      if (!isUnlocked(w, x, z) || !isFree(w, x, z)) continue;
      const k = cellKey(x, z), g = c.g + step(k);
      if (g < (best.get(k) ?? Infinity)) {
        best.set(k, g); prev.set(k, ck);
        open.push({ x, z, g, f: g + h(x, z), n: n++ });
      }
    }
  }
  return null;
}

/** Seconds for a path cost (cost is in grass-walking cells, whatever the vehicle). */
export const travelTime = (cost: number): number => (cost * CELL) / REF_SPEED;

/** The free cell in front of a building (local +z rotated by its rotation), else any free neighbour. */
export function accessCell(w: World, p: Placement): Cell | null {
  const cells = rotatedCells(p.footprint, p.rotation, p.frame).map(([x, z]) => [x + p.origin[0], z + p.origin[1]] as Cell);
  const own = new Set(cells.map(([x, z]) => cellKey(x, z)));
  let d: Cell = [0, 1];
  for (let i = 0; i < ((p.rotation % 4) + 4) % 4; i++) d = [-d[1], d[0]];
  const ok = (x: number, z: number) => isUnlocked(w, x, z) && isFree(w, x, z) && !own.has(cellKey(x, z));
  const sort = (a: Cell, b: Cell) => a[0] - b[0] || a[1] - b[1];
  const front = cells.map(([x, z]) => [x + d[0], z + d[1]] as Cell).filter(([x, z]) => ok(x, z)).sort(sort);
  if (front.length) return front[0];
  const any = cells.flatMap(([x, z]) => DIRS.map(([dx, dz]) => [x + dx, z + dz] as Cell)).filter(([x, z]) => ok(x, z)).sort(sort);
  return any[0] ?? null;
}
