import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { DAY_LENGTH } from '../src/sim/clock';
import { step } from '../src/sim/economy';
import { advance, apply, createSim, snapshot, type SimState } from '../src/sim/sim';
import { claimJob, market, postJob } from '../src/sim/jobs';
import { deserialize, serialize } from '../src/systems/save';
import type { Building } from '../src/sim/state';

const roundTrip = (s: SimState) => deserialize(JSON.parse(JSON.stringify(serialize(s, 5))));
/** Crates of one crop anywhere: on plots, in market stock, in hands, plus those already sold. */
const crates = (sim: SimState, c: string) =>
  [...sim.buildings.values()].reduce((n, b) => n + (b.crateCrop === c ? (b.crates ?? 0) : 0) + (b.stock?.[c] ?? 0), 0)
  + [...sim.residents.values()].reduce((n, r) => n + (r.carryingCrop === c ? r.carrying : 0), 0);

/** A hauler next to the plot holding `carried` crates of `crop`; the market is removed so its walk fails and the job aborts. */
function scene(carried: number, crop: string, plotCrop: string, plotCrates: number) {
  const sim = createSim({ seed: 1 });
  apply(sim, { type: 'placeBuilding', building: 'market', rotation: 0, origin: [4, 0] });
  apply(sim, { type: 'placeBuilding', building: 'house', rotation: 0, origin: [0, 0] });
  const plotId = (apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [0, 6] }) as { id: number }).id;
  sim.t = DAY_LENGTH * 0.5; // work hours
  const plot = sim.buildings.get(plotId)!;
  plot.plotState = 'growing'; plot.crates = plotCrates;
  if (plotCrates) plot.crateCrop = plotCrop; else delete plot.crateCrop;
  const r = sim.residents.get(1)!;
  const job = postJob(sim, 'haul', plotId); job.pickedUp = true;
  claimJob(sim, job, r);
  r.stage = 1; r.carrying = carried; r.carryingCrop = crop; r.cell = [0, 5];
  const m = market(sim)!; sim.buildings.delete(m.id);
  return { sim, plot, r, m };
}
const rebuildMarket = (sim: SimState, m: Building) => { m.stock = {}; sim.buildings.set(m.id, m); };

describe('abort while carrying crates', () => {
  it('same crop and room: returns the crates to the plot', () => {
    const { sim, plot, r } = scene(1, 'carrot', 'carrot', 1);
    step(sim, r);
    expect(plot.crates).toBe(2); expect(plot.crateCrop).toBe('carrot');
    expect(r.carrying).toBe(0); expect(r.jobId).toBeNull();
  });
  it('plot has no crates: returns them under the carried label', () => {
    const { sim, plot, r } = scene(2, 'carrot', 'cabbage', 0);
    step(sim, r);
    expect(plot.crates).toBe(2); expect(plot.crateCrop).toBe('carrot');
  });
  it('different crop: never relabelled, the hauler keeps them for the market', () => {
    const { sim, plot, r } = scene(1, 'carrot', 'cabbage', 2);
    const before = { carrot: crates(sim, 'carrot'), cabbage: crates(sim, 'cabbage') };
    step(sim, r);
    expect(plot.crateCrop).toBe('cabbage'); expect(plot.crates).toBe(2);
    expect(r.carrying).toBe(1); expect(r.carryingCrop).toBe('carrot'); expect(r.jobId).not.toBeNull();
    expect({ carrot: crates(sim, 'carrot'), cabbage: crates(sim, 'cabbage') }).toEqual(before);
  });
  it('same crop but over the crate limit: keeps them instead of exceeding it', () => {
    const { sim, plot, r } = scene(2, 'carrot', 'carrot', balance.maxCrates - 1);
    step(sim, r);
    expect(plot.crates).toBe(balance.maxCrates - 1);
    expect(r.carrying).toBe(2); expect(r.carryingCrop).toBe('carrot');
  });
  it('market unreachable: retries every 60 s, then delivers under its own crop', () => {
    const { sim, plot, r, m } = scene(1, 'carrot', 'cabbage', 2);
    step(sim, r);
    expect(r.task).toMatchObject({ action: 'stand' }); expect(r.task!.end - sim.t).toBe(60);
    advance(sim, 130); // still no market: still holding, nothing relabelled
    expect(r.carrying).toBe(1); expect(plot.crateCrop).toBe('cabbage');
    rebuildMarket(sim, m);
    for (let i = 0; i < 400 && r.carrying; i++) advance(sim, 1);
    expect(r.carrying).toBe(0);
    expect(m.stock!.carrot).toBe(1); // stocked under its own crop (checked the moment it is dropped)
    expect(m.stock!.cabbage ?? 0).toBe(0);
  });
  it('is deterministic: big step = small steps, and a save round trip mid-way matches', () => {
    const run = () => { const s = scene(1, 'carrot', 'cabbage', 2); step(s.sim, s.r); rebuildMarket(s.sim, s.m); return s.sim; };
    const a = run(), b = run(), c = run();
    advance(a, 300);
    for (let i = 0; i < 300; i++) advance(b, 1);
    expect(snapshot(b)).toEqual(snapshot(a));
    advance(c, 100);
    const copy = roundTrip(c);
    advance(c, 200); advance(copy, 200);
    expect(snapshot(copy)).toEqual(snapshot(c));
    expect(snapshot(c)).toEqual(snapshot(a));
  });
  it('a save round trip while the hauler is holding crates keeps them', () => {
    const { sim, r } = scene(1, 'carrot', 'cabbage', 2);
    step(sim, r);
    const copy = roundTrip(sim);
    const cr = copy.residents.get(1)!;
    expect(cr.carrying).toBe(1); expect(cr.carryingCrop).toBe('carrot'); expect(cr.jobId).toBe(r.jobId);
  });
});
