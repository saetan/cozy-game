// Decor: shrub and fence are cosmetic; a scarecrow speeds up nearby plots (never stacking).
import { DEFAULTS } from './config';
import type { Building, BuildingType, SimState } from './state';

export const DECOR: readonly BuildingType[] = ['shrub', 'fence', 'scarecrow'];
export const isDecor = (t: BuildingType): boolean => DECOR.includes(t);

/** Grow-phase duration divisor for a plot: scarecrows within the radius (Chebyshev, in cells) give one x1.1 together. */
export function growthMultiplier(sim: SimState, plot: Building): number {
  const [px, pz] = plot.placement.origin;
  for (const b of sim.buildings.values()) {
    if (b.type !== 'scarecrow') continue;
    if (Math.max(Math.abs(b.placement.origin[0] - px), Math.abs(b.placement.origin[1] - pz)) <= DEFAULTS.scarecrow.radius) return DEFAULTS.scarecrow.growthMultiplier;
  }
  return 1;
}
