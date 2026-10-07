// The event log keeps only the most recent entries (balance.logCap). Readers: the away summary (reads what one catch-up added,
// before it trims), the notifications UI (follows the newest entry it has seen) and the save (writes the capped tail).
import balance from '../data/balance.json';
import type { LogEntry, SimState } from './state';

export const logCap = (): number => balance.logCap;
/** The newest logCap() entries. Trimming at any time gives the same tail, so when it runs never changes a result. */
export const logTail = (log: LogEntry[]): LogEntry[] => (log.length > logCap() ? log.slice(-logCap()) : log);
export function trimLog(sim: Pick<SimState, 'log'>): void { if (sim.log.length > logCap()) sim.log.splice(0, sim.log.length - logCap()); }
