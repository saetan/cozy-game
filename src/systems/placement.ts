// Placement rules: footprints, 90-degree rotation, validity and occupancy updates. Pure TS.
import { isFree, isUnlocked, occupy, release, type World } from '../sim/world';

export type Footprint = ReadonlyArray<readonly [number, number]>;
export type Rotation = 0 | 1 | 2 | 3;
/** Size [w, h] of a fixed local frame that a footprint is rotated inside (houses: bbox of all levels). */
export type Frame = readonly [number, number];
export interface Placement {
  id: number; origin: [number, number]; rotation: Rotation; footprint: Footprint;
  /** When set, rotation is done inside this frame (origin = frame corner), so the footprint can grow in place. */
  frame?: Frame;
}

/** Rotate local cells by r*90 degrees clockwise (seen from above, +x right, +z down), then
 *  normalise so the minimum x and z are 0 (the origin stays the footprint's top-left cell). */
export function rotateFootprint(fp: Footprint, r: number): [number, number][] {
  const turns = ((r % 4) + 4) % 4;
  let cells = fp.map(([x, z]) => [x, z] as [number, number]);
  for (let i = 0; i < turns; i++) cells = cells.map(([x, z]) => [-z, x]);
  const minX = Math.min(...cells.map(c => c[0])), minZ = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, z]) => [x - minX, z - minZ]);
}

/** Rotate cells inside a fixed w*h frame: the frame (not the cells) is normalised, so cells keep
 *  their place relative to the frame corner and never jump when more cells are added. */
export function rotateInFrame(fp: Footprint, frame: Frame, r: number): [number, number][] {
  const turns = ((r % 4) + 4) % 4;
  let cells = fp.map(([x, z]) => [x, z] as [number, number]);
  let h = frame[1];
  for (let i = 0; i < turns; i++) { const hh = h; cells = cells.map(([x, z]) => [hh - 1 - z, x]); h = i % 2 === 0 ? frame[0] : frame[1]; }
  return cells;
}
/** Frame size after r quarter turns. */
export const rotatedFrame = (frame: Frame, r: number): [number, number] =>
  (((r % 4) + 4) % 4) % 2 === 1 ? [frame[1], frame[0]] : [frame[0], frame[1]];

export const rotatedCells = (fp: Footprint, r: number, frame?: Frame): [number, number][] =>
  frame ? rotateInFrame(fp, frame, r) : rotateFootprint(fp, r);

export const worldCells = (fp: Footprint, r: number, ox: number, oz: number, frame?: Frame): [number, number][] =>
  rotatedCells(fp, r, frame).map(([x, z]) => [x + ox, z + oz]);

export const placementCells = (p: Placement): [number, number][] =>
  worldCells(p.footprint, p.rotation, p.origin[0], p.origin[1], p.frame);

export function canPlace(w: World, fp: Footprint, r: number, ox: number, oz: number, frame?: Frame): boolean {
  return worldCells(fp, r, ox, oz, frame).every(([x, z]) => isUnlocked(w, x, z) && isFree(w, x, z));
}

export function place(w: World, fp: Footprint, r: Rotation, ox: number, oz: number, frame?: Frame): Placement | null {
  if (!canPlace(w, fp, r, ox, oz, frame)) return null;
  const id = w.nextId++;
  for (const [x, z] of worldCells(fp, r, ox, oz, frame)) occupy(w, x, z, id);
  return frame ? { id, origin: [ox, oz], rotation: r, footprint: fp, frame } : { id, origin: [ox, oz], rotation: r, footprint: fp };
}

export function remove(w: World, p: Placement): void {
  for (const [x, z] of placementCells(p)) release(w, x, z);
}
