// House growth along the kit's fixed 7 levels. Cells come from data/houseLevels.json, expressed in ONE
// fixed frame (bbox of the union of all levels), so a house never shifts when it levels up.
import data from '../data/houseLevels.json';
import { placementCells, type Footprint, type Frame } from '../systems/placement';
import { isFree, isUnlocked } from './world';
import { canAfford, type Cost } from './costs';
import type { Cell, SimState } from './state';
import balance from '../data/balance.json';

export const HOUSE_FRAME: Frame = data.frame as unknown as Frame;
/** Local offset of the kit's level coordinates inside the frame (kit cell (0,0) is at this cell). */
export const HOUSE_OFFSET: readonly [number, number] = data.offset as unknown as [number, number];
export const HOUSE_MAX_LEVEL: number = data.levels.length;
export const houseCells = (level: number): Footprint => data.levels[level - 1] as unknown as Footprint;

export type LevelUpReason = 'max level' | 'blocked' | 'not enough coins';
export interface LevelUpCheck { ok: boolean; cost: Cost; blockedCells: Cell[]; newCells: Cell[]; reason?: LevelUpReason }

/** Pure: can this house level up now, what does it cost, and which of its new cells are blocked. */
export function levelUpCheck(sim: SimState, id: number): LevelUpCheck {
  const b = sim.buildings.get(id);
  if (!b || b.type !== 'house') return { ok: false, cost: {}, blockedCells: [], newCells: [], reason: 'max level' };
  if (b.level >= HOUSE_MAX_LEVEL) return { ok: false, cost: {}, blockedCells: [], newCells: [], reason: 'max level' };
  const cost = balance.houseLevelCosts[b.level - 1] as Cost;
  const p = b.placement;
  const next = placementCells({ ...p, footprint: houseCells(b.level + 1) });
  const mine = new Set(placementCells(p).map(([x, z]) => `${x},${z}`));
  const newCells = next.filter(([x, z]) => !mine.has(`${x},${z}`));
  const blockedCells = newCells.filter(([x, z]) => !isUnlocked(sim.world, x, z) || !isFree(sim.world, x, z));
  const reason: LevelUpReason | undefined = blockedCells.length ? 'blocked' : !canAfford(sim, cost) ? 'not enough coins' : undefined;
  return { ok: !reason, cost, blockedCells, newCells, ...(reason ? { reason } : {}) };
}
