// Costs are resource maps ({ coins: n }) so wood etc. can be added later; only coins exist today.
import balance from '../data/balance.json';
import type { SimState } from './state';

export type Cost = Readonly<Record<string, number>>;
export type CostKey = keyof typeof balance.costs;

export const costOf = (k: CostKey): Cost => balance.costs[k];
export const canAfford = (sim: SimState, cost: Cost): boolean =>
  Object.entries(cost).every(([res, n]) => res === 'coins' && sim.coins >= n);
/** Deducts a cost; callers check canAfford first. */
export function spend(sim: SimState, cost: Cost): void {
  sim.coins -= cost.coins ?? 0;
}
export const scaleCost = (c: Cost, n: number): Cost =>
  Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v * n]));
