import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { SCHEMA, checkConfig, checkConfigWhole, configEntries, entriesFor, leaves } from '../src/sim/configSchema';

// PR #41 adds `abortRetrySeconds` to balance.json. Until it merges, its schema line matches no leaf.
// Remove this tolerance (the set and the `continue` below) once #41 has merged.
const PENDING = new Set(['abortRetrySeconds']);

const clone = () => JSON.parse(JSON.stringify(balance));
const all = leaves(balance);

describe('schema coverage', () => {
  it('every leaf of balance.json matches exactly one schema entry', () => {
    expect(all.length).toBeGreaterThan(100);
    for (const [path] of all) expect(entriesFor(path).map(e => e.pattern), path).toHaveLength(1);
  });
  it('every schema entry matches at least one leaf', () => {
    for (const e of SCHEMA) {
      if (PENDING.has(e.pattern)) continue;
      expect(all.some(([p]) => entriesFor(p)[0] === e), e.pattern).toBe(true);
    }
  });
  it('the shipped defaults pass checkConfig, except fixed keys which are refused', () => {
    for (const [path, v] of all) {
      const r = checkConfig(path, v, balance);
      const cls = entriesFor(path)[0].class;
      if (cls === 'fixed') expect(r.ok, path).toBe(false);
      else expect(r, path).toEqual({ ok: true, class: cls });
    }
  });
  it('the shipped defaults pass the cross-field checks', () => {
    expect(checkConfigWhole(balance)).toEqual([]);
  });
  it('configEntries lists every leaf once, stably, grouped', () => {
    const rows = configEntries(balance);
    expect(rows.map(r => r.path).sort()).toEqual(all.map(([p]) => p).sort());
    expect(configEntries(balance)).toEqual(rows);
    const order = rows.map(r => r.group);
    expect(order).toEqual([...order].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(rows.find(r => r.path === 'traffic.lane.capacity')).toMatchObject({ kind: 'integer', min: 1, max: 20, nullable: true, group: 'traffic', class: 'live' });
    expect(rows.find(r => r.path === 'defaultCrop')!.options).toEqual(Object.keys(balance.crops));
  });
});

describe('checkConfig', () => {
  const ok = (p: string, v: unknown) => expect(checkConfig(p, v, balance).ok, `${p}=${JSON.stringify(v)}`).toBe(true);
  const no = (p: string, v: unknown) => expect(checkConfig(p, v, balance).ok, `${p}=${JSON.stringify(v)}`).toBe(false);

  it('integer with nullable: boundaries and null', () => {
    ok('traffic.lane.capacity', 1); ok('traffic.lane.capacity', 20); ok('traffic.dirtLane.capacity', null);
    no('traffic.lane.capacity', 0); no('traffic.lane.capacity', 21); no('traffic.lane.capacity', 1.5);
    no('traffic.lane.capacity', '2'); no('traffic.lane.capacity', NaN);
  });
  it('number: boundaries, no zero where it divides, null refused when not nullable', () => {
    ok('vehicles.car.speed.street', 0.1); ok('vehicles.car.speed.street', 50);
    no('vehicles.car.speed.street', 0); no('vehicles.car.speed.street', -1); no('vehicles.car.speed.street', Infinity);
    no('times.sell', 0); ok('times.sell', 0.1);
    no('walking.speed.grass', null);
  });
  it('fraction: 0 to 1, and tighter bounds where zero or one break things', () => {
    ok('workStart', 0); ok('workStart', 1); no('workStart', 1.01); no('workStart', -0.01);
    ok('waterFraction', 0.05); no('waterFraction', 0); no('waterFraction', 1);
  });
  it('option, list and crop options', () => {
    ok('traffic.lane.whenBusy', 'wait'); no('traffic.lane.whenBusy', 'dance'); no('traffic.lane.whenBusy', 3);
    ok('traffic.lane.appliesTo', []); ok('traffic.lane.appliesTo', ['car', 'bicycle']);
    no('traffic.lane.appliesTo', ['plane']); no('traffic.lane.appliesTo', 'car'); no('traffic.lane.appliesTo', ['car', 'car']);
    ok('defaultCrop', 'wheat'); no('defaultCrop', 'kale');
  });
  it('wildcards cover every crop, vehicle, trait and index', () => {
    ok('crops.pumpkin.growTime', 100); ok('houseLevelCosts.5.coins', 0); ok('traits.chatty.speed.sell', 2);
    no('crops.pumpkin.price', 0); no('vehicles.wagon.carry', 0);
  });
  it('refuses unknown paths', () => {
    expect(checkConfig('traffic.lane.colour', 1)).toEqual({ ok: false, reason: 'traffic.lane.colour: unknown setting' });
    no('nope', 1); no('crops.carrot', 1); no('crops.carrot.growTime.x', 1);
  });
  it('refuses fixed paths with the reason', () => {
    const r = checkConfig('market.frame.0', 4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^market\.frame\.0: fixed, edit src\/data\/balance\.json \(/);
    no('species.0', 'dog'); no('traits.sleepy.name', 'x');
  });
  it('reports the class, including newVillage keys', () => {
    expect(checkConfig('dayLength', 600)).toEqual({ ok: true, class: 'newVillage' });
    expect(checkConfig('startingCoins', 0)).toEqual({ ok: true, class: 'newVillage' });
    expect(checkConfig('maxCrates', 3)).toEqual({ ok: true, class: 'live' });
  });
  it('exact refusal text', () => {
    expect(checkConfig('traffic.lane.capacity', 0)).toEqual({ ok: false, reason: 'traffic.lane.capacity: whole number 1 to 20, or null' });
    expect(checkConfig('walking.speed.grass', -1)).toEqual({ ok: false, reason: 'walking.speed.grass: number 0.1 to 50' });
    expect(checkConfig('traffic.lane.whenBusy', 'x')).toEqual({ ok: false, reason: 'traffic.lane.whenBusy: one of wait, waitOrWalk, ignore' });
    expect(checkConfig('waterFraction', 1)).toEqual({ ok: false, reason: 'waterFraction: number 0.05 to 0.95' });
  });
});

describe('checkConfigWhole', () => {
  it('reports workStart not before workEnd', () => {
    const c = clone(); c.workStart = 0.9;
    expect(checkConfigWhole(c).join()).toMatch(/workStart \(0\.9\) must be less than workEnd/);
    c.workStart = c.workEnd; // equal is also a violation
    expect(checkConfigWhole(c)[0]).toMatch(/workStart/);
  });
  it('reports a trait whose late start passes workEnd', () => {
    const c = clone(); c.workStart = 0.8; c.workEnd = 0.84; // sleepy delay 0.05 pushes the start to 0.85
    const v = checkConfigWhole(c);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/traits\.sleepy\.workStartDelay/);
  });
  it('reports a defaultCrop that is not a crop', () => {
    const c = clone(); c.defaultCrop = 'kale';
    expect(checkConfigWhole(c).join()).toMatch(/defaultCrop \(kale\)/);
  });
});
