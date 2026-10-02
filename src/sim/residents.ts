// Resident creation and arrivals: names, species and traits all come from the sim RNG.
import balance from '../data/balance.json';
import { accessCell } from '../systems/pathfinding';
import { step } from './economy';
import { randInt, type Building, type Resident, type SimState, type TraitId } from './state';

function pickName(sim: SimState): string {
  const names = balance.names, used = new Set([...sim.residents.values()].map(r => r.name));
  const start = randInt(sim, names.length);
  for (let i = 0; i < names.length; i++) { const n = names[(start + i) % names.length]; if (!used.has(n)) return n; }
  return names[start];
}

/** Adds a resident living in `home`. Unspecified name/species/trait are drawn from the sim RNG. */
export function createResident(sim: SimState, home: Building, o: { name?: string; species?: string; trait?: TraitId } = {}): Resident | null {
  const cell = accessCell(sim.world, home.placement);
  if (!cell) return null;
  const id = sim.nextResidentId++;
  const species = o.species ?? balance.species[randInt(sim, balance.species.length)];
  const name = o.name ?? pickName(sim);
  const ids = Object.keys(balance.traits) as TraitId[];
  const trait = o.trait ?? ids[randInt(sim, ids.length)];
  const r: Resident = { id, name, species, trait, homeId: home.id, role: null, cell, task: null, token: 0, vehicle: null, jobId: null, stage: 0, carrying: 0 };
  sim.residents.set(id, r);
  step(sim, r);
  return r;
}

/** A resident moves in when a house reaches one of balance.arrivalLevels. */
export function arrive(sim: SimState, house: Building): void {
  const r = createResident(sim, house);
  if (r) sim.log.push({ t: sim.t, kind: 'arrival', residentId: r.id, houseId: house.id });
}
export const arrivesAt = (level: number): boolean => balance.arrivalLevels.includes(level);
