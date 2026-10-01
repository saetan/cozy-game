// Job board: buildings post jobs, residents claim exactly one, release on completion.
import balance from '../data/balance.json';
import { accessCell, findPath } from '../systems/pathfinding';
import { pushEvent } from './events';
import type { Building, Cell, Job, JobKind, Resident, Role, SimState } from './state';

export const URGENCY: JobKind[] = ['sell', 'haul', 'harvest', 'water', 'plant'];
export const ROLE_OF: Record<JobKind, Role> = {
  sell: 'seller', haul: 'hauler', harvest: 'farmer', water: 'farmer', plant: 'farmer',
};

export const market = (sim: SimState): Building | undefined =>
  [...sim.buildings.values()].find(b => b.type === 'market');

export function postJob(sim: SimState, kind: JobKind, targetId: number): Job {
  const job: Job = { id: sim.nextJobId++, kind, targetId, claimedBy: null, pickedUp: false };
  sim.jobs.set(job.id, job);
  if (!sim.dispatchPending) { sim.dispatchPending = true; pushEvent(sim.queue, sim.t, { kind: 'dispatch' }); }
  return job;
}
export const claimJob = (sim: SimState, job: Job, r: Resident): void => { job.claimedBy = r.id; r.jobId = job.id; r.stage = 0; };
export const completeJob = (sim: SimState, r: Resident): void => {
  if (r.jobId !== null) sim.jobs.delete(r.jobId);
  r.jobId = null; r.stage = 0;
};

const hasJob = (sim: SimState, kind: JobKind, targetId: number) =>
  [...sim.jobs.values()].some(j => j.kind === kind && j.targetId === targetId);

/** Idempotently post whatever jobs a farm plot currently needs. */
export function syncPlot(sim: SimState, plot: Building): void {
  const crates = plot.crates ?? 0, room = crates < balance.maxCrates;
  const want: JobKind | null =
    plot.plotState === 'empty' && room ? 'plant' :
    plot.plotState === 'thirsty' ? 'water' :
    plot.plotState === 'ripe' && room ? 'harvest' : null;
  if (want && !hasJob(sim, want, plot.id)) postJob(sim, want, plot.id);
  let pending = [...sim.jobs.values()].filter(j => j.kind === 'haul' && j.targetId === plot.id && !j.pickedUp).length;
  while (pending < crates) { postJob(sim, 'haul', plot.id); pending++; }
}
export function syncMarket(sim: SimState, m: Building): void {
  if ((m.stock ?? 0) > 0 && !hasJob(sim, 'sell', m.id)) postJob(sim, 'sell', m.id);
}

/** Walk cost from a resident's cell to a job's first target, or null if the job is unreachable. */
export function jobCost(sim: SimState, r: Resident, job: Job): number | null {
  const target = sim.buildings.get(job.targetId);
  if (!target) return null;
  const a = accessCell(sim.world, target.placement);
  if (!a) return null;
  const leg = findPath(sim.world, sim.paths, r.cell, a);
  if (!leg) return null;
  if (job.kind === 'haul') {
    const m = market(sim), b = m && accessCell(sim.world, m.placement);
    if (!b || !findPath(sim.world, sim.paths, a, b)) return null;
  }
  return leg.cost;
}

/** Best open job for a resident: role first, then any; urgency, then nearest, then lowest id. */
export function pickJob(sim: SimState, r: Resident): Job | null {
  const open = [...sim.jobs.values()].filter(j => j.claimedBy === null);
  const mine = r.role ? open.filter(j => ROLE_OF[j.kind] === r.role) : [];
  for (const pool of r.role ? [mine, open] : [open]) {
    for (const kind of URGENCY) {
      let best: Job | null = null, bestCost = Infinity;
      for (const j of pool) {
        if (j.kind !== kind) continue;
        const c = jobCost(sim, r, j);
        if (c === null) continue;
        if (c < bestCost || (c === bestCost && best && j.id < best.id)) { best = j; bestCost = c; }
      }
      if (best) return best;
    }
  }
  return null;
}
export type { Cell };
