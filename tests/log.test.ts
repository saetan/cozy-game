import { afterEach, describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { advance, apply, createSim, snapshot } from '../src/sim/sim';
import { createGame } from '../src/game';
import { logCap, trimLog } from '../src/sim/log';
import { catchUp } from '../src/systems/catchup';
import { deserialize, serialize } from '../src/systems/save';
import type { Role } from '../src/sim/state';

const original = balance.logCap;
afterEach(() => { balance.logCap = original; });

function village() {
  const g = createGame(); const sim = g.sim; sim.coins = 5000;
  for (const o of [[-8, 0], [-8, 6], [-8, -6]] as [number, number][]) g.placeBuilding('house', 0, o);
  for (const x of [0, 2, 4, 6, 8, 10]) g.placeBuilding('farmPlot', 0, [x, 4]);
  for (const id of [2, 3, 4]) { g.apply({ type: 'levelUpHouse', houseId: id }); g.apply({ type: 'levelUpHouse', houseId: id }); }
  const roles: Role[] = ['farmer', 'hauler', 'seller'];
  [...sim.residents.values()].forEach((r, i) => apply(sim, { type: 'setRole', residentId: r.id, role: roles[i % 3] }));
  return { g, sim };
}
const entry = (t: number) => ({ t, kind: 'levelUp' as const, houseId: 2, level: 2 });

describe('event log cap', () => {
  it('the log never exceeds the cap while the game runs frame by frame (fails if the cap is removed)', () => {
    balance.logCap = 2;
    const { g, sim } = village();
    for (let i = 0; i < 5; i++) { sim.log.push(entry(i)); g.frame(0.1); expect(sim.log.length).toBeLessThanOrEqual(2); }
    expect(sim.log.at(-1)!.t).toBe(4);
  });
  it('a save written before the cap, with an oversized log, loads capped and keeps the newest entries', () => {
    const sim = createSim({ seed: 1 });
    const data = JSON.parse(JSON.stringify(serialize(sim, 0)));
    data.sim.log = Array.from({ length: 500 }, (_, i) => entry(i));
    const loaded = deserialize(data);
    expect(loaded.log).toHaveLength(logCap());
    expect(loaded.log.at(-1)!.t).toBe(499);
    for (let i = 0; i < 500; i++) sim.log.push(entry(i));
    expect(serialize(sim, 0).sim.log).toHaveLength(logCap());
  });
  it('trimming at different moments agrees: big step, small steps, save round trip', () => {
    balance.logCap = 3;
    const a = village().sim, b = village().sim;
    advance(a, 20000); // never trimmed during the run
    for (let i = 0; i < 2000; i++) { advance(b, 10); trimLog(b); }
    expect(snapshot(b)).toEqual(snapshot(a));
    expect(snapshot(deserialize(JSON.parse(JSON.stringify(serialize(a, 1)))))).toEqual(snapshot(a));
    expect(snapshot(a).log.length).toBeLessThanOrEqual(3);
  });
});
