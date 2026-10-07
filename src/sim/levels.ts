// Shared level-up for buildings that grow in place (houses, market): per-level cells live in ONE fixed
// frame, so a building never shifts when it levels up and only its new cells must be free.
import { DEFAULTS } from './config';
import { placementCells, type Footprint, type Frame } from '../systems/placement';
import { isFree, isUnlocked } from './world';
import { streetAt } from './surfaces';
import { canAfford, type Cost } from './costs';
import { HOUSE_FRAME, HOUSE_MAX_LEVEL, houseCells } from './houses';
import type { BuildingType, Cell, SimState } from './state';

export interface LevelSpec { frame: Frame; max: number; cells(level: number): Footprint; cost(level: number): Cost }

export const MARKET_FRAME: Frame = DEFAULTS.market.frame as unknown as Frame;
export const MARKET_MAX_LEVEL: number = DEFAULTS.market.levels.length;
export const marketCells = (level: number): Footprint => DEFAULTS.market.levels[level - 1] as unknown as Footprint;

const SPECS: Partial<Record<BuildingType, LevelSpec>> = {
  house: { frame: HOUSE_FRAME, max: HOUSE_MAX_LEVEL, cells: houseCells, cost: l => DEFAULTS.houseLevelCosts[l - 1] },
  market: { frame: MARKET_FRAME, max: MARKET_MAX_LEVEL, cells: marketCells, cost: l => DEFAULTS.marketLevelCosts[l - 1] },
};
export const levelSpec = (t: BuildingType): LevelSpec | undefined => SPECS[t];

export type LevelUpReason = 'max level' | 'blocked' | 'not enough coins';
export interface LevelUpCheck { ok: boolean; cost: Cost; blockedCells: Cell[]; newCells: Cell[]; reason?: LevelUpReason }

/** Pure: can this building level up now, what does it cost, and which of its new cells are blocked. */
export function levelUpCheck(sim: SimState, id: number): LevelUpCheck {
  const b = sim.buildings.get(id), spec = b && levelSpec(b.type);
  if (!b || !spec || b.level >= spec.max) return { ok: false, cost: {}, blockedCells: [], newCells: [], reason: 'max level' };
  const cost = spec.cost(b.level);
  const p = b.placement;
  const next = placementCells({ ...p, footprint: spec.cells(b.level + 1) });
  const mine = new Set(placementCells(p).map(([x, z]) => `${x},${z}`));
  const newCells = next.filter(([x, z]) => !mine.has(`${x},${z}`));
  const blockedCells = newCells.filter(([x, z]) => !isUnlocked(sim.world, x, z) || !isFree(sim.world, x, z) || !!streetAt(sim, x, z));
  const reason: LevelUpReason | undefined = blockedCells.length ? 'blocked' : !canAfford(sim, cost) ? 'not enough coins' : undefined;
  return { ok: !reason, cost, blockedCells, newCells, ...(reason ? { reason } : {}) };
}
