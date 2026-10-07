// Surfaces and road rules. One source of truth: `sim.streets` (6 m tiles, 'i,j') + `sim.tiles` (1-cell tiles, 'x,z').
// `surfaceAt` is the only place that turns those into a Surface; pathfinding, speeds and rules all go through it.
// Pure TS, no three.js.
import { cellKey } from './world';
import type { Cell, SimState, StreetKind, Surface, TileKind } from './state';

/** Cells per street tile side (kit TILE = 6 m = 3 house cells). */
export const STREET_CELLS = 3;
export type Side = 'N' | 'E' | 'S' | 'W';
export const SIDES: Record<Side, readonly [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPP: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' };

export const streetKey = (i: number, j: number) => `${i},${j}`;
/** Street tile covering a cell (floor division, so negatives work). */
export const streetTileOf = (x: number, z: number): Cell => [Math.floor(x / STREET_CELLS), Math.floor(z / STREET_CELLS)];
/** The 9 cells of a street tile, row by row. */
export function streetTileCells(i: number, j: number): Cell[] {
  const out: Cell[] = [];
  for (let dz = 0; dz < STREET_CELLS; dz++) for (let dx = 0; dx < STREET_CELLS; dx++) out.push([i * STREET_CELLS + dx, j * STREET_CELLS + dz]);
  return out;
}

export const streetAt = (sim: Pick<SimState, 'streets'>, x: number, z: number): StreetKind | undefined =>
  sim.streets.get(streetKey(...streetTileOf(x, z)));

const SURFACE_OF_STREET: Record<StreetKind, Surface> = { road: 'street', dirt: 'dirtRoad' };
export function surfaceAt(sim: Pick<SimState, 'streets' | 'tiles'>, x: number, z: number): Surface {
  const s = streetAt(sim, x, z);
  if (s) return SURFACE_OF_STREET[s];
  return sim.tiles.get(cellKey(x, z)) ?? 'grass';
}

const parseCell = (k: string): Cell => { const c = k.indexOf(','); return [Number(k.slice(0, c)), Number(k.slice(c + 1))]; };
/** A TileLookup for findPath: the key is a cell key, the answer a Surface. */
export function surfaceLookup(sim: Pick<SimState, 'streets' | 'tiles'>) {
  return {
    surface: (x: number, z: number): string => surfaceAt(sim, x, z),
    has: (k: string) => surfaceAt(sim, ...parseCell(k)) !== 'grass',
    get: (k: string): string => surfaceAt(sim, ...parseCell(k)),
  };
}

/** Which sides of a street tile have another street tile next to them (the kit's auto-tiling connections). */
export function streetConn(streets: ReadonlyMap<string, StreetKind>, i: number, j: number): Record<Side, boolean> {
  const c = {} as Record<Side, boolean>;
  for (const s of Object.keys(SIDES) as Side[]) c[s] = streets.has(streetKey(i + SIDES[s][0], j + SIDES[s][1]));
  return c;
}
/** A bend: exactly two connections, on adjacent sides (the kit draws it as a curve). */
export function isBend(c: Record<Side, boolean>): boolean {
  const on = (Object.keys(c) as Side[]).filter(s => c[s]);
  return on.length === 2 && OPP[on[0]] !== on[1];
}

export const isLane = (k: TileKind | undefined): boolean => k === 'lane' || k === 'dirtLane';

/**
 * Lane-to-street join rule. A lane cell may only touch a 6 m tile (street or dirt road) on a flat edge, as the kit
 * draws it: the touched side must be a plain edge (a connection to another tile is a junction arm) and the tile must
 * not be a bend (its outer sides are curved, with no room for a lane mouth). Returns the first violation, or null when every lane join is valid.
 */
export function laneJoinProblem(streets: ReadonlyMap<string, StreetKind>, tiles: ReadonlyMap<string, TileKind>): string | null {
  for (const [k, kind] of tiles) {
    if (!isLane(kind)) continue;
    const [x, z] = parseCell(k);
    if (streets.has(streetKey(...streetTileOf(x, z)))) continue; // the lane cell itself sits in a street: the caller replaces it
    for (const s of Object.keys(SIDES) as Side[]) {
      const [i, j] = streetTileOf(x + SIDES[s][0], z + SIDES[s][1]), t = streets.get(streetKey(i, j));
      if (!t) continue;
      const conn = streetConn(streets, i, j); // the lane touches tile (i, j) on that tile's side OPP[s]
      if (conn[OPP[s]]) return 'a lane cannot join a street at a junction arm';
      if (isBend(conn)) return 'a lane cannot join the outer corner of a street bend';
    }
  }
  return null;
}
