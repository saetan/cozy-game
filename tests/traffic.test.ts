import { afterEach, describe, expect, it } from 'vitest';
import { advance, apply, createSim, snapshot, type SimState } from '../src/sim/sim';
import { describeActivity } from '../src/ui/activity';
import { planLeg, vehicleInfo } from '../src/sim/vehicles';
import { findPath, travelTime } from '../src/systems/pathfinding';
import { surfaceLookup } from '../src/sim/surfaces';
import {
  laneNetwork, laneSegments, pathUntilStop, planEntry, reserve, setTrafficConfig, trafficConfig, TRAFFIC_OFF, type TrafficOverride,
} from '../src/sim/traffic';
import { deserialize, serialize, SAVE_VERSION, type SaveData } from '../src/systems/save';
import type { BuildingType, Cell, TileKind, VehicleKind } from '../src/sim/state';
import type { Rotation } from '../src/systems/placement';

afterEach(() => setTrafficConfig(null));

const place = (sim: SimState, building: BuildingType, origin: Cell, rotation: Rotation = 0) =>
  (apply(sim, { type: 'placeBuilding', building, rotation, origin }) as { id: number }).id;
const levelTo = (sim: SimState, id: number, level: number) => {
  sim.coins = 100000;
  while (sim.buildings.get(id)!.level < level) apply(sim, { type: 'levelUp', buildingId: id });
};
const tiles = (sim: SimState, cells: Cell[], kind: TileKind) => { sim.coins = 100000; apply(sim, { type: 'setTile', cells, kind }); };
const line = (sim: SimState, x0: number, x1: number, z: number, kind: TileKind = 'lane') => {
  const cells: Cell[] = []; for (let x = x0; x <= x1; x++) cells.push([x, z]);
  tiles(sim, cells, kind);
};
const col = (sim: SimState, x: number, z0: number, z1: number, kind: TileKind = 'lane') => {
  const cells: Cell[] = []; for (let z = z0; z <= z1; z++) cells.push([x, z]);
  tiles(sim, cells, kind);
};
const bare = () => createSim({ seed: 1 });
const ids = (sim: SimState) => laneSegments(sim).map(s => s.id).sort();
const carPath = (sim: SimState, a: Cell, b: Cell, k: VehicleKind = 'car') => findPath(sim.world, surfaceLookup(sim), a, b, vehicleInfo(k).speed)!;

describe('config accessor', () => {
  it('reads balance.json by default and can be overridden per test', () => {
    expect(trafficConfig().lane).toMatchObject({ capacity: 1, whenBusy: 'waitOrWalk', maxWaitSeconds: 30 });
    expect(trafficConfig().street.capacity).toBeNull();
    setTrafficConfig({ lane: { capacity: 3 } });
    expect(trafficConfig().lane.capacity).toBe(3);
    expect(trafficConfig().lane.whenBusy).toBe('waitOrWalk'); // merged over the defaults
    setTrafficConfig(null);
    expect(trafficConfig().lane.capacity).toBe(1);
  });
});

describe('segments', () => {
  it('a straight lane is one segment, id = smallest cell', () => {
    const sim = bare(); line(sim, 0, 5, 0);
    const [s] = laneSegments(sim);
    expect(laneSegments(sim)).toHaveLength(1);
    expect(s.id).toBe('0,0'); expect(s.cells).toHaveLength(6);
  });
  it('a corner is not a junction', () => {
    const sim = bare(); line(sim, 0, 3, 0); col(sim, 3, 1, 4);
    expect(laneSegments(sim)).toHaveLength(1); expect(laneNetwork(sim).junctions.size).toBe(0);
  });
  it('a T-junction cell splits three runs and is itself unlimited', () => {
    const sim = bare(); line(sim, -3, 3, 0); col(sim, 0, 1, 3);
    const net = laneNetwork(sim);
    expect([...net.junctions]).toEqual(['0,0']);
    expect(net.segments).toHaveLength(3);
    expect(net.byCell.has('0,0')).toBe(false);
    expect(ids(sim)).toEqual(['-3,0', '0,1', '1,0']);
  });
  it('a crossroads splits four runs', () => {
    const sim = bare(); line(sim, -3, 3, 0); col(sim, 0, -3, 3);
    expect([...laneNetwork(sim).junctions]).toEqual(['0,0']);
    expect(laneSegments(sim)).toHaveLength(4);
  });
  it('a lane mouth (next to a 6 m tile) and a dead end just end the run', () => {
    const sim = bare(); sim.coins = 100000;
    apply(sim, { type: 'setStreet', tiles: [[2, 0]], kind: 'road' }); // covers cells 6..8, 0..2
    line(sim, 0, 5, 0);
    expect(laneSegments(sim)).toHaveLength(1);
    expect(laneSegments(sim)[0].cells).toHaveLength(6);
  });
  it('asphalt and dirt lane of one run are one segment (strictest rule applies)', () => {
    const sim = bare(); line(sim, 0, 2, 0, 'lane'); line(sim, 3, 5, 0, 'dirtLane');
    const [s, ...rest] = laneSegments(sim);
    expect(rest).toHaveLength(0); expect(s.kinds).toEqual(['dirtLane', 'lane']);
  });
  it('paths, streets and nothing are not lanes', () => {
    const sim = bare(); line(sim, 0, 5, 0, 'path');
    expect(laneSegments(sim)).toHaveLength(0);
  });
});

describe('capacity and waiting at the entrance (planEntry / reserve)', () => {
  const setup = () => { const sim = bare(); line(sim, 1, 10, 5); return sim; };
  it('the first vehicle is free; the second waits at the cell before the segment until the first leaves', () => {
    const sim = setup();
    const p = carPath(sim, [0, 5], [11, 5]);
    const a = planEntry(sim, 'car', p, sim.t);
    expect(a.kind).toBe('free'); expect(a.claims).toHaveLength(1);
    reserve(sim, 1, a);
    const b = planEntry(sim, 'car', p, sim.t);
    expect(b.kind).toBe('wait');
    if (b.kind !== 'wait') return;
    expect(b.stop).toBe(0); // path[0] = (0,5), the cell before the lane
    expect(b.resumeAt).toBe(a.claims[0].to);
    // after the blocker's time: free again
    expect(planEntry(sim, 'car', p, b.resumeAt).kind).toBe('free');
  });
  it('arrival time of the waiter = blocker leaves + its own ride', () => {
    const sim = setup();
    const p = carPath(sim, [0, 5], [11, 5]);
    reserve(sim, 1, planEntry(sim, 'car', p, sim.t));
    const w = planEntry(sim, 'car', p, sim.t);
    if (w.kind !== 'wait') throw new Error('expected a wait');
    const resumed = planEntry(sim, 'car', p, w.resumeAt);
    expect(resumed.kind).toBe('free');
    expect(w.resumeAt + travelTime(p.cost)).toBeGreaterThan(travelTime(p.cost)); // the delay is real
  });
  it('stops at the entrance of a later segment, after reserving the earlier ones (chain)', () => {
    const sim = bare(); line(sim, 1, 5, 5); line(sim, 7, 12, 5); tiles(sim, [[6, 5]], 'lane'); col(sim, 6, 6, 7); // junction (6,5)
    expect(laneSegments(sim)).toHaveLength(3);
    const p = carPath(sim, [0, 5], [13, 5]);
    // another car occupies only the far segment (7,5)..(12,5), at the time our car would get there
    const far = laneNetwork(sim).byCell.get('7,5')!;
    sim.reservations.push({ segment: far.id, residentId: 99, from: 0, to: 100 });
    const e = planEntry(sim, 'car', p, 0);
    expect(e.kind).toBe('wait');
    if (e.kind !== 'wait') return;
    expect(p.cells[e.stop]).toEqual([6, 5]); // the junction cell
    expect(e.claims).toHaveLength(1); // the first segment is reserved, the busy one is not
    expect(e.resumeAt).toBe(100);
    const cut = pathUntilStop(p, e.stop);
    expect(cut.cells[cut.cells.length - 1]).toEqual([6, 5]);
    expect(cut.cum[cut.cum.length - 1]).toBeCloseTo(1);
  });
  it('capacity 2 lets two in, the third waits', () => {
    setTrafficConfig({ lane: { capacity: 2 } });
    const sim = setup(); const p = carPath(sim, [0, 5], [11, 5]);
    for (const id of [1, 2]) { const e = planEntry(sim, 'car', p, sim.t); expect(e.kind).toBe('free'); reserve(sim, id, e); }
    expect(planEntry(sim, 'car', p, sim.t).kind).toBe('wait');
  });
  it('head-on from both ends: the second waits at its own end, no deadlock', () => {
    const sim = setup();
    const east = carPath(sim, [0, 5], [11, 5]), west = carPath(sim, [11, 5], [0, 5]);
    const a = planEntry(sim, 'car', east, 0); reserve(sim, 1, a);
    const b = planEntry(sim, 'car', west, 0);
    expect(b.kind).toBe('wait');
    if (b.kind !== 'wait') return;
    expect(west.cells[b.stop]).toEqual([11, 5]); // waits at the east mouth, holding nothing
    expect(b.claims).toHaveLength(0);
    // when it resumes the lane is free
    expect(planEntry(sim, 'car', west, b.resumeAt).kind).toBe('free');
  });
  it('appliesTo: a bicycle and a walker are never limited', () => {
    const sim = setup(); const p = carPath(sim, [0, 5], [11, 5]), bp = carPath(sim, [0, 5], [11, 5], 'bicycle');
    reserve(sim, 1, planEntry(sim, 'car', p, 0));
    expect(planEntry(sim, 'bicycle', bp, 0)).toEqual({ kind: 'free', claims: [] });
    setTrafficConfig({ lane: { appliesTo: ['bicycle'] } });
    expect(planEntry(sim, 'car', p, 0)).toEqual({ kind: 'free', claims: [] });
    expect(planEntry(sim, 'bicycle', bp, 0).kind).toBe('wait'); // now bicycles are the limited ones
    const fresh = setup();
    expect(planEntry(fresh, 'bicycle', bp, 0).claims).toHaveLength(1);
  });
  it('capacity null and whenBusy ignore turn the rule off', () => {
    const sim = setup(); const p = carPath(sim, [0, 5], [11, 5]);
    reserve(sim, 1, planEntry(sim, 'car', p, 0));
    setTrafficConfig(TRAFFIC_OFF); expect(planEntry(sim, 'car', p, 0)).toEqual({ kind: 'free', claims: [] });
    setTrafficConfig({ lane: { whenBusy: 'ignore' } }); expect(planEntry(sim, 'car', p, 0)).toEqual({ kind: 'free', claims: [] });
  });
  it('mixed run uses the stricter rule', () => {
    const sim = bare(); line(sim, 1, 4, 5, 'lane'); line(sim, 5, 8, 5, 'dirtLane');
    setTrafficConfig({ lane: { capacity: 2 }, dirtLane: { capacity: 1 } });
    const p = carPath(sim, [0, 5], [9, 5]);
    reserve(sim, 1, planEntry(sim, 'car', p, 0));
    expect(planEntry(sim, 'car', p, 0).kind).toBe('wait'); // capacity 1 wins over 2
    setTrafficConfig({ lane: { capacity: 2 }, dirtLane: { capacity: null } });
    expect(planEntry(sim, 'car', p, 0).kind).toBe('free'); // null is "no limit", so lane's 2 applies and one car fits beside another
  });
  it('streets and dirt roads are unlimited whatever the lane rules say', () => {
    const sim = bare(); sim.coins = 100000;
    apply(sim, { type: 'setStreet', tiles: [[0, 0], [1, 0], [2, 0]], kind: 'road' });
    const p = carPath(sim, [0, 1], [8, 1]);
    for (let i = 0; i < 3; i++) { const e = planEntry(sim, 'car', p, 0); expect(e).toEqual({ kind: 'free', claims: [] }); reserve(sim, i, e); }
    expect(sim.reservations).toHaveLength(0);
  });
});

/** Two Lv4 houses whose residents both go to farm plots at the end of one shared lane. */
function shared(over?: TrafficOverride) {
  if (over) setTrafficConfig(over);
  const sim = createSim({ seed: 1 }); sim.coins = 100000; place(sim, 'market', [0, 0]);
  const h1 = place(sim, 'house', [-14, 10]), h2 = place(sim, 'house', [-14, 20]);
  levelTo(sim, h1, 4); levelTo(sim, h2, 4);
  const r1 = [...sim.residents.values()].find(r => r.homeId === h1)!, r2 = [...sim.residents.values()].find(r => r.homeId === h2)!;
  for (const r of [...sim.residents.values()]) if (r !== r1 && r !== r2) sim.residents.delete(r.id);
  const [x, z] = r1.cell;
  line(sim, x + 6, x + 20, z); col(sim, x + 6, Math.min(z, r2.cell[1]), Math.max(z, r2.cell[1]));
  const plots = [place(sim, 'farmPlot', [x + 20, z + 2]), place(sim, 'farmPlot', [x + 20, z - 4])];
  return { sim, r1, r2, plots };
}
const runTo = (sim: SimState, pred: () => boolean, max = 600) => { for (let i = 0; i < max * 4 && !pred(); i++) advance(sim, 0.25); expect(pred()).toBe(true); };

describe('two residents sharing a lane', () => {
  it('whenBusy wait: the second car waits on its vehicle, then rides on; the first never waits', () => {
    const { sim, r1, r2 } = shared({ lane: { whenBusy: 'wait' }, dirtLane: { whenBusy: 'wait' } });
    runTo(sim, () => r1.task?.action === 'wait' || r2.task?.action === 'wait');
    const waiter = r1.task?.action === 'wait' ? r1 : r2, other = waiter === r1 ? r2 : r1;
    expect(waiter.vehicle).toBe('car');
    expect(waiter.task!.path).toBeUndefined();
    expect(describeActivity(sim, waiter)).toBe('Waiting for the lane to clear');
    expect(other.task?.action).not.toBe('wait');
    const until = waiter.task!.end;
    expect(sim.reservations.some(x => x.residentId === other.id && x.to === until)).toBe(true); // it waits for exactly that reservation
    runTo(sim, () => waiter.task?.action !== 'wait');
    expect(sim.t).toBeCloseTo(until);
    expect(waiter.task?.path).toBeTruthy(); expect(waiter.vehicle).toBe('car'); // riding on now
    expect(waiter.task!.waitUntil).toBeUndefined();
    runTo(sim, () => sim.stats.harvested + [...sim.buildings.values()].filter(b => b.plotState === 'growing').length >= 2, 2000);
  });
  it('waitOrWalk: a wait that would exceed maxWaitSeconds makes the second resident ride an unlimited vehicle instead', () => {
    const { sim, r1, r2 } = shared({ lane: { maxWaitSeconds: 0.01 } });
    runTo(sim, () => !!r1.task?.path && !!r2.task?.path);
    expect([r1.vehicle, r2.vehicle].filter(v => v === 'car')).toHaveLength(1);
    expect([r1, r2].every(r => r.task?.action !== 'wait')).toBe(true);
  });
  it('rule off: both cars ride at once', () => {
    const { sim, r1, r2 } = shared(TRAFFIC_OFF);
    runTo(sim, () => !!r1.task?.path && !!r2.task?.path);
    expect(r1.vehicle).toBe('car'); expect(r2.vehicle).toBe('car');
    expect(sim.reservations).toHaveLength(0);
  });
  it('the whole village still completes work, with no deadlock', () => {
    const { sim } = shared({ lane: { whenBusy: 'wait' }, dirtLane: { whenBusy: 'wait' } });
    advance(sim, 3000);
    expect(sim.stats.harvested).toBeGreaterThan(0);
  });
});

describe('whenBusy decisions (planLeg)', () => {
  const setup = (over: TrafficOverride) => {
    setTrafficConfig(over);
    const sim = createSim({ seed: 1 }); sim.coins = 100000; place(sim, 'market', [0, 0]);
    const h = place(sim, 'house', [-14, 10]); levelTo(sim, h, 4);
    const r = [...sim.residents.values()][0];
    const to: Cell = [r.cell[0] + 16, r.cell[1]];
    line(sim, r.cell[0] + 1, to[0] - 1, r.cell[1]);
    const seg = laneSegments(sim)[0];
    return { sim, r, to, seg, block: (secs: number) => sim.reservations.push({ segment: seg.id, residentId: 99, from: sim.t, to: sim.t + secs }) };
  };
  it('free lane: the car, no wait', () => {
    const { sim, r, to } = setup({});
    const leg = planLeg(sim, r, r.cell, to)!;
    expect(leg.vehicle).toBe('car'); expect(leg.entry!.kind).toBe('free');
  });
  it('wait: always the car, waiting however long', () => {
    const { sim, r, to, block } = setup({ lane: { whenBusy: 'wait' } }); block(500);
    const leg = planLeg(sim, r, r.cell, to)!;
    expect(leg.vehicle).toBe('car'); expect(leg.entry!.kind).toBe('wait');
  });
  it('waitOrWalk: a short wait is worth it; a long one switches to the unlimited bicycle', () => {
    const a = setup({}); a.block(1);
    expect(planLeg(a.sim, a.r, a.r.cell, a.to)!.vehicle).toBe('car');
    const b = setup({}); b.block(25);
    expect(planLeg(b.sim, b.r, b.r.cell, b.to)!.vehicle).toBe('bicycle');
  });
  it('waitOrWalk: beyond maxWaitSeconds the vehicle is not even considered', () => {
    const { sim, r, to, block } = setup({ lane: { maxWaitSeconds: 5 }, dirtLane: { maxWaitSeconds: 5 }, }); block(6);
    expect(planLeg(sim, r, r.cell, to)!.vehicle).not.toBe('car');
  });
  it('waitOrWalk ties and walking: with no unlimited vehicle faster, the resident walks', () => {
    const { sim, r, to, block } = setup({ lane: { appliesTo: ['bicycle', 'wagon', 'car'] } }); block(1000);
    expect(planLeg(sim, r, r.cell, to)!.vehicle).toBeNull(); // everything is blocked: walk
  });
  it('ignore: the reservation is not looked at', () => {
    const { sim, r, to, block } = setup({ lane: { whenBusy: 'ignore' } }); block(500);
    const leg = planLeg(sim, r, r.cell, to)!;
    expect(leg.vehicle).toBe('car'); expect(leg.entry!.kind).toBe('free');
  });
  it('a hauler preferring the wagon falls back when the wagon would wait too long', () => {
    const { sim, r, to, block } = setup({}); block(100);
    expect(planLeg(sim, r, r.cell, to, 'wagon')!.vehicle).not.toBe('wagon');
  });
});

describe('editing lanes under reservations', () => {
  it('reservations on a vanished segment are dropped and never block', () => {
    const sim = bare(); line(sim, 1, 10, 5);
    const p = carPath(sim, [0, 5], [11, 5]);
    reserve(sim, 1, planEntry(sim, 'car', p, 0));
    expect(sim.reservations).toHaveLength(1);
    apply(sim, { type: 'setTile', cells: [[5, 5]], kind: null }); // splits the run: ids change or vanish
    sim.reservations[0].segment = 'gone';
    const e = planEntry(sim, 'car', carPath(sim, [0, 5], [4, 5]), 0);
    expect(e.kind).toBe('free');
    reserve(sim, 2, e);
    expect(sim.reservations.every(r => r.segment !== 'gone')).toBe(true);
  });
  it('erasing a lane while a car is in it does not break the sim', () => {
    const { sim, r1, r2 } = shared({ lane: { whenBusy: 'wait' }, dirtLane: { whenBusy: 'wait' } });
    runTo(sim, () => r1.task?.action === 'wait' || r2.task?.action === 'wait');
    const cells: Cell[] = []; for (let x = r1.cell[0] + 1; x <= r1.cell[0] + 20; x++) cells.push([x, r1.cell[1]]);
    apply(sim, { type: 'setTile', cells, kind: null });
    advance(sim, 2000);
    expect(sim.reservations.every(r => laneNetwork(sim).byId.has(r.segment) || r.to <= sim.t)).toBe(true);
    expect([...sim.residents.values()].every(r => r.task !== null)).toBe(true);
  });
});

describe('determinism with traffic active', () => {
  it('one big step equals many small steps', () => {
    const a = shared().sim, b = shared().sim;
    advance(a, 3000); for (let i = 0; i < 3000; i++) advance(b, 1);
    expect(snapshot(b)).toEqual(snapshot(a));
  });
  it('a save round trip mid-wait equals the uninterrupted run', () => {
    const mk = () => shared({ lane: { whenBusy: 'wait' }, dirtLane: { whenBusy: 'wait' } });
    const a = mk(), b = mk();
    runTo(b.sim, () => [...b.sim.residents.values()].some(r => r.task?.action === 'wait'));
    advance(a.sim, b.sim.t - a.sim.t);
    expect(a.sim.reservations.length).toBeGreaterThan(0);
    const copy = deserialize(serialize(b.sim, 1));
    advance(a.sim, 2000); advance(copy, 2000);
    expect(snapshot(copy)).toEqual(snapshot(a.sim));
  });
});

describe('save v5', () => {
  const v4 = () => {
    const { sim } = shared(); advance(sim, 10);
    const d = JSON.parse(JSON.stringify(serialize(sim, 5))) as { version: number; sim: Record<string, any> };
    d.version = 4; delete d.sim.reservations;
    return d;
  };
  it('is version 5', () => expect(SAVE_VERSION).toBe(5));
  it('round-trips reservations', () => {
    const { sim } = shared(); advance(sim, 5);
    expect(sim.reservations.length).toBeGreaterThan(0);
    expect(deserialize(serialize(sim, 1)).reservations).toEqual(sim.reservations);
  });
  it('v4 -> v5 starts with no reservations and keeps simulating', () => {
    const sim = deserialize(v4() as unknown as SaveData);
    expect(sim.reservations).toEqual([]);
    advance(sim, 500);
  });
  it('v1 -> v5 chains every migration', () => {
    const d = v4(); d.version = 1; delete d.sim.unlockedCrops; delete d.sim.chunksBought; delete d.sim.streets;
    for (const r of d.sim.residents) delete r.vehicle;
    for (const b of d.sim.buildings) if (b.type === 'market') { b.stock = 0; delete b.placement.frame; }
    const sim = deserialize(d as unknown as SaveData);
    expect(sim.reservations).toEqual([]);
    expect(serialize(sim).version).toBe(5);
  });
});

describe('rules off == the behaviour before traffic existed', () => {
  const mixed = () => {
    const sim = createSim({ seed: 9 }); sim.coins = 100000;
    place(sim, 'market', [0, 0]);
    const hs = [-8, 8, 16].map(z => place(sim, 'house', [-10, z]));
    levelTo(sim, hs[0], 4); levelTo(sim, hs[1], 4); levelTo(sim, hs[2], 3);
    sim.coins = 100000;
    for (let i = 0; i < 4; i++) apply(sim, { type: 'addResident', homeId: hs[0] });
    for (const x of [0, 2, 4]) place(sim, 'farmPlot', [x, 8]);
    place(sim, 'scarecrow', [2, 11]); place(sim, 'shrub', [6, 6]); place(sim, 'fence', [7, 6]);
    apply(sim, { type: 'setStreet', tiles: [[4, 1]], kind: 'road' }); apply(sim, { type: 'setStreet', tiles: [[5, 1]], kind: 'dirt' });
    line(sim, -9, 11, 4, 'lane'); line(sim, 3, 3, 5, 'path');
    for (let z = 5; z <= 9; z++) line(sim, 6, 6, z, 'dirtLane');
    return sim;
  };
  const hash = (sim: SimState) => {
    const { reservations: _r, ...rest } = snapshot(sim) as Record<string, unknown>;
    const str = JSON.stringify(rest); let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
    return h;
  };
  // recorded by running this same village for 6000 s on main (before sim/traffic.ts existed)
  const MAIN = { hash: -2006839081, coins: 100269, stats: { harvested: 27, delivered: 27, sold: 27, earned: 270 }, t: 6300 };
  const offs: [string, TrafficOverride][] = [
    ['capacity null', TRAFFIC_OFF],
    ['whenBusy ignore', { lane: { whenBusy: 'ignore' }, dirtLane: { whenBusy: 'ignore' } }],
    ['appliesTo nothing', { lane: { appliesTo: [] }, dirtLane: { appliesTo: [] } }],
  ];
  for (const [name, over] of offs) {
    it(`${name}: identical to main, and no reservations`, () => {
      setTrafficConfig(over);
      const sim = mixed(); advance(sim, 6000);
      expect({ hash: hash(sim), coins: sim.coins, stats: sim.stats, t: sim.t }).toEqual(MAIN);
      expect(sim.reservations).toEqual([]);
    });
  }
  it('the two off switches give equal snapshots', () => {
    setTrafficConfig(offs[0][1]); const a = mixed(); advance(a, 3000);
    setTrafficConfig(offs[1][1]); const b = mixed(); advance(b, 3000);
    expect(snapshot(b)).toEqual(snapshot(a));
  });
  it('with the default rules the same village stays deterministic (one step == many)', () => {
    const a = mixed(), b = mixed();
    advance(a, 6000); for (let i = 0; i < 6000; i++) advance(b, 1);
    expect(snapshot(b)).toEqual(snapshot(a));
  });
});
