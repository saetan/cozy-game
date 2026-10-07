import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import houseLevels from '../src/data/houseLevels.json';
import trafficSrc from '../src/sim/traffic.ts?raw';
import {
  MAX_HOUSE_LEVEL, SCHEMA, VEHICLES, WHEN_BUSY, checkChange, checkConfig, checkConfigWhole, configEntries, entriesFor, leaves,
} from '../src/sim/configSchema';

const clone = () => JSON.parse(JSON.stringify(balance));
const all = leaves(balance);

describe('schema coverage', () => {
  it('every leaf of balance.json matches exactly one schema entry', () => {
    expect(all.length).toBeGreaterThan(100);
    for (const [path] of all) expect(entriesFor(path).map(e => e.pattern), path).toHaveLength(1);
  });
  it('every schema entry matches at least one leaf', () => {
    for (const e of SCHEMA) {
      expect(all.some(([p]) => entriesFor(p)[0] === e), e.pattern).toBe(true);
    }
  });
  it('the shipped defaults pass the cross-field checks', () => {
    expect(checkConfigWhole(balance)).toEqual([]);
  });
  it('configEntries lists every leaf once, stably, grouped, with the wired flag', () => {
    const rows = configEntries(balance);
    expect(rows.map(r => r.path).sort()).toEqual(all.map(([p]) => p).sort());
    expect(configEntries(balance)).toEqual(rows);
    const order = rows.map(r => r.group);
    expect(order).toEqual([...order].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(rows.find(r => r.path === 'traffic.lane.capacity')).toMatchObject({ kind: 'integer', min: 1, max: 20, nullable: true, group: 'traffic', class: 'live', wired: false });
    expect(rows.find(r => r.path === 'defaultCrop')!.options).toEqual(Object.keys(balance.crops));
  });
});

describe('pinned copies of data', () => {
  it('MAX_HOUSE_LEVEL equals the house levels data', () => expect(MAX_HOUSE_LEVEL).toBe(houseLevels.levels.length));
  it('VEHICLES equals the vehicles in balance.json', () => expect([...VEHICLES].sort()).toEqual(Object.keys(balance.vehicles).sort()));
  it('WHEN_BUSY equals what traffic.ts handles', () => {
    const m = /type WhenBusy = ([^;]+);/.exec(trafficSrc)!;
    expect([...m[1].matchAll(/'(\w+)'/g)].map(x => x[1]).sort()).toEqual([...WHEN_BUSY].sort());
  });
});

describe('wired set', () => {
  it('no key is wired yet, so every change is refused in live mode', () => {
    expect(checkConfig(balance, 'traffic.lane.capacity', 2, 'live')).toEqual({ ok: false, reason: 'traffic.lane.capacity: not adjustable in this build yet' });
    expect(configEntries(balance).some(r => r.wired)).toBe(false);
    expect(checkConfig(balance, 'traffic.lane.capacity', 2, 'live', ['traffic.*.capacity'])).toEqual({ ok: true });
    expect(checkConfig(balance, 'traffic.lane.whenBusy', 'wait', 'live', ['traffic.*.capacity']).ok).toBe(false);
    expect(configEntries(balance, ['traffic.*.capacity']).filter(r => r.wired).map(r => r.path)).toEqual(['traffic.lane.capacity', 'traffic.dirtLane.capacity']);
  });
});

describe('checkConfig and checkChange (every key treated as wired)', () => {
  const ok = (p: string, v: unknown, mode: 'live' | 'newVillage' = 'live') => expect(checkConfig(balance, p, v, mode, 'all'), `${p}=${JSON.stringify(v)}`).toEqual({ ok: true });
  const no = (p: unknown, v: unknown, mode: 'live' | 'newVillage' = 'live') => expect(checkConfig(balance, p, v, mode, 'all').ok, `${String(p)}=${JSON.stringify(v)}`).toBe(false);

  it('the shipped defaults pass for every non-fixed key (newVillage keys in newVillage mode)', () => {
    for (const [path, v] of all) {
      const cls = entriesFor(path)[0].class;
      if (cls === 'fixed') no(path, v);
      else ok(path, v, cls === 'newVillage' ? 'newVillage' : 'live');
    }
  });
  it('integer with nullable: boundaries and null', () => {
    ok('traffic.lane.capacity', 1); ok('traffic.lane.capacity', 20); ok('traffic.dirtLane.capacity', null);
    no('traffic.lane.capacity', 0); no('traffic.lane.capacity', 21); no('traffic.lane.capacity', 1.5);
    no('traffic.lane.capacity', '2'); no('traffic.lane.capacity', NaN); no('traffic.lane.capacity', -0);
  });
  it('number: boundaries, null refused when not nullable', () => {
    ok('vehicles.car.speed.street', 0.5); ok('vehicles.car.speed.street', 50);
    no('vehicles.car.speed.street', 0.4); no('vehicles.car.speed.street', 0); no('vehicles.car.speed.street', -1); no('vehicles.car.speed.street', Infinity);
    ok('times.sell', 0.1); no('times.sell', 0); no('times.sell', 61); no('walking.speed.grass', null);
  });
  it('the decided bounds', () => {
    ok('crops.carrot.growTime', 20000); no('crops.carrot.growTime', 20001);
    ok('offlineCapHours', 48); no('offlineCapHours', 49);
    ok('specialistMultiplier', 1); no('specialistMultiplier', 0.9); ok('specialistMultiplier', 5); no('specialistMultiplier', 5.1);
    ok('scarecrow.growthMultiplier', 1); no('scarecrow.growthMultiplier', 0.9);
    ok('traits.chatty.speed.sell', 0.5); no('traits.chatty.speed.sell', 0.4); no('traits.chatty.speed.sell', 5.1);
    ok('abortRetrySeconds', 5); no('abortRetrySeconds', 4.9); ok('abortRetrySeconds', 60); no('abortRetrySeconds', 601);
  });
  it('fraction: 0 to 1, and tighter bounds where zero or one break things', () => {
    ok('workStart', 0); ok('workStart', 1); no('workStart', 1.01); no('workStart', -0.01);
    ok('waterFraction', 0.05); no('waterFraction', 0); no('waterFraction', 1);
  });
  it('option, list and crop options', () => {
    ok('traffic.lane.whenBusy', 'wait'); no('traffic.lane.whenBusy', 'dance'); no('traffic.lane.whenBusy', 3);
    ok('traffic.lane.appliesTo', []); ok('traffic.lane.appliesTo', ['car', 'bicycle']);
    no('traffic.lane.appliesTo', ['plane']); no('traffic.lane.appliesTo', 'car'); no('traffic.lane.appliesTo', ['car', 'car']);
    // eslint-disable-next-line no-sparse-arrays
    no('traffic.lane.appliesTo', [, 'car']);
    ok('defaultCrop', 'wheat', 'newVillage'); no('defaultCrop', 'kale', 'newVillage');
  });
  it('a newVillage key is refused in live mode with its reason', () => {
    const r = checkConfig(balance, 'dayLength', 600, 'live');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^dayLength: only for a new village \(/);
    ok('dayLength', 600, 'newVillage'); ok('startingCoins', 0, 'newVillage'); ok('maxCrates', 3);
  });
  it('wildcards cover every existing crop, vehicle, trait and index', () => {
    ok('crops.pumpkin.growTime', 100); ok('houseLevelCosts.5.coins', 0); ok('traits.chatty.speed.sell', 2);
    no('crops.pumpkin.price', 0); no('vehicles.wagon.carry', 0);
  });
  it('refuses paths that are not an own leaf of the config', () => {
    for (const p of ['crops.kale.growTime', 'traits.ghost.carry', 'vehicles.tank.houseLevel', 'walking.speed.lava', 'times.dance', 'times.',
      'costs.unicorn.coins', 'arrivalLevels.3', 'arrivalLevels.99', 'arrivalLevels.-1', 'arrivalLevels.length', 'arrivalLevels.01', 'houseLevelCosts.6.coins',
      'traffic.__proto__.capacity', 'costs.__proto__.coins', 'costs.constructor.coins', 'traffic.lane.prototype', 'traffic.lane.colour', 'nope', 'crops.carrot', 'crops.carrot.growTime.x', ''])
      no(p, 1);
    expect(checkConfig(balance, 'times.dance', 1, 'live')).toEqual({ ok: false, reason: 'times.dance: unknown setting' });
  });
  it('refuses a non-string path without throwing', () => {
    for (const p of [undefined, null, 5, {}, ['times', 'sell']]) no(p, 1);
  });
  it('refuses fixed paths with the reason', () => {
    const r = checkConfig(balance, 'market.frame.0', 4, 'live');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^market\.frame\.0: fixed, edit src\/data\/balance\.json \(/);
    no('species.0', 'dog'); no('traits.sleepy.name', 'x');
  });
  it('exact refusal text', () => {
    expect(checkConfig(balance, 'traffic.lane.capacity', 0, 'live', 'all')).toEqual({ ok: false, reason: 'traffic.lane.capacity: whole number 1 to 20, or null' });
    expect(checkConfig(balance, 'walking.speed.grass', -1, 'live', 'all')).toEqual({ ok: false, reason: 'walking.speed.grass: number 0.5 to 50' });
    expect(checkConfig(balance, 'traffic.lane.whenBusy', 'x', 'live', 'all')).toEqual({ ok: false, reason: 'traffic.lane.whenBusy: one of wait, waitOrWalk, ignore' });
    expect(checkConfig(balance, 'waterFraction', 1, 'live', 'all')).toEqual({ ok: false, reason: 'waterFraction: number 0.05 to 0.95' });
  });
  it('defaultCrop without usable options does not print an empty list', () => {
    const r = checkConfig({ ...clone(), crops: {} }, 'defaultCrop', 'x', 'newVillage', 'all');
    expect(r.ok === false && r.reason).toBe('defaultCrop: one of the crops in the config');
  });
  it('checkChange applies the whole-config checks to the merged result', () => {
    expect(checkChange(balance, 'workStart', 0.3, 'live', 'all')).toEqual({ ok: true });
    const r = checkChange(balance, 'workStart', 0.9, 'live', 'all');
    expect(r.ok === false && r.reason).toMatch(/^workStart: workStart \(0\.9\) must be less than workEnd/);
    expect(checkChange(balance, 'workStart', 5, 'live', 'all').ok).toBe(false); // per-key refusal first
    expect(checkChange(balance, 'arrivalLevels.0', 2, 'live', 'all').ok).toBe(false); // would drop level 1
    expect(checkChange(balance, 'traffic.lane.capacity', 3, 'live', 'all')).toEqual({ ok: true });
    expect(balance.workStart).toBe(0.25); // the input is not mutated
  });
});

describe('checkConfigWhole', () => {
  it('reports workStart not before workEnd', () => {
    const c = clone(); c.workStart = 0.9;
    expect(checkConfigWhole(c).join()).toMatch(/workStart \(0\.9\) must be less than workEnd/);
    c.workStart = c.workEnd; // equal is also a violation
    expect(checkConfigWhole(c)[0]).toMatch(/workStart/);
  });
  it('reports a working day shorter than 0.05 after the latest trait delay', () => {
    const c = clone(); c.workStart = 0.8; c.workEnd = 0.84;
    expect(checkConfigWhole(c).join()).toMatch(/at least 0\.05 of a day/);
    const d = clone(); d.workStart = 0.8; d.workEnd = 0.9; // 0.1 - 0.05 delay = exactly 0.05: fine
    expect(checkConfigWhole(d)).toEqual([]);
  });
  it('reports a defaultCrop that is not a crop', () => {
    const c = clone(); c.defaultCrop = 'kale';
    expect(checkConfigWhole(c).join()).toMatch(/defaultCrop \(kale\)/);
  });
  it('reports a market the village cannot afford', () => {
    const c = clone(); c.costs.market.coins = c.startingCoins + 1;
    expect(checkConfigWhole(c).join()).toMatch(/costs\.market\.coins/);
    c.costs.market.coins = c.startingCoins;
    expect(checkConfigWhole(c)).toEqual([]);
  });
  it('reports arrivalLevels without level 1', () => {
    const c = clone(); c.arrivalLevels = [3, 6];
    expect(checkConfigWhole(c).join()).toMatch(/arrivalLevels must include 1/);
  });
  it('checks types and does not throw on malformed input', () => {
    const c = clone(); c.workStart = '0.1';
    expect(checkConfigWhole(c).join()).toMatch(/must both be numbers/);
    for (const bad of [null, undefined, 5, 'x', [], {}, { traits: null, crops: null, costs: 3 }]) expect(() => checkConfigWhole(bad)).not.toThrow();
    expect(checkConfigWhole(null).length).toBeGreaterThan(0);
  });
});
