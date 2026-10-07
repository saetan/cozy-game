import { describe, expect, it } from 'vitest';
import { advance, apply, createSim, snapshot } from '../src/sim/sim';
import { createGame, loadGame, saveGame } from '../src/game';
import { market } from '../src/sim/jobs';
import { catchUp, OFFLINE_CAP_SECONDS } from '../src/systems/catchup';
import { createMemoryStore, deserialize, migrate, SAVE_VERSION, SaveError, serialize } from '../src/systems/save';
import { shouldShowAway, summaryLines } from '../src/ui/away';
import type { Role } from '../src/sim/state';

function village() {
  const g = createGame(); const sim = g.sim; sim.coins = 1000;
  for (const o of [[-8, 0], [-8, 6], [-8, -6]] as [number, number][]) g.placeBuilding('house', 0, o);
  for (const x of [0, 2, 4, 6, 8, 10]) g.placeBuilding('farmPlot', 0, [x, 4]);
  g.apply({ type: 'levelUpHouse', houseId: 2 });
  const roles: Role[] = ['farmer', 'hauler', 'seller'];
  [...sim.residents.values()].forEach((r, i) => apply(sim, { type: 'setRole', residentId: r.id, role: roles[i] }));
  return sim;
}
const roundTrip = (data: ReturnType<typeof serialize>) => JSON.parse(JSON.stringify(data));

describe('save format', () => {
  it('round-trips a busy village through JSON', () => {
    const sim = village(); advance(sim, 777);
    expect(sim.queue.heap.size).toBeGreaterThan(3);
    expect(snapshot(deserialize(roundTrip(serialize(sim, 5))))).toEqual(snapshot(sim));
  });
  it('a loaded sim advances identically to the original', () => {
    const sim = village(); advance(sim, 500);
    const copy = deserialize(roundTrip(serialize(sim, 5)));
    advance(sim, 5000); advance(copy, 5000);
    expect(snapshot(copy)).toEqual(snapshot(sim));
    expect(sim.stats.sold).toBeGreaterThan(0);
  });
  it('rejects unknown versions and junk', () => {
    const d = serialize(createSim({ seed: 1 }));
    expect(() => deserialize({ ...d, version: 99 })).toThrow(/version/);
    expect(() => deserialize({} as never)).toThrow();
  });
  it('memory store saves, loads and clears', async () => {
    const s = createMemoryStore();
    expect(await s.load()).toBeNull();
    await s.save(serialize(createSim({ seed: 1 }), 42));
    expect((await s.load())!.savedAt).toBe(42);
    await s.clear(); expect(await s.load()).toBeNull();
  });
});

describe('catch-up', () => {
  it('caps at 8 h, reports deltas and the log slice', () => {
    const sim = village(); const t0 = sim.t, logN = sim.log.length;
    const a = catchUp(sim, 0, 20 * 3600 * 1000);
    expect(a.capped).toBe(true);
    expect(a.simSeconds).toBe(OFFLINE_CAP_SECONDS);
    expect(sim.t - t0).toBe(OFFLINE_CAP_SECONDS);
    expect(a.days).toBe(24);
    expect(a.stats.sold).toBeGreaterThan(0);
    expect(a.coins).toBeGreaterThan(0);
    expect(a.log).toEqual(sim.log.slice(logN));
  });
  it('uncapped, and negative elapsed does nothing', () => {
    const sim = village(); const t0 = sim.t;
    const a = catchUp(sim, 0, 3600 * 1000);
    expect(a.capped).toBe(false); expect(sim.t - t0).toBe(3600);
    const b = catchUp(sim, 10_000, 0);
    expect(b.simSeconds).toBe(0); expect(shouldShowAway(b)).toBe(false);
  });
  it('8 h for ~3 houses / 6 residents / 6 plots is fast', () => {
    const g = createGame(); const sim = g.sim; sim.coins = 5000;
    for (const o of [[-8, 0], [-8, 6], [-8, -6]] as [number, number][]) g.placeBuilding('house', 0, o);
    for (let i = 1; i <= 3; i++) { g.apply({ type: 'levelUpHouse', houseId: i + 1 }); g.apply({ type: 'levelUpHouse', houseId: i + 1 }); }
    for (const x of [0, 2, 4, 6, 8, 10]) g.placeBuilding('farmPlot', 0, [x, 4]);
    const t = performance.now();
    catchUp(sim, 0, 8 * 3600 * 1000);
    const ms = performance.now() - t;
    console.log(`8h catch-up: ${ms.toFixed(1)} ms with ${sim.residents.size} residents`);
    expect(ms).toBeLessThan(2000);
  });
});

describe('summaryLines', () => {
  it('lists the stats, capped note, arrivals and level-ups', () => {
    const sim = village();
    const a = catchUp(sim, 0, 20 * 3600 * 1000);
    sim.log.push({ t: sim.t, kind: 'levelUp', houseId: 2, level: 2 });
    a.log = [...a.log, sim.log[sim.log.length - 1]];
    const { title, lines } = summaryLines(a, sim);
    expect(title).toBe('While you were away (20h 0m)');
    expect(lines[0]).toBe('(capped at 8 h)');
    expect(lines).toContain(`Coins earned: ${a.coins}`);
    expect(lines).toContain('24 days passed');
    expect(lines.some(l => /^House grew to Lv 2/.test(l))).toBe(true);
  });
  it('names arrivals', () => {
    const sim = createSim({ seed: 1 }); const g = createGame({ sim }); g.placeBuilding('house', 0, [-8, 0]);
    const lines = summaryLines({ realSeconds: 90, simSeconds: 90, capped: false, days: 0, coins: 0, stats: { harvested: 0, delivered: 0, sold: 0, earned: 0 }, log: sim.log }, sim).lines;
    expect(lines.some(l => /moved in$/.test(l))).toBe(true);
  });
});

describe('loadGame', () => {
  it('no save -> new game with the market', async () => {
    const r = await loadGame(createMemoryStore(), 0);
    if (!r.ok) throw new Error('expected a game');
    const { game, away } = r;
    expect(away).toBeNull(); expect(market(game.sim)).toBeTruthy();
  });
  it('existing save -> restored, caught up, speed restored, market not doubled', async () => {
    const g = createGame(); g.sim.coins = 500; g.placeBuilding('house', 0, [-8, 0]); g.setSpeed(5);
    const store = createMemoryStore(); await saveGame(g, store, 1000);
    const t0 = g.sim.t;
    const r = await loadGame(store, 1000 + 120_000);
    if (!r.ok) throw new Error('expected a game');
    const { game, away } = r;
    expect(game.speed).toBe(5);
    expect([...game.sim.buildings.values()].filter(b => b.type === 'market')).toHaveLength(1);
    expect(game.sim.residents.size).toBe(1);
    expect(game.sim.t - t0).toBe(120);
    expect(away!.simSeconds).toBe(120);
  });
  it('a clearly-future version is reported as unsupported, and the stored save is left intact', async () => {
    const stored = { version: SAVE_VERSION + 995, savedAt: 7, sim: { whatever: 1 } } as never;
    const store = createMemoryStore(stored);
    const r = await loadGame(store, 0);
    expect(r).toMatchObject({ ok: false, reason: 'unsupported-version', data: stored });
    expect(r.ok === false && r.error).toBeInstanceOf(SaveError);
    expect(await store.load()).toEqual(stored);
  });
  it('a malformed save is reported as damaged, and the stored save is left intact', async () => {
    for (const stored of [{ version: SAVE_VERSION, savedAt: 0 }, { version: SAVE_VERSION, savedAt: 0, sim: { t: 0 } }] as never[]) {
      const store = createMemoryStore(stored);
      const r = await loadGame(store, 0);
      expect(r).toMatchObject({ ok: false, reason: 'damaged' });
      expect(await store.load()).toEqual(stored);
    }
  });
  it('migrate and deserialize throw a SaveError a caller can branch on', () => {
    expect(() => migrate({ version: 999, savedAt: 0, sim: {} as never })).toThrow(SaveError);
    expect(() => deserialize({} as never)).toThrow(expect.objectContaining({ reason: 'damaged' }));
  });
});
