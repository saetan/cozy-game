// Vehicles: unlocked by house level, one of each per house (shared by its residents), claimed per walk leg.
import balance from '../data/balance.json';
import { findPath, WALKING, type Cell, type PathResult, type SpeedTable } from '../systems/pathfinding';
import type { Resident, SimState, VehicleKind } from './state';
import { surfaceLookup } from './surfaces';


export const VEHICLES = Object.keys(balance.vehicles) as VehicleKind[]; // tie-break order
export const vehicleInfo = (k: VehicleKind) => balance.vehicles[k] as { houseLevel: number; carry?: number; speed: SpeedTable };
export const unlockLevel = (k: VehicleKind): number => vehicleInfo(k).houseLevel;
export const isUnlocked = (houseLevel: number, k: VehicleKind): boolean => houseLevel >= unlockLevel(k);

/** True when a resident of this house is on the vehicle right now. */
export const inUse = (sim: SimState, houseId: number, k: VehicleKind): boolean =>
  [...sim.residents.values()].some(o => o.homeId === houseId && o.vehicle === k);

/** Vehicles a resident could take now: unlocked at their house and not claimed by a housemate. */
export function freeVehicles(sim: SimState, r: Resident): VehicleKind[] {
  const h = sim.buildings.get(r.homeId);
  return h ? VEHICLES.filter(k => isUnlocked(h.level, k) && !inUse(sim, h.id, k)) : [];
}

export interface Leg extends PathResult { vehicle: VehicleKind | null }
/** Fastest way for a resident to cover a leg: walking, or any free vehicle (ties: walk, then bicycle, wagon, car).
 *  `prefer` takes that vehicle whenever it is free, however slow. Null when unreachable. */
export function planLeg(sim: SimState, r: Resident, from: Cell, to: Cell, prefer?: VehicleKind): Leg | null {
  const walk = findPath(sim.world, surfaceLookup(sim), from, to, WALKING);
  if (!walk) return null;
  const free = freeVehicles(sim, r);
  const pref = prefer && free.includes(prefer) ? prefer : null;
  let best: Leg = { ...walk, vehicle: null };
  for (const k of pref ? [pref] : free) {
    const p = findPath(sim.world, surfaceLookup(sim), from, to, vehicleInfo(k).speed)!;
    if (pref || p.cost < best.cost) best = { ...p, vehicle: k };
  }
  return best;
}
