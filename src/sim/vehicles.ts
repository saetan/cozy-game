// Vehicles: unlocked by house level, one of each per house (shared by its residents), claimed per walk leg.
import { DEFAULTS } from './config';
import { costOfSeconds, findPath, WALKING, type Cell, type PathResult, type SpeedTable } from '../systems/pathfinding';
import type { Resident, SimState, VehicleKind } from './state';
import { surfaceLookup } from './surfaces';
import { pathUntilStop, planEntry, type Entry } from './traffic';


export const VEHICLES = Object.keys(DEFAULTS.vehicles) as VehicleKind[]; // tie-break order
export const vehicleInfo = (k: VehicleKind) => DEFAULTS.vehicles[k] as { houseLevel: number; carry?: number; speed: SpeedTable };
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

export interface Leg extends PathResult { vehicle: VehicleKind | null; entry?: Entry }
/** Fastest way for a resident to cover a leg: walking, or any free vehicle (ties: walk, then bicycle, wagon, car).
 *  `prefer` takes that vehicle whenever it is free, however slow. Lane traffic (sim/traffic.ts) may make a vehicle wait at
 *  a lane entrance: the leg is then cut short at that cell (`entry.kind === 'wait'`) and the wait counts against the vehicle.
 *  Null when unreachable. */
export function planLeg(sim: SimState, r: Resident, from: Cell, to: Cell, prefer?: VehicleKind): Leg | null {
  const walk = findPath(sim.world, surfaceLookup(sim), from, to, WALKING);
  if (!walk) return null;
  const options: { leg: Leg; cost: number }[] = [];
  for (const k of freeVehicles(sim, r)) {
    const p = findPath(sim.world, surfaceLookup(sim), from, to, vehicleInfo(k).speed)!;
    const entry = planEntry(sim, k, p, sim.t);
    let cost = p.cost;
    if (entry.kind === 'wait') {
      if (entry.whenBusy === 'waitOrWalk') { if (entry.waitSeconds > entry.maxWaitSeconds) continue; cost += costOfSeconds(entry.waitSeconds); }
      options.push({ leg: { ...pathUntilStop(p, entry.stop), vehicle: k, entry }, cost });
    } else options.push({ leg: { ...p, vehicle: k, entry }, cost });
  }
  const pref = prefer && options.find(o => o.leg.vehicle === prefer);
  if (pref) return pref.leg;
  let best: Leg = { ...walk, vehicle: null }, bestCost = walk.cost;
  for (const o of options) if (o.cost < bestCost) { best = o.leg; bestCost = o.cost; }
  return best;
}
