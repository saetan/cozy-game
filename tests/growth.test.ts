import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { advance, apply, createSim, levelUpCheck, snapshot, type SimState } from '../src/sim/sim';
import { DAY_LENGTH } from '../src/sim/clock';
import { HOUSE_FRAME, HOUSE_MAX_LEVEL, houseCells } from '../src/sim/houses';
import { syncMarket, syncPlot } from '../src/sim/jobs';
import { cellKey } from '../src/sim/world';
import { findPath } from '../src/systems/pathfinding';
import { surfaceLookup } from '../src/sim/surfaces';
import { placementCells, rotateInFrame, rotatedFrame } from '../src/systems/placement';
import type { Rotation } from '../src/systems/placement';
import type { TraitId } from '../src/sim/state';

const house = (sim: SimState, origin: [number, number] = [0, 0], rotation: Rotation = 0) =>
  (apply(sim, { type: 'placeBuilding', building: 'house', rotation, origin }) as { id: number }).id;
const levelUp = (sim: SimState, id: number) => apply(sim, { type: 'levelUpHouse', houseId: id });
const keys = (cells: ReadonlyArray<readonly [number, number]>) => cells.map(c => cellKey(c[0], c[1])).sort();
const occ = (sim: SimState, id: number) => keys(placementCells(sim.buildings.get(id)!.placement));

describe('costs', () => {
  it('starting coins buy 1 house + 2 farm plots', () => {
    expect(balance.startingCoins).toBe(balance.costs.house.coins + 2 * balance.costs.farmPlot.coins);
    expect(createSim({ seed: 1 }).coins).toBe(balance.startingCoins);
  });
  it('placing deducts coins; the market is free', () => {
    const sim = createSim({ seed: 1 });
    expect(apply(sim, { type: 'placeBuilding', building: 'market', rotation: 0, origin: [8, 0] }).ok).toBe(true);
    expect(sim.coins).toBe(80);
    house(sim);
    expect(sim.coins).toBe(30);
    apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [0, 6] });
    expect(sim.coins).toBe(15);
  });
  it('insufficient coins changes nothing', () => {
    const sim = createSim({ seed: 1 });
    sim.coins = 49;
    const before = JSON.stringify(snapshot(sim));
    expect(apply(sim, { type: 'placeBuilding', building: 'house', rotation: 0, origin: [0, 0] })).toEqual({ ok: false, reason: 'not enough coins' });
    expect(JSON.stringify(snapshot(sim))).toBe(before);
  });
});

describe('house levels data', () => {
  it('every level is a superset of the previous and sits inside the frame', () => {
    for (let l = 1; l <= HOUSE_MAX_LEVEL; l++) {
      for (const [x, z] of houseCells(l)) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(HOUSE_FRAME[0]);
        expect(z).toBeGreaterThanOrEqual(0); expect(z).toBeLessThan(HOUSE_FRAME[1]);
      }
      if (l > 1) expect(keys(houseCells(l))).toEqual(expect.arrayContaining(keys(houseCells(l - 1))));
    }
  });
});

describe('level up', () => {
  it('costs coins, grows the footprint and logs it', () => {
    const sim = createSim({ seed: 1 });
    const id = house(sim);
    expect(sim.coins).toBe(30);
    expect(levelUp(sim, id)).toEqual({ ok: false, reason: 'not enough coins' });
    expect(sim.buildings.get(id)!.level).toBe(1);
    sim.coins = 100;
    expect(levelUpCheck(sim, id)).toMatchObject({ ok: true, cost: { coins: 70 }, blockedCells: [] });
    expect(levelUp(sim, id).ok).toBe(true);
    expect(sim.coins).toBe(30);
    expect(sim.buildings.get(id)!.level).toBe(2);
    expect(occ(sim, id).length).toBe(houseCells(2).length);
    expect(sim.log.at(-1)).toMatchObject({ kind: 'levelUp', houseId: id, level: 2 });
    for (const k of occ(sim, id)) expect(sim.world.occupied.get(k)).toBe(sim.buildings.get(id)!.placement.id);
  });
  it('level costs follow the balance table', () => {
    const sim = createSim({ seed: 1 });
    const id = house(sim);
    for (let l = 1; l < HOUSE_MAX_LEVEL; l++) {
      expect(levelUpCheck(sim, id).cost).toEqual(balance.houseLevelCosts[l - 1]);
      sim.coins = 1000;
      expect(levelUp(sim, id).ok).toBe(true);
      expect(sim.coins).toBe(1000 - balance.houseLevelCosts[l - 1].coins);
    }
    expect(sim.buildings.get(id)!.level).toBe(HOUSE_MAX_LEVEL);
    sim.coins = 99999;
    expect(levelUpCheck(sim, id)).toMatchObject({ ok: false, reason: 'max level' });
    expect(levelUp(sim, id)).toEqual({ ok: false, reason: 'max level' });
  });
  it('is blocked by occupied cells, which are reported, with no state change', () => {
    const sim = createSim({ seed: 1 });
    const id = house(sim, [0, 0]);
    sim.coins = 500;
    // Lv2 adds frame cells (3,1) and (3,2)
    expect(apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [3, 1] }).ok).toBe(true);
    const c = sim.coins;
    const before = JSON.stringify(snapshot(sim));
    const check = levelUpCheck(sim, id);
    expect(check).toMatchObject({ ok: false, reason: 'blocked', blockedCells: [[3, 1]] });
    expect(levelUp(sim, id)).toEqual({ ok: false, reason: 'blocked' });
    expect(sim.coins).toBe(c);
    expect(JSON.stringify(snapshot(sim))).toBe(before); // levelUpCheck + failed command are pure
  });
  it('blocked by locked chunks too', () => {
    const sim = createSim({ seed: 1 });
    sim.coins = 500;
    const id = house(sim, [29, 0]); // Lv1 cells x 30..31 are unlocked; Lv2 adds x=32 (locked chunk)
    expect(levelUpCheck(sim, id)).toMatchObject({ ok: false, reason: 'blocked', blockedCells: [[32, 1], [32, 2]] });
  });
  it('removes tiles under newly claimed cells', () => {
    const sim = createSim({ seed: 1 });
    const id = house(sim);
    sim.coins = 200;
    apply(sim, { type: 'setTile', cells: [[3, 1]], kind: 'path' });
    expect(sim.tiles.has('3,1')).toBe(true);
    expect(levelUp(sim, id).ok).toBe(true);
    expect(sim.tiles.has('3,1')).toBe(false);
  });
  for (const rotation of [0, 1, 2, 3] as Rotation[]) {
    it(`the house never moves across level-ups (rotation ${rotation})`, () => {
      const sim = createSim({ seed: 1 });
      sim.coins = 100000;
      const id = house(sim, [5, 5], rotation);
      const [fw, fh] = rotatedFrame(HOUSE_FRAME, rotation);
      // local cell (1,1) exists at every level; track where it lands in the world
      const anchor = rotateInFrame([[1, 1]], HOUSE_FRAME, rotation)[0];
      const world = [anchor[0] + 5, anchor[1] + 5].join(',');
      let prev = occ(sim, id);
      for (let l = 1; l <= HOUSE_MAX_LEVEL; l++) {
        const now = occ(sim, id);
        expect(now).toContain(world);
        expect(now).toEqual(expect.arrayContaining(prev));
        for (const k of now) { const [x, z] = k.split(',').map(Number); expect(x).toBeGreaterThanOrEqual(5); expect(x).toBeLessThan(5 + fw); expect(z).toBeGreaterThanOrEqual(5); expect(z).toBeLessThan(5 + fh); }
        expect(sim.buildings.get(id)!.placement.origin).toEqual([5, 5]);
        prev = now;
        if (l < HOUSE_MAX_LEVEL) expect(levelUp(sim, id).ok).toBe(true);
      }
    });
  }
  it('rotateInFrame turns the whole frame, not the cells', () => {
    const full = [] as [number, number][];
    for (let x = 0; x < 4; x++) for (let z = 0; z < 5; z++) full.push([x, z]);
    for (let r = 0; r < 4; r++) {
      const [w, h] = rotatedFrame(HOUSE_FRAME, r);
      expect(keys(rotateInFrame(full, HOUSE_FRAME, r))).toEqual(keys(Array.from({ length: w * h }, (_, i) => [Math.floor(i / h), i % h] as [number, number])));
    }
    expect(rotateInFrame([[1, 1]], HOUSE_FRAME, 1)).toEqual([[3, 1]]);
  });
});

describe('arrivals', () => {
  it('a resident moves in at Lv1, Lv3 and Lv6 only', () => {
    const sim = createSim({ seed: 4 });
    sim.coins = 100000;
    const id = house(sim);
    const counts = [sim.residents.size];
    for (let l = 2; l <= HOUSE_MAX_LEVEL; l++) { levelUp(sim, id); counts.push(sim.residents.size); }
    expect(counts).toEqual([1, 1, 2, 2, 2, 3, 3]);
    expect(sim.log.filter(e => e.kind === 'arrival')).toHaveLength(3);
    expect([...sim.residents.values()].every(r => r.homeId === id)).toBe(true);
  });
  it('every house brings its own (no first-house-only rule)', () => {
    const sim = createSim({ seed: 4 });
    sim.coins = 1000;
    house(sim, [0, 0]); house(sim, [10, 0]);
    expect(sim.residents.size).toBe(2);
  });
  it('names, species and traits are generated deterministically from the sim RNG', () => {
    const run = (seed: number) => {
      const sim = createSim({ seed }); sim.coins = 100000;
      const id = house(sim); for (let l = 2; l <= 6; l++) levelUp(sim, id);
      return [...sim.residents.values()].map(r => [r.name, r.species, r.trait]);
    };
    expect(run(9)).toEqual(run(9));
    expect(run(9)).not.toEqual(run(10));
    for (const [name, species, trait] of run(9)) {
      expect(balance.names).toContain(name);
      expect(['bunny', 'bear', 'cat', 'fox', 'frog']).toContain(species);
      expect(Object.keys(balance.traits)).toContain(trait);
    }
    const names = run(9).map(r => r[0]);
    expect(new Set(names).size).toBe(names.length);
  });
  it('arrival log entries point at real residents', () => {
    const sim = createSim({ seed: 1 });
    const id = house(sim);
    expect(sim.log).toEqual([{ t: sim.t, kind: 'arrival', residentId: 1, houseId: id }]);
  });
});

describe('traits', () => {
  /** House + plot (+ market) with resident 1 forced to a trait/role. */
  function setup(trait: TraitId, role: 'farmer' | 'hauler' | 'seller' | null = null) {
    const sim = createSim({ seed: 1 });
    sim.coins = 1000;
    house(sim, [0, 0]);
    apply(sim, { type: 'placeBuilding', building: 'market', rotation: 0, origin: [8, 0] });
    const r = sim.residents.get(1)!;
    r.trait = trait; r.role = role;
    return sim;
  }
  const firstTask = (sim: SimState, action: string) => {
    const r = sim.residents.get(1)!;
    for (let i = 0; i < 400 && r.task?.action !== action; i++) advance(sim, 0.5);
    return r.task!.end - r.task!.start;
  };
  const stockMarket = (sim: SimState) => {
    const m = sim.buildings.get(2)!; m.stock!.carrot = 3; syncMarket(sim, m); // posts the sell job and wakes the village
  };
  const plant = (sim: SimState) => apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [0, 6] });

  it('greenThumb speeds plant/water/harvest by 1.15', () => {
    const base = setup('sturdy'); plant(base);
    const gt = setup('greenThumb'); plant(gt);
    expect(firstTask(base, 'work')).toBeCloseTo(balance.times.plant);
    expect(firstTask(gt, 'work')).toBeCloseTo(balance.times.plant / 1.15);
  });
  it('greenThumb stacks with the farmer specialist bonus', () => {
    const sim = setup('greenThumb', 'farmer'); plant(sim);
    expect(firstTask(sim, 'work')).toBeCloseTo(balance.times.plant / (1.15 * balance.specialistMultiplier));
  });
  it('greenThumb does not speed selling', () => {
    const sim = setup('greenThumb'); stockMarket(sim);
    expect(firstTask(sim, 'sell')).toBeCloseTo(balance.times.sell);
  });
  it('chatty sells 1.3x faster', () => {
    const sim = setup('chatty'); stockMarket(sim);
    expect(firstTask(sim, 'sell')).toBeCloseTo(balance.times.sell / 1.3);
    const seller = setup('chatty', 'seller'); stockMarket(seller);
    expect(firstTask(seller, 'sell')).toBeCloseTo(balance.times.sell / (1.3 * balance.specialistMultiplier)); // stacks
  });
  it('sturdy hauls two crates in one trip and consumes the matching job', () => {
    const sim = setup('sturdy', 'hauler');
    plant(sim);
    const plot = sim.buildings.get(3)!;
    plot.crates = 2; plot.plotState = 'growing';
    syncPlot(sim, plot);
    const r = sim.residents.get(1)!;
    for (let i = 0; i < 400 && !r.carrying; i++) advance(sim, 0.25);
    expect(r.carrying).toBe(2);
    expect(plot.crates).toBe(0);
    expect([...sim.jobs.values()].filter(j => j.kind === 'haul' && j.targetId === plot.id)).toHaveLength(1); // only the one being carried
    for (let i = 0; i < 400 && sim.stats.delivered < 2; i++) advance(sim, 0.25);
    expect(sim.stats.delivered).toBe(2);
    expect(sim.buildings.get(2)!.stock!.carrot).toBeGreaterThanOrEqual(0);
  });
  it('sturdy leaves crates another hauler already claimed', () => {
    const sim = setup('sturdy', 'hauler');
    plant(sim);
    const plot = sim.buildings.get(3)!;
    plot.crates = 2; plot.plotState = 'growing'; syncPlot(sim, plot);
    const [a, b] = [...sim.jobs.values()].filter(j => j.kind === 'haul');
    b.claimedBy = 99; // somebody else will collect this crate
    void a;
    const r = sim.residents.get(1)!;
    for (let i = 0; i < 400 && !r.carrying; i++) advance(sim, 0.25);
    expect(r.carrying).toBe(1);
    expect(plot.crates).toBe(1);
  });
  it('a non-sturdy hauler carries one crate', () => {
    const sim = setup('chatty', 'hauler');
    plant(sim);
    const plot = sim.buildings.get(3)!;
    plot.crates = 2; plot.plotState = 'growing'; syncPlot(sim, plot);
    const r = sim.residents.get(1)!;
    for (let i = 0; i < 400 && !r.carrying; i++) advance(sim, 0.25);
    expect(r.carrying).toBe(1);
  });
  it('sleepy starts work 0.05 of a day late', () => {
    const jobStart = (trait: TraitId) => {
      const sim = setup(trait); plant(sim);
      const r = sim.residents.get(1)!;
      while (r.jobId === null) advance(sim, 0.5);
      return sim.t;
    };
    expect(jobStart('sleepy') - jobStart('sturdy')).toBeGreaterThanOrEqual(0.05 * DAY_LENGTH - 0.5);
    expect(jobStart('sleepy') - jobStart('sturdy')).toBeLessThanOrEqual(0.05 * DAY_LENGTH + 0.5);
  });
});

describe('tiles', () => {
  const village = () => { const sim = createSim({ seed: 1 }); sim.coins = 100; return sim; };
  it('place path/lane with per-tile cost; remove without refund', () => {
    const sim = village();
    expect(apply(sim, { type: 'setTile', cells: [[0, 0], [1, 0], [2, 0]], kind: 'path' }).ok).toBe(true);
    expect(sim.coins).toBe(100 - 3 * balance.costs.path.coins);
    expect(apply(sim, { type: 'setTile', cells: [[1, 0]], kind: 'lane' }).ok).toBe(true);
    expect(sim.tiles.get('1,0')).toBe('lane');
    expect(sim.coins).toBe(97 - balance.costs.lane.coins);
    const c = sim.coins;
    apply(sim, { type: 'setTile', cells: [[0, 0]], kind: 'path' }); // same kind: free no-op
    expect(sim.coins).toBe(c);
    expect(apply(sim, { type: 'setTile', cells: [[0, 0], [1, 0]], kind: null }).ok).toBe(true);
    expect(sim.tiles.has('0,0')).toBe(false);
    expect(sim.coins).toBe(c);
  });
  it('rejects blocked cells and too little coins without changing anything', () => {
    const sim = village();
    house(sim, [0, 0]); // costs 50
    const before = JSON.stringify(snapshot(sim));
    expect(apply(sim, { type: 'setTile', cells: [[1, 1]], kind: 'path' }).ok).toBe(false); // house cell
    expect(apply(sim, { type: 'setTile', cells: [[500, 0]], kind: 'path' }).ok).toBe(false); // locked
    sim.coins = 1;
    const b2 = JSON.stringify(snapshot(sim));
    expect(apply(sim, { type: 'setTile', cells: [[10, 10], [11, 10]], kind: 'path' })).toEqual({ ok: false, reason: 'not enough coins' });
    expect(JSON.stringify(snapshot(sim))).toBe(b2);
    expect(before).toBeTruthy();
  });
  it('building over a tile removes it', () => {
    const sim = village();
    apply(sim, { type: 'setTile', cells: [[3, 3]], kind: 'path' });
    apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [3, 3] });
    expect(sim.tiles.has('3,3')).toBe(false);
  });
  it('paths and lanes both speed walking', () => {
    const sim = village();
    const bare = findPath(sim.world, surfaceLookup(sim), [0, 0], [6, 0])!.cost;
    apply(sim, { type: 'setTile', cells: [[1, 0], [2, 0], [3, 0]], kind: 'path' });
    apply(sim, { type: 'setTile', cells: [[4, 0], [5, 0], [6, 0]], kind: 'lane' });
    const fast = findPath(sim.world, surfaceLookup(sim), [0, 0], [6, 0])!.cost;
    expect(bare).toBe(6);
    expect(fast).toBeCloseTo(3 / balance.pathSpeedMultiplier + (3 * balance.walkSpeed) / balance.walking.speed.lane);
  });
  it('snapshot includes tiles deterministically', () => {
    const a = village(), b = village();
    apply(a, { type: 'setTile', cells: [[1, 0], [0, 0]], kind: 'path' });
    apply(b, { type: 'setTile', cells: [[0, 0], [1, 0]], kind: 'path' });
    expect(snapshot(a)).toEqual(snapshot(b));
  });
});

describe('growth integration', () => {
  it('a starter village earns enough to afford Lv2 within a few days', () => {
    const sim = createSim({ seed: 1 });
    apply(sim, { type: 'placeBuilding', building: 'market', rotation: 0, origin: [8, 0] });
    house(sim, [0, 0]);
    apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [0, 6] });
    apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [2, 6] });
    expect(sim.coins).toBe(0);
    advance(sim, 4 * DAY_LENGTH);
    expect(sim.coins).toBeGreaterThanOrEqual(balance.houseLevelCosts[0].coins);
  });
});
