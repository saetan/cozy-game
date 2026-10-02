import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { LEVELS } from '../src/kit/index.js';
import { advance, apply, createSim, snapshot, type SimState } from '../src/sim/sim';
import { market, syncPlot } from '../src/sim/jobs';
import { growthMultiplier } from '../src/sim/decor';
import { inUse, isUnlocked, planLeg, unlockLevel, vehicleInfo } from '../src/sim/vehicles';
import { describeActivity } from '../src/ui/activity';
import { sortedEvents } from '../src/sim/events';
import { findPath, WALKING } from '../src/systems/pathfinding';
import { deserialize, serialize, SAVE_VERSION, type SaveData } from '../src/systems/save';
import type { Cell, BuildingType, TileKind } from '../src/sim/state';
import type { Rotation } from '../src/systems/placement';

const place = (sim: SimState, building: BuildingType, origin: Cell, rotation: Rotation = 0) =>
  (apply(sim, { type: 'placeBuilding', building, rotation, origin }) as { id: number }).id;
const levelTo = (sim: SimState, id: number, level: number) => {
  sim.coins = 100000;
  while (sim.buildings.get(id)!.level < level) expect(apply(sim, { type: 'levelUp', buildingId: id }).ok).toBe(true);
};
const line = (sim: SimState, x0: number, x1: number, z: number, kind: TileKind) => {
  const cells: Cell[] = []; for (let x = x0; x <= x1; x++) cells.push([x, z]);
  sim.coins = 100000; apply(sim, { type: 'setTile', cells, kind });
};
/** A house of the given level on the west side, with open ground to its east. */
const house = (sim: SimState, level: number) => { const h = place(sim, 'house', [-14, 10]); levelTo(sim, h, level); return h; };
const seconds = (sim: SimState, from: Cell, to: Cell, speeds: Record<string, number>) => findPath(sim.world, sim.tiles, from, to, speeds)!.cost;

describe('vehicle unlocks', () => {
  it('bicycle Lv2, wagon Lv3, car Lv4, and Lv4 is the kit garage level', () => {
    expect([unlockLevel('bicycle'), unlockLevel('wagon'), unlockLevel('car')]).toEqual([2, 3, 4]);
    expect(isUnlocked(1, 'bicycle')).toBe(false); expect(isUnlocked(2, 'bicycle')).toBe(true); expect(isUnlocked(3, 'car')).toBe(false);
    const garage = LEVELS.findIndex(l => l.garage) + 1;
    expect(garage).toBe(balance.vehicles.car.houseLevel);
  });
  it('walking speeds match the old walkSpeed and path multiplier', () => {
    expect(WALKING.grass).toBe(balance.walkSpeed);
    expect(WALKING.path).toBe(balance.walkSpeed * balance.pathSpeedMultiplier);
    expect(WALKING.road).toBe(WALKING.path);
  });
});

describe('legs', () => {
  const setup = (level: number) => {
    const sim = createSim({ seed: 1 }); place(sim, 'market', [0, 0]);
    const h = house(sim, level), r = [...sim.residents.values()][0];
    return { sim, h, r, from: r.cell, to: [r.cell[0] + 14, r.cell[1]] as Cell };
  };
  it('a Lv1 resident always walks', () => {
    const sim = createSim({ seed: 1 }); place(sim, 'market', [0, 0]); place(sim, 'house', [-14, 10]);
    const r = [...sim.residents.values()][0];
    line(sim, r.cell[0], r.cell[0] + 14, r.cell[1], 'road');
    expect(planLeg(sim, r, r.cell, [r.cell[0] + 14, r.cell[1]])!.vehicle).toBeNull();
  });
  it('a Lv2 resident rides a bicycle only when it is faster', () => {
    const { sim, r, from, to } = setup(2);
    expect(planLeg(sim, r, from, to)!.vehicle).toBeNull(); // bare grass: same speed, so walk
    line(sim, from[0], to[0], from[1], 'path');
    expect(planLeg(sim, r, from, to)!.vehicle).toBe('bicycle');
  });
  it('car beats bicycle beats walking on a long road', () => {
    const { sim, r, from, to } = setup(4);
    line(sim, from[0], to[0], from[1], 'road');
    const car = seconds(sim, from, to, vehicleInfo('car').speed), bike = seconds(sim, from, to, vehicleInfo('bicycle').speed), walk = seconds(sim, from, to, WALKING);
    expect(car).toBeLessThan(bike); expect(bike).toBeLessThan(walk);
    const leg = planLeg(sim, r, from, to)!;
    expect(leg.vehicle).toBe('car'); expect(leg.cost).toBeCloseTo(car);
  });
  it('the same car route is faster on road than on path', () => {
    const a = setup(4), b = setup(4);
    line(a.sim, a.from[0], a.to[0], a.from[1], 'path'); line(b.sim, b.from[0], b.to[0], b.from[1], 'road');
    expect(planLeg(b.sim, b.r, b.from, b.to)!.cost).toBeLessThan(planLeg(a.sim, a.r, a.from, a.to)!.cost);
  });
  it('a vehicle in use is not available to a housemate: they take the next best, or walk', () => {
    const { sim, h, r, from, to } = setup(4);
    apply(sim, { type: 'addResident', homeId: h });
    const other = [...sim.residents.values()][1];
    line(sim, from[0], to[0], from[1], 'road');
    r.vehicle = 'car'; expect(inUse(sim, h, 'car')).toBe(true);
    expect(planLeg(sim, other, from, to)!.vehicle).toBe('bicycle');
    r.vehicle = 'bicycle'; // car is free again, bicycle is out: car still wins
    expect(planLeg(sim, other, from, to)!.vehicle).toBe('car');
  });
  it('another house does not share vehicles', () => {
    const { sim, h, r, from, to } = setup(4);
    const h2 = place(sim, 'house', [-14, 20]), o = [...sim.residents.values()].find(x => x.homeId === h2)!;
    line(sim, from[0], to[0], from[1], 'road');
    r.vehicle = 'car'; expect(inUse(sim, h2, 'car')).toBe(false);
    expect(planLeg(sim, o, from, to)!.vehicle).toBeNull(); // Lv1 house owns nothing
    expect(h).not.toBe(h2);
  });
  it('a claimed vehicle is released when the leg ends', () => {
    const { sim, h, r } = setup(2);
    place(sim, 'farmPlot', [r.cell[0] + 8, r.cell[1] + 2]);
    line(sim, r.cell[0], r.cell[0] + 8, r.cell[1], 'road');
    let rode = false;
    for (let i = 0; i < 600; i++) {
      advance(sim, 1);
      if (r.vehicle) { rode = true; expect(r.task?.path).toBeTruthy(); expect(inUse(sim, h, 'bicycle')).toBe(true); }
      else if (!r.task?.path) expect(inUse(sim, h, 'bicycle')).toBe(false);
    }
    expect(rode).toBe(true);
  });
});

describe('wagon hauling', () => {
  const run = (level: number) => {
    const sim = createSim({ seed: 1 }); place(sim, 'market', [0, 0]);
    const h = place(sim, 'house', [-8, 0]); levelTo(sim, h, level);
    const plot = place(sim, 'farmPlot', [0, 8]), p = sim.buildings.get(plot)!;
    p.plotState = 'growing'; p.crates = 3; p.crateCrop = 'carrot'; syncPlot(sim, p);
    for (const r of [...sim.residents.values()].slice(1)) sim.residents.delete(r.id); // one hauler: nobody else claims the spare crates
    [...sim.residents.values()][0].role = 'hauler';
    let peak = 0, wagon = false;
    for (let i = 0; i < 300; i++) {
      advance(sim, 1);
      for (const r of sim.residents.values()) { peak = Math.max(peak, r.carrying); if (r.carrying > 1 && r.vehicle === 'wagon') wagon = true; }
    }
    return { sim, peak, wagon };
  };
  it('a Lv3 house hauls 3 crates at once, riding the wagon', () => {
    const { sim, peak, wagon } = run(3);
    expect(peak).toBe(3); expect(wagon).toBe(true);
    expect(sim.stats.delivered).toBe(3);
    expect([...sim.jobs.values()].filter(j => j.kind === 'haul')).toHaveLength(0);
  });
  it('a Lv2 house carries one crate per trip', () => expect(run(2).peak).toBe(1));
});

describe('decor', () => {
  it('shrub, fence and scarecrow are placeable, rotatable, cost coins and block cells', () => {
    for (const t of ['shrub', 'fence', 'scarecrow'] as const) {
      const sim = createSim({ seed: 1 }); sim.coins = 100;
      const id = place(sim, t, [3, 3], 1);
      expect(sim.coins).toBe(100 - balance.costs[t].coins);
      expect(sim.buildings.get(id)!.placement.rotation).toBe(1);
      expect(apply(sim, { type: 'placeBuilding', building: t, rotation: 0, origin: [3, 3] })).toEqual({ ok: false, reason: 'blocked' });
      expect(findPath(sim.world, sim.tiles, [3, 2], [3, 4])!.cells.some(c => c[0] === 3 && c[1] === 3)).toBe(false);
    }
    expect([balance.costs.shrub.coins, balance.costs.fence.coins, balance.costs.scarecrow.coins]).toEqual([5, 3, 40]);
  });
  it('refuses decor without coins', () => {
    const sim = createSim({ seed: 1 }); sim.coins = 2;
    expect(apply(sim, { type: 'placeBuilding', building: 'fence', rotation: 0, origin: [3, 3] })).toEqual({ ok: false, reason: 'not enough coins' });
  });
  const thirstyAt = (scarecrows: Cell[], plotAt: Cell) => {
    const sim = createSim({ seed: 1 }); sim.coins = 1000; place(sim, 'market', [0, 0]);
    for (const c of scarecrows) place(sim, 'scarecrow', c);
    const id = place(sim, 'farmPlot', plotAt); place(sim, 'house', [-8, 0]);
    const p = sim.buildings.get(id)!;
    for (let i = 0; i < 400 && p.plotState !== 'growing'; i++) advance(sim, 1);
    const ev = sortedEvents(sim.queue).find(e => (e as any).event?.kind === 'plot' && (e as any).event.plotId === id) as any;
    return { sim, p, delay: ev.time - sim.t, grow: balance.crops.carrot.growTime * balance.waterFraction };
  };
  it('plots within 2 cells grow 10% faster; none outside; scarecrows do not stack', () => {
    const base = thirstyAt([], [0, 8]), near = thirstyAt([[2, 10]], [0, 8]), far = thirstyAt([[3, 8]], [0, 8]), two = thirstyAt([[2, 10], [-2, 6]], [0, 8]);
    expect(base.delay).toBeCloseTo(base.grow);
    expect(near.delay).toBeCloseTo(near.grow / 1.1);
    expect(far.delay).toBeCloseTo(far.grow);
    expect(two.delay).toBeCloseTo(two.grow / 1.1);
    expect(growthMultiplier(near.sim, near.p)).toBe(1.1);
  });
});

describe('activity text', () => {
  it('says what the resident rides and where', () => {
    const sim = createSim({ seed: 1 }); place(sim, 'market', [0, 0]);
    const h = place(sim, 'house', [-14, 10]); levelTo(sim, h, 2);
    place(sim, 'farmPlot', [-2, 12]);
    const r = [...sim.residents.values()][0];
    line(sim, r.cell[0], r.cell[0] + 10, r.cell[1], 'path');
    let text = '';
    for (let i = 0; i < 100 && !r.vehicle; i++) advance(sim, 0.5);
    text = describeActivity(sim, r);
    expect(r.vehicle).toBe('bicycle');
    expect(text).toBe('Riding bicycle to the field');
  });
});

describe('save migrations', () => {
  const v3 = () => {
    const sim = createSim({ seed: 2 }); place(sim, 'market', [0, 0]); const h = place(sim, 'house', [-8, 0]); levelTo(sim, h, 2);
    place(sim, 'farmPlot', [0, 8]); advance(sim, 100);
    return sim;
  };
  it('v2 -> v3 gives residents no vehicle', () => {
    const d = serialize(v3(), 5) as unknown as { version: number; sim: { residents: Record<string, unknown>[] } };
    d.version = 2; for (const r of d.sim.residents) delete r.vehicle;
    const sim = deserialize(d as unknown as SaveData);
    expect([...sim.residents.values()].every(r => r.vehicle === null)).toBe(true);
    advance(sim, 500); // keeps simulating
  });
  it('v1 -> v3 chains both migrations', () => {
    const d = serialize(v3(), 5) as unknown as { version: number; sim: Record<string, any> };
    d.version = 1; delete d.sim.unlockedCrops; delete d.sim.chunksBought;
    for (const r of d.sim.residents) delete r.vehicle;
    for (const b of d.sim.buildings) if (b.type === 'market') { b.stock = 2; delete b.placement.frame; }
    const sim = deserialize(d as unknown as SaveData);
    expect(sim.unlockedCrops).toEqual(['carrot']);
    expect(market(sim)!.stock!.carrot).toBe(2);
    expect([...sim.residents.values()].every(r => r.vehicle === null)).toBe(true);
    expect(serialize(sim).version).toBe(SAVE_VERSION);
  });
});

describe('determinism with vehicles, roads and scarecrows', () => {
  const mk = () => {
    const sim = createSim({ seed: 9 }); sim.coins = 100000;
    place(sim, 'market', [0, 0]);
    const hs = [-8, 8, 16].map(z => place(sim, 'house', [-10, z]));
    levelTo(sim, hs[0], 4); levelTo(sim, hs[1], 3); levelTo(sim, hs[2], 2);
    sim.coins = 100000;
    for (let i = 0; i < 4; i++) apply(sim, { type: 'addResident', homeId: hs[0] });
    for (const x of [0, 2, 4]) place(sim, 'farmPlot', [x, 8]);
    place(sim, 'scarecrow', [2, 11]); place(sim, 'shrub', [6, 6]); place(sim, 'fence', [7, 6]);
    line(sim, -9, 12, 4, 'road'); line(sim, 3, 3, 5, 'path');
    for (let z = 5; z <= 9; z++) line(sim, 6, 6, z, 'road');
    return sim;
  };
  it('one big step equals many small steps', () => {
    const a = mk(), b = mk();
    advance(a, 6000); for (let i = 0; i < 6000; i++) advance(b, 1);
    expect(snapshot(b)).toEqual(snapshot(a));
    expect([...a.residents.values()].some(r => r.vehicle) || a.stats.delivered > 0).toBe(true);
  });
  it('a save round trip equals the uninterrupted run, mid-leg', () => {
    const a = mk(), b = mk();
    advance(a, 2100); advance(b, 2100);
    const copy = deserialize(serialize(b, 1));
    advance(a, 4000); advance(copy, 4000);
    expect(snapshot(copy)).toEqual(snapshot(a));
  });
});
