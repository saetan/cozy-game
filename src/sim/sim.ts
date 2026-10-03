// Public sim API: createSim, apply, advance, snapshot.
import balance from '../data/balance.json';
import { peekEvent, popEvent, sortedEvents } from './events';
import { handleEvent } from './economy';
import { newState, type SimState } from './state';
import { DAY_LENGTH } from './clock';
import type { WorldConfig } from './world';

export { apply } from './commands';
export { levelUpCheck } from './levels';
export type { Command, CommandResult } from './commands';
export type { SimState } from './state';

export function createSim(opts: { seed: number; worldConfig?: WorldConfig }): SimState {
  return newState(opts.seed, balance.startTimeOfDay * DAY_LENGTH, opts.worldConfig);
}

/** Jump from event to event up to t + dt. Result depends only on the target time, not on chunking. */
export function advance(sim: SimState, dt: number): void {
  const target = sim.t + dt;
  for (let e = peekEvent(sim.queue); e && e.time <= target; e = peekEvent(sim.queue)) {
    popEvent(sim.queue);
    sim.t = e.time;
    handleEvent(sim, e.event);
  }
  sim.t = target;
}

const sortBy = <T>(a: T[], f: (x: T) => string | number) => a.sort((x, y) => (f(x) < f(y) ? -1 : f(x) > f(y) ? 1 : 0));

/** JSON-serialisable view of the whole sim (used for equality in tests). */
export function snapshot(sim: SimState) {
  return JSON.parse(JSON.stringify({
    t: sim.t, rng: sim.rng, coins: sim.coins, unlockedCrops: sim.unlockedCrops, chunksBought: sim.chunksBought, stats: sim.stats,
    nextJobId: sim.nextJobId, nextResidentId: sim.nextResidentId, dispatchPending: sim.dispatchPending,
    world: {
      nextId: sim.world.nextId, unlocked: [...sim.world.unlocked].sort(),
      occupied: sortBy([...sim.world.occupied.entries()], e => e[0]),
    },
    tiles: [...sim.tiles.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    streets: [...sim.streets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    log: sim.log,
    buildings: [...sim.buildings.values()],
    residents: [...sim.residents.values()],
    jobs: [...sim.jobs.values()],
    events: sortedEvents(sim.queue),
  }));
}
