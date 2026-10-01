// Resident behaviour and the farm/haul/sell economy. Event-driven: one event per task end.
import balance from '../data/balance.json';
import { accessCell, findPath, travelTime } from '../systems/pathfinding';
import { isWorkHours, nextWorkEnd, nextWorkStart } from './clock';
import { pushEvent, type SimEvent } from './events';
import { claimJob, completeJob, market, pickJob, ROLE_OF, syncMarket, syncPlot } from './jobs';
import { carryCapacity, traitSpeed, workDelay } from './traits';
import type { Building, Cell, Job, Resident, SimState, Task } from './state';

type Op = { at: 'plot' | 'market'; action: Task['action']; time: keyof typeof balance.times; effect: string };
const PLANS: Record<Job['kind'], Op[]> = {
  plant: [{ at: 'plot', action: 'work', time: 'plant', effect: 'plant' }],
  water: [{ at: 'plot', action: 'water', time: 'water', effect: 'water' }],
  harvest: [{ at: 'plot', action: 'work', time: 'harvest', effect: 'harvest' }],
  haul: [{ at: 'plot', action: 'work', time: 'pickup', effect: 'pickup' },
         { at: 'market', action: 'work', time: 'drop', effect: 'drop' }],
  sell: [{ at: 'market', action: 'sell', time: 'sell', effect: 'sell' }],
};

function startTask(sim: SimState, r: Resident, task: Task): void {
  r.token++; r.task = task;
  pushEvent(sim.queue, task.end, { kind: 'resident', residentId: r.id, token: r.token });
}
function stand(sim: SimState, r: Resident, kind: Task['kind'], until: number): void {
  startTask(sim, r, { kind, action: 'stand', start: sim.t, end: until });
}
/** Begin walking to a cell; false if unreachable, 'here' if already there. */
function walk(sim: SimState, r: Resident, to: Cell, kind: Task['kind'], action: Task['action']): boolean | 'here' {
  if (r.cell[0] === to[0] && r.cell[1] === to[1]) return 'here';
  const p = findPath(sim.world, sim.tiles, r.cell, to);
  if (!p) return false;
  startTask(sim, r, { kind, action, path: p.cells, cum: p.cum, start: sim.t, end: sim.t + travelTime(p.cost) });
  return true;
}
const homeAccess = (sim: SimState, r: Resident): Cell | null => {
  const h = sim.buildings.get(r.homeId);
  return h ? accessCell(sim.world, h.placement) : null;
};

/** Decide what a resident does next (called whenever they are free). */
export function step(sim: SimState, r: Resident): void {
  const delay = workDelay(r);
  if (r.jobId === null && isWorkHours(sim.t, delay)) {
    const job = pickJob(sim, r);
    if (job) claimJob(sim, job, r);
  }
  if (r.jobId !== null) { runJob(sim, r); return; }
  if (isWorkHours(sim.t, delay)) { stand(sim, r, 'idle', nextWorkEnd(sim.t)); return; }
  const home = homeAccess(sim, r);
  if (home && walk(sim, r, home, 'home', 'walk') === true) return;
  stand(sim, r, 'idle', nextWorkStart(sim.t, delay));
}

function runJob(sim: SimState, r: Resident): void {
  const job = sim.jobs.get(r.jobId!)!;
  const plan = PLANS[job.kind];
  for (;;) {
    const op = plan[r.stage];
    if (!op) { completeJob(sim, r); finishSync(sim, job); step(sim, r); return; }
    const b = op.at === 'plot' ? sim.buildings.get(job.targetId) : market(sim);
    const to = b && accessCell(sim.world, b.placement);
    const w = to ? walk(sim, r, to, 'job', r.carrying ? 'carry' : 'walk') : false;
    if (w === true) return;
    if (w === false) { abort(sim, r, job); return; }
    // selling is open-ended, so it stops at work end instead of running all night
    if (op.effect === 'sell' && ((b!.stock ?? 0) <= 0 || !isWorkHours(sim.t))) { r.stage = plan.length; continue; }
    // specialist bonus and trait speed-ups stack multiplicatively
    const speed = (r.role === ROLE_OF[job.kind] ? balance.specialistMultiplier : 1) * traitSpeed(r, op.time);
    startTask(sim, r, { kind: 'job', action: op.action, start: sim.t, end: sim.t + balance.times[op.time] / speed });
    return;
  }
}
function abort(sim: SimState, r: Resident, job: Job): void {
  const plot = sim.buildings.get(job.targetId);
  if (r.carrying && plot) { plot.crates = (plot.crates ?? 0) + r.carrying; }
  r.carrying = 0;
  completeJob(sim, r);
  finishSync(sim, job);
  stand(sim, r, 'idle', sim.t + 60); // back off briefly instead of retrying a broken job in a loop
}
function finishSync(sim: SimState, job: Job): void {
  const b = sim.buildings.get(job.targetId);
  if (b?.type === 'farmPlot') syncPlot(sim, b);
  const m = market(sim); if (m) syncMarket(sim, m);
}

function applyEffect(sim: SimState, r: Resident, job: Job, effect: string): void {
  const b = sim.buildings.get(job.targetId);
  const plot = b?.type === 'farmPlot' ? b : undefined;
  const crop = balance.crops[(plot?.crop ?? balance.defaultCrop) as 'carrot'];
  switch (effect) {
    case 'plant':
      plot!.plotState = 'growing';
      pushEvent(sim.queue, sim.t + crop.growTime * balance.waterFraction, { kind: 'plot', plotId: plot!.id, stage: 'thirsty' });
      break;
    case 'water':
      plot!.plotState = 'watered';
      pushEvent(sim.queue, sim.t + crop.growTime * (1 - balance.waterFraction), { kind: 'plot', plotId: plot!.id, stage: 'ripe' });
      break;
    case 'harvest': plot!.plotState = 'empty'; plot!.crates = (plot!.crates ?? 0) + 1; sim.stats.harvested++; break;
    case 'pickup': {
      const n = 1 + pickupExtra(sim, plot!, job, carryCapacity(r) - 1);
      plot!.crates = (plot!.crates ?? 0) - n; job.pickedUp = true; r.carrying = n; break;
    }
    case 'drop': { const m = market(sim)!; m.stock = (m.stock ?? 0) + r.carrying; sim.stats.delivered += r.carrying; r.carrying = 0; break; }
    case 'sell': {
      const m = market(sim)!; m.stock = (m.stock ?? 0) - 1;
      const price = balance.crops[balance.defaultCrop as 'carrot'].price;
      sim.coins += price; sim.stats.sold++; sim.stats.earned += price; break;
    }
  }
}

/** Extra crates a Sturdy hauler can take from the same plot: only crates no other hauler has claimed.
 *  The matching unclaimed haul jobs are consumed so job count keeps equalling crate count. */
function pickupExtra(sim: SimState, plot: Building, own: Job, room: number): number {
  const hauls = [...sim.jobs.values()].filter(j => j.kind === 'haul' && j.targetId === plot.id && !j.pickedUp && j.id !== own.id);
  const spare = hauls.filter(j => j.claimedBy === null).sort((a, b) => a.id - b.id);
  const extra = Math.min(spare.length, (plot.crates ?? 0) - 1 - (hauls.length - spare.length), room);
  for (let i = 0; i < extra; i++) sim.jobs.delete(spare[i].id);
  return Math.max(0, extra);
}

function onResidentEvent(sim: SimState, r: Resident): void {
  const done = r.task;
  if (done?.path) r.cell = done.path[done.path.length - 1];
  r.task = null;
  if (done?.kind === 'job' && !done.path && r.jobId !== null) {
    // a work task finished (carry-walks have a path and are handled above)
    const job = sim.jobs.get(r.jobId)!;
    const op = PLANS[job.kind][r.stage];
    applyEffect(sim, r, job, op.effect);
    if (op.effect !== 'sell') r.stage++;
    finishSync(sim, job);
  }
  step(sim, r);
}

export function handleEvent(sim: SimState, ev: SimEvent): void {
  if (ev.kind === 'resident') {
    const r = sim.residents.get(ev.residentId);
    if (r && r.token === ev.token) onResidentEvent(sim, r);
  } else if (ev.kind === 'plot') {
    const p = sim.buildings.get(ev.plotId)!;
    p.plotState = ev.stage === 'thirsty' ? 'thirsty' : 'ripe';
    syncPlot(sim, p);
  } else {
    sim.dispatchPending = false;
    if (!isWorkHours(sim.t)) return;
    for (const r of sim.residents.values()) {
      if (r.jobId === null && (!r.task || r.task.kind === 'idle')) { r.task = null; step(sim, r); }
    }
  }
}
