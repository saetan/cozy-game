// Placement rules: footprints, 90-degree rotation, validity and occupancy updates. Pure TS.
import { isFree, isUnlocked, occupy, release, type World } from '../sim/world';

export type Footprint = ReadonlyArray<readonly [number, number]>;
export type Rotation = 0 | 1 | 2 | 3;
export interface Placement { id: number; origin: [number, number]; rotation: Rotation; footprint: Footprint }

/** Rotate local cells by r*90 degrees clockwise (seen from above, +x right, +z down), then
 *  normalise so the minimum x and z are 0 (the origin stays the footprint's top-left cell). */
export function rotateFootprint(fp: Footprint, r: number): [number, number][] {
  const turns = ((r % 4) + 4) % 4;
  let cells = fp.map(([x, z]) => [x, z] as [number, number]);
  for (let i = 0; i < turns; i++) cells = cells.map(([x, z]) => [-z, x]);
  const minX = Math.min(...cells.map(c => c[0])), minZ = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, z]) => [x - minX, z - minZ]);
}

export const worldCells = (fp: Footprint, r: number, ox: number, oz: number): [number, number][] =>
  rotateFootprint(fp, r).map(([x, z]) => [x + ox, z + oz]);

export function canPlace(w: World, fp: Footprint, r: number, ox: number, oz: number): boolean {
  return worldCells(fp, r, ox, oz).every(([x, z]) => isUnlocked(w, x, z) && isFree(w, x, z));
}

let nextId = 1;
export function place(w: World, fp: Footprint, r: Rotation, ox: number, oz: number): Placement | null {
  if (!canPlace(w, fp, r, ox, oz)) return null;
  const id = nextId++;
  for (const [x, z] of worldCells(fp, r, ox, oz)) occupy(w, x, z, id);
  return { id, origin: [ox, oz], rotation: r, footprint: fp };
}

export function remove(w: World, p: Placement): void {
  for (const [x, z] of worldCells(p.footprint, p.rotation, p.origin[0], p.origin[1])) release(w, x, z);
}
