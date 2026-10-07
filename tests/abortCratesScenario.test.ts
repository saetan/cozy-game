import { describe, expect, it } from 'vitest';
import { advance, apply, createSim, type SimState } from '../src/sim/sim';
import type { Building } from '../src/sim/state';

const place = (sim: SimState, building: 'market' | 'house' | 'farmPlot' | 'fence', origin: [number, number]) =>
  apply(sim, { type: 'placeBuilding', building, rotation: 0, origin }) as { ok: boolean; id: number };
const until = (sim: SimState, cond: () => boolean, max = 8000) => { for (let i = 0; i < max && !cond(); i++) advance(sim, 0.5); expect(cond()).toBe(true); };
/** A fence on every free cell around the market, so no walk can reach it. */
function wallOff(sim: SimState, m: Building) {
  const [ox, oz] = m.placement.origin;
  for (let x = ox - 1; x <= ox + 2; x++) for (let z = oz - 1; z <= oz + 2; z++) place(sim, 'fence', [x, z]);
}
/** Crates of one crop on plots, in hands and in market stock. */
const perCrop = (sim: SimState, c: string) =>
  [...sim.buildings.values()].reduce((n, b) => n + (b.crateCrop === c ? (b.crates ?? 0) : 0) + (b.stock?.[c] ?? 0), 0)
  + [...sim.residents.values()].reduce((n, r) => n + (r.carryingCrop === c ? r.carrying : 0), 0);

describe('stale harvest after an aborted haul (commands only)', () => {
  it('never turns carrots into cabbage and keeps per-crop totals', () => {
    const sim = createSim({ seed: 1 });
    place(sim, 'house', [0, 0]);
    const plot = sim.buildings.get(place(sim, 'farmPlot', [0, 6]).id)!;
    sim.coins = 10000;
    apply(sim, { type: 'unlockCrop', crop: 'cabbage' });
    const r = sim.residents.get(1)!;
    until(sim, () => plot.crates === 1); // 1 carrot crate; no market yet, so nobody hauls it
    expect(plot.crateCrop).toBe('carrot');
    apply(sim, { type: 'setCrop', plotId: plot.id, crop: 'cabbage' });
    until(sim, () => plot.plotState === 'ripe' && plot.growCrop === 'cabbage');
    const m = sim.buildings.get(place(sim, 'market', [4, 0]).id)!;
    until(sim, () => r.jobId !== null && sim.jobs.get(r.jobId)!.kind === 'haul' && r.stage === 0 && !!r.task?.path);
    wallOff(sim, m);
    advance(sim, 600);
    expect(sim.stats.harvested).toBe(perCrop(sim, 'carrot') + perCrop(sim, 'cabbage'));
    expect(plot.crates ?? 0).toBeLessThanOrEqual(3);
    expect(perCrop(sim, 'carrot')).toBe(1);
    expect(perCrop(sim, 'cabbage')).toBe(0);
  });
});
