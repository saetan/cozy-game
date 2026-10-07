import { afterEach, describe, expect, it, vi } from 'vitest';
import balance from '../src/data/balance.json';
import { createSim } from '../src/sim/sim';
import { catchUp } from '../src/systems/catchup';

// Nothing in the sim adds log entries on its own today (only commands do), so a catch-up that produces many is simulated by a
// stand-in advance that adds one entry per simulated hour, which is what a future event-driven entry would do.
vi.mock('../src/sim/sim', async importOriginal => {
  const real = await importOriginal<typeof import('../src/sim/sim')>();
  return { ...real, advance: (sim: import('../src/sim/state').SimState, to: number) => { for (let i = 0; i < to / 3600; i++) sim.log.push({ t: i, kind: 'levelUp', houseId: 1, level: 2 }); real.advance(sim, to); } };
});

const original = balance.logCap;
afterEach(() => { balance.logCap = original; });

describe('away summary and the log cap', () => {
  it('lists every entry of an 8 h catch-up that adds more than the cap, then trims the log', () => {
    const sim = createSim({ seed: 1 });
    balance.logCap = 3;
    const a = catchUp(sim, 0, 8 * 3600 * 1000);
    expect(a.log.map(e => e.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(sim.log.map(e => e.t)).toEqual([5, 6, 7]);
  });
});
