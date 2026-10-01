// Human-readable "what is this resident doing" from sim state (pure; unit-tested).
import { isWorkHours } from '../sim/clock';
import { workDelay } from '../sim/traits';
import type { Resident, SimState } from '../sim/state';

const JOB_TEXT = { plant: 'Planting', water: 'Watering', harvest: 'Harvesting', haul: 'Hauling crates', sell: 'Selling at the market' } as const;

export function describeActivity(sim: SimState, r: Resident): string {
  const job = r.jobId !== null ? sim.jobs.get(r.jobId) : undefined;
  if (r.task?.kind === 'home') return 'Heading home';
  if (job && r.task?.kind === 'job') {
    if (r.task.path) return r.carrying ? 'Carrying crates to the market' : job.kind === 'sell' ? 'Walking to the market' : 'Walking to the field';
    return JOB_TEXT[job.kind];
  }
  return isWorkHours(sim.t, workDelay(r)) ? 'Waiting for work' : 'Resting at home';
}
export const ROLE_LABEL: Record<string, string> = { generalist: 'Generalist', farmer: 'Farmer', hauler: 'Hauler', seller: 'Seller' };
export const roleKey = (r: Resident): string => r.role ?? 'generalist';
