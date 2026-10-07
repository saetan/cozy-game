// Offline catch-up: replays elapsed real time (capped) through the normal event sim at speed 1.
import { DEFAULTS } from '../sim/config';
import { advance } from '../sim/sim';
import { dayOf } from '../sim/clock';
import type { LogEntry, SimState, Stats } from '../sim/state';

export const OFFLINE_CAP_SECONDS = DEFAULTS.offlineCapHours * 3600;

export interface AwaySummary {
  realSeconds: number; simSeconds: number; capped: boolean; days: number;
  coins: number; stats: Stats; log: LogEntry[];
}

export function catchUp(sim: SimState, savedAt: number, now: number): AwaySummary {
  const realSeconds = Math.max(0, (now - savedAt) / 1000);
  const simSeconds = Math.min(realSeconds, OFFLINE_CAP_SECONDS);
  const before = { t: sim.t, coins: sim.coins, stats: { ...sim.stats }, log: sim.log.length };
  advance(sim, simSeconds);
  const d = (k: keyof Stats) => sim.stats[k] - before.stats[k];
  return {
    realSeconds, simSeconds, capped: realSeconds > OFFLINE_CAP_SECONDS,
    days: dayOf(sim.t) - dayOf(before.t), coins: sim.coins - before.coins,
    stats: { harvested: d('harvested'), delivered: d('delivered'), sold: d('sold'), earned: d('earned') },
    log: sim.log.slice(before.log),
  };
}

/** Real time (seconds) as "Xh Ym". */
export function formatAway(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
export const MIN_SUMMARY_SECONDS = 60;
