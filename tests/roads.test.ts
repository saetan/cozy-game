import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import balance from '../src/data/balance.json';
import { CELL } from '../src/kit/index.js';
import { buildRoadItems } from '../src/render/roadView';
import { apply, createSim, type SimState } from '../src/sim/sim';
import { costOf } from '../src/sim/costs';
import { isBend, laneJoinProblem, streetConn, streetTileCells, streetTileOf, surfaceAt, surfaceLookup } from '../src/sim/surfaces';
import { findPath, WALKING } from '../src/systems/pathfinding';
import { deserialize, serialize, SAVE_VERSION, type SaveData } from '../src/systems/save';
import type { Cell, StreetKind, TileKind } from '../src/sim/state';

const rich = () => { const s = createSim({ seed: 1 }); s.coins = 100000; return s; };
const street = (sim: SimState, tiles: Cell[], kind: StreetKind = 'road') => apply(sim, { type: 'setStreet', tiles, kind });
const tile = (sim: SimState, cells: Cell[], kind: TileKind | null) => apply(sim, { type: 'setTile', cells, kind });
const house = (sim: SimState, origin: Cell) => apply(sim, { type: 'placeBuilding', building: 'house', rotation: 0, origin });
const reason = (r: { ok: boolean; reason?: string }) => (r.ok ? null : r.reason);

describe('6 m tile cell mapping', () => {
  it('tile (i, j) covers cells 3i..3i+2, 3j..3j+2', () => {
    expect(streetTileCells(2, 1).map(c => c.join(','))).toEqual(['6,3', '7,3', '8,3', '6,4', '7,4', '8,4', '6,5', '7,5', '8,5']);
  });
  it('uses floor division for negative coordinates', () => {
    expect(streetTileOf(0, 0)).toEqual([0, 0]); expect(streetTileOf(2, 2)).toEqual([0, 0]); expect(streetTileOf(3, -1)).toEqual([1, -1]);
    expect(streetTileOf(-1, -1)).toEqual([-1, -1]); expect(streetTileOf(-3, -4)).toEqual([-1, -2]); expect(streetTileOf(-4, -6)).toEqual([-2, -2]);
    expect(streetTileCells(-1, -1).map(c => c.join(','))).toContain('-3,-3'); expect(streetTileCells(-1, -1).map(c => c.join(','))).toContain('-1,-1');
  });
  it('every cell of a placed tile reads back as street, including at negative tiles', () => {
    const sim = rich(); expect(street(sim, [[-2, -1]]).ok).toBe(true);
    for (const [x, z] of streetTileCells(-2, -1)) expect(surfaceAt(sim, x, z)).toBe('street');
    expect(surfaceAt(sim, -7, -3)).toBe('grass'); expect(surfaceAt(sim, -3, -3)).toBe('grass'); expect(surfaceAt(sim, -4, -3)).toBe('street');
  });
});

describe('placing streets', () => {
  it('needs the whole 3x3 block unlocked and free of buildings', () => {
    const sim = rich();
    expect(reason(street(sim, [[100, 100]]))).toBe('some cells blocked or locked');
    house(sim, [3, 3]);
    expect(reason(street(sim, [[1, 1]]))).toBe('blocked: a building is in the way');
    expect(reason(street(sim, [[0, 0]]))).toBeNull(); // a free block elsewhere is fine
    expect(sim.streets.size).toBe(1);
  });
  it('replaces lanes and paths inside the block', () => {
    const sim = rich(); tile(sim, [[3, 3], [4, 3], [5, 3], [6, 3]], 'path');
    expect(street(sim, [[1, 1]]).ok).toBe(true);
    expect([...sim.tiles.keys()]).toEqual(['6,3']);
  });
  it('blocks buildings on street and dirt road cells, and on house growth', () => {
    const sim = rich(); street(sim, [[0, 0]]); street(sim, [[1, 0]], 'dirt');
    expect(reason(house(sim, [2, 0]))).toContain('blocked'); // overlaps tile (0,0) and (1,0)
    expect(reason(apply(sim, { type: 'placeBuilding', building: 'shrub', rotation: 0, origin: [4, 1] }))).toContain('blocked');
    expect(apply(sim, { type: 'placeBuilding', building: 'shrub', rotation: 0, origin: [6, 1] }).ok).toBe(true);
  });
  it('1-cell tiles cannot go on a street cell', () => {
    const sim = rich(); street(sim, [[0, 0]]);
    expect(reason(tile(sim, [[1, 1]], 'path'))).toContain('street');
  });
  it('costs per tile, and is rejected without coins', () => {
    const sim = rich(); sim.coins = 100;
    street(sim, [[0, 0], [1, 0]]); expect(sim.coins).toBe(100 - 2 * balance.costs.street.coins);
    street(sim, [[0, 1]], 'dirt'); expect(sim.coins).toBe(100 - 2 * 18 - balance.costs.dirtRoad.coins);
    const c = sim.coins; street(sim, [[0, 0]]); expect(sim.coins).toBe(c); // same kind: free no-op
    sim.coins = 5; expect(street(sim, [[5, 5]])).toEqual({ ok: false, reason: 'not enough coins' });
    expect(sim.streets.has('5,5')).toBe(false);
  });
  it('catalog costs', () => {
    expect([costOf('street').coins, costOf('dirtRoad').coins, costOf('lane').coins, costOf('dirtLane').coins, costOf('path').coins]).toEqual([18, 9, 2, 1, 1]);
    const sim = rich(); sim.coins = 20;
    tile(sim, [[0, 0], [1, 0], [2, 0]], 'lane'); expect(sim.coins).toBe(14);
    tile(sim, [[0, 1], [1, 1]], 'dirtLane'); expect(sim.coins).toBe(12);
    tile(sim, [[0, 2]], 'path'); expect(sim.coins).toBe(11);
  });
});

describe('neighbour connections', () => {
  const m = (...t: Cell[]) => new Map(t.map(([i, j]) => [`${i},${j}`, 'road' as StreetKind]));
  it('reads the four sides and tells a bend from a straight', () => {
    expect(streetConn(m([0, 0], [1, 0]), 0, 0)).toEqual({ N: false, E: true, S: false, W: false });
    expect(isBend(streetConn(m([0, 0], [1, 0], [0, 1]), 0, 0))).toBe(true);
    expect(isBend(streetConn(m([0, 0], [1, 0], [-1, 0]), 0, 0))).toBe(false);
    expect(isBend(streetConn(m([0, 0], [1, 0], [-1, 0], [0, 1]), 0, 0))).toBe(false); // T
  });
});

describe('lane to street join rule', () => {
  it('is fine on a flat sidewalk edge (plaza, dead end, straight, the flat side of a T)', () => {
    const sim = rich(); street(sim, [[1, 1]]);
    for (const c of [[6, 3], [6, 4], [6, 5], [2, 4], [4, 2], [4, 6]] as Cell[]) expect(reason(tile(sim, [c], 'dirtLane'))).toBeNull();
    const t = rich(); street(t, [[0, 0], [1, 0], [2, 0], [1, -1]]); // T: stem north, flat side south
    expect(reason(tile(t, [[4, 3]], 'lane'))).toBeNull();
  });
  it('is refused at a street cell (a junction arm is always another street tile)', () => {
    const sim = rich(); street(sim, [[0, 0], [1, 0]]);
    expect(reason(tile(sim, [[4, 1]], 'dirtLane'))).toContain('street');
  });
  it('joins a dirt road on a flat edge, both ways round (lane first or dirt road first)', () => {
    const sim = rich(); street(sim, [[0, 5]], 'dirt');
    expect(reason(tile(sim, [[1, 14]], 'dirtLane'))).toBeNull();
    const t = rich(); tile(t, [[9, 4], [10, 4], [11, 4]], 'dirtLane');
    expect(reason(street(t, [[4, 1]], 'dirt'))).toBeNull();
  });
  it("is refused on the outer corner of a bend", () => {
    const sim = rich(); street(sim, [[1, 1], [2, 1], [1, 2]]); // tile (1,1) bends east/south
    expect(reason(tile(sim, [[2, 4]], 'dirtLane'))).toContain('bend'); // west side
    expect(reason(tile(sim, [[4, 2]], 'lane'))).toContain('bend'); // north side
    expect(sim.tiles.size).toBe(0);
  });
  it('refuses a street edit that would break an existing join, and an erase that would', () => {
    const sim = rich(); street(sim, [[0, 0], [1, 0]]); // (1,0) is a dead end
    expect(tile(sim, [[3, 3]], 'dirtLane').ok).toBe(true); // below (1,0): flat
    const before = JSON.stringify([...sim.streets]);
    expect(reason(street(sim, [[1, -1]]))).toContain('bend'); // (1,0) would bend west/north
    expect(JSON.stringify([...sim.streets])).toBe(before);
    expect(reason(street(sim, [[1, 0]], 'dirt'))).toBeNull(); // switching to a dirt road keeps the flat join
    const t = rich(); street(t, [[0, 0], [1, 0], [2, 0], [1, -1]]); tile(t, [[3, 3]], 'lane');
    const r = tile(t, [[7, 1]], null); // erase (2,0): (1,0) would become a bend
    expect(reason(r)).toContain('cannot erase'); expect(t.streets.size).toBe(4);
  });
  it('is not needed when erasing the street a lane joins: the lane just becomes a dead end', () => {
    const sim = rich(); street(sim, [[1, 1]]); tile(sim, [[6, 4]], 'dirtLane');
    expect(tile(sim, [[4, 4]], null).ok).toBe(true);
    expect(sim.streets.size).toBe(0); expect(sim.tiles.has('6,4')).toBe(true);
    expect(laneJoinProblem(sim.streets, sim.tiles)).toBeNull();
  });
});

describe('erase', () => {
  it('removes a whole 6 m tile from any of its cells, and a single lane or path elsewhere, without refund', () => {
    const sim = rich(); street(sim, [[0, 0]]); street(sim, [[1, 0]], 'dirt'); tile(sim, [[0, 3], [1, 3]], 'path');
    const coins = sim.coins;
    expect(tile(sim, [[2, 2]], null).ok).toBe(true);
    expect([...sim.streets.keys()]).toEqual(['1,0']);
    expect(tile(sim, [[0, 3]], null).ok).toBe(true);
    expect([...sim.tiles.keys()]).toEqual(['1,3']);
    expect(sim.coins).toBe(coins);
  });
});

describe('surfaces and speeds', () => {
  it('surfaceAt tells every kind apart', () => {
    const sim = rich(); street(sim, [[0, 0]]); street(sim, [[1, 0]], 'dirt');
    tile(sim, [[0, 3]], 'path'); tile(sim, [[1, 3]], 'lane'); tile(sim, [[2, 3]], 'dirtLane');
    expect(['2,2', '3,0', '5,2', '6,0', '0,3', '1,3', '2,3', '3,3'].map(k => surfaceAt(sim, ...(k.split(',').map(Number) as Cell))))
      .toEqual(['street', 'dirtRoad', 'dirtRoad', 'grass', 'path', 'lane', 'dirtLane', 'grass']);
    expect(surfaceLookup(sim).get('4,1')).toBe('dirtRoad'); // pathfinding sees all 9 cells
  });
  const cost = (sim: SimState, to: Cell, speeds: Record<string, number>) => findPath(sim.world, surfaceLookup(sim), [-1, 1], to, speeds)!.cost;
  it('a car is faster on a street than on a dirt lane, and a street beats a dirt road', () => {
    const car = balance.vehicles.car.speed;
    const a = rich(), b = rich(), c = rich();
    street(a, [[0, 0], [1, 0], [2, 0]]);
    tile(b, Array.from({ length: 9 }, (_, i) => [i, 1] as Cell), 'dirtLane');
    street(c, [[0, 0], [1, 0], [2, 0]], 'dirt');
    expect(cost(a, [9, 1], car)).toBeLessThan(cost(b, [9, 1], car));
    expect(cost(a, [9, 1], car)).toBeLessThan(cost(c, [9, 1], car));
  });
  it('path is foot only: vehicles move at grass speed on it, walkers are faster', () => {
    for (const v of Object.values(balance.vehicles)) expect(v.speed.path).toBe(v.speed.grass);
    const sim = rich(); tile(sim, Array.from({ length: 9 }, (_, i) => [i, 1] as Cell), 'path');
    const bare = rich();
    expect(cost(sim, [9, 1], balance.vehicles.car.speed)).toBeCloseTo(cost(bare, [9, 1], balance.vehicles.car.speed));
    expect(cost(sim, [9, 1], WALKING)).toBeLessThan(cost(bare, [9, 1], WALKING));
  });
  it('walking on grass and path is unchanged', () => {
    expect(WALKING.grass).toBe(balance.walkSpeed); expect(WALKING.path).toBe(balance.walkSpeed * balance.pathSpeedMultiplier);
  });
});

describe('save v4', () => {
  const base = () => {
    const sim = createSim({ seed: 3 }); sim.coins = 1000; house(sim, [-8, 0]);
    tile(sim, [[0, 3]], 'path'); tile(sim, [[1, 3]], 'dirtLane');
    return JSON.parse(JSON.stringify(serialize(sim, 5))) as unknown as { version: number; sim: Record<string, any> } & SaveData;
  };
  const asV3 = () => { const d = base() as any; d.version = 3; delete d.sim.streets; d.sim.tiles = [['0,3', 'path'], ['1,3', 'road']]; return d as SaveData; };
  it('round-trips streets', () => {
    const sim = rich(); street(sim, [[0, 0], [-1, 2]]); street(sim, [[3, 3]], 'dirt');
    const back = deserialize(JSON.parse(JSON.stringify(serialize(sim, 1))));
    expect([...back.streets]).toEqual([...sim.streets]);
    expect(SAVE_VERSION).toBe(5);
  });
  it('v3 -> v4: road cells become dirt lanes, paths stay, no streets', () => {
    const sim = deserialize(asV3());
    expect([...sim.tiles]).toEqual([['0,3', 'path'], ['1,3', 'dirtLane']]);
    expect(sim.streets.size).toBe(0); expect(serialize(sim).version).toBe(SAVE_VERSION);
  });
  it('v2 -> v4 and v1 -> v4 chain the older migrations', () => {
    const d2 = asV3() as any; d2.version = 2; for (const r of d2.sim.residents) delete r.vehicle;
    const s2 = deserialize(d2);
    expect([...s2.residents.values()].every(r => r.vehicle === null)).toBe(true); expect(s2.tiles.get('1,3')).toBe('dirtLane');
    const d1 = asV3() as any; d1.version = 1; delete d1.sim.unlockedCrops; delete d1.sim.chunksBought; for (const r of d1.sim.residents) delete r.vehicle;
    const s1 = deserialize(d1);
    expect(s1.unlockedCrops).toEqual(['carrot']); expect(s1.tiles.get('1,3')).toBe('dirtLane'); expect(s1.streets.size).toBe(0);
  });
});

describe('road rendering matches the sim', () => {
  const sim = rich(); street(sim, [[0, 0], [-1, 0], [0, -1]]); street(sim, [[2, 2]], 'dirt');
  tile(sim, [[-5, 1], [-5, 2]], 'dirtLane'); tile(sim, [[9, -3]], 'lane'); tile(sim, [[9, -2], [10, -2]], 'path');
  const items = buildRoadItems(sim);
  it('a 6 m tile is centred on the middle of its 3x3 cells, and a lane or path piece on its cell', () => {
    for (const [i, j] of [[0, 0], [-1, 0], [0, -1], [2, 2]]) {
      const it = items.find(x => x.key.startsWith(`road:${i},${j}:`))!;
      const cells = streetTileCells(i, j), mx = cells.reduce((a, c) => a + c[0] + 0.5, 0) / 9 * CELL, mz = cells.reduce((a, c) => a + c[1] + 0.5, 0) / 9 * CELL;
      expect([it.x, it.z]).toEqual([mx, mz]);
    }
    for (const [x, z] of [[-5, 1], [-5, 2], [9, -3], [9, -2], [10, -2]]) {
      const it = items.find(i => i.key.includes(`:${x},${z}:`) && !i.key.startsWith('laneMouth'))!;
      expect([it.x, it.z]).toEqual([(x + 0.5) * CELL, (z + 0.5) * CELL]);
    }
  });
  it('the built piece spans the tile footprint (a plaza centred on its cells)', () => {
    const solo = createSim({ seed: 1 }); solo.coins = 1000; street(solo, [[-2, 1]]);
    const it = buildRoadItems(solo)[0], o = it.make(); o.position.set(it.x, it.y, it.z); o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3());
    expect(c.x).toBeCloseTo(-9, 1); expect(c.z).toBeCloseTo(9, 1);
    expect(box.max.x - box.min.x).toBeCloseTo(6, 1);
  });
  it('a lane at a dirt road gets a dirt spur from the shared edge into the tile (none at a street)', () => {
    const s = rich(); street(s, [[3, 1], [4, 1], [5, 1]], 'dirt'); street(s, [[3, -3]]);
    tile(s, [[13, 1], [13, 2]], 'dirtLane'); tile(s, [[10, -6], [10, -7]], 'dirtLane'); // the second meets the street (3,-3) from the south
    const spurs = buildRoadItems(s).filter(i => i.key.startsWith('dirtSpur:'));
    expect(spurs.map(i => i.key)).toEqual(['dirtSpur:13,2:S']);
    const o = spurs[0].make(); o.position.set(spurs[0].x, 0, spurs[0].z); o.rotation.y = spurs[0].ry; o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    expect(box.min.z).toBeCloseTo(6, 1); // starts on the edge between the lane cell (z 2) and the tile (z 3..5)
    expect(box.max.z).toBeGreaterThan(6 + 1.4); // reaches past the grass margin onto the 3.2 m dirt surface
  });
  it('keys change only where the neighbourhood changed (diff by key)', () => {
    const before = new Set(items.map(i => i.key));
    street(sim, [[0, 1]]); // joins (0,0) from the south; far pieces keep their keys
    const after = buildRoadItems(sim), kept = after.filter(i => before.has(i.key)).map(i => i.key);
    expect(kept).toContain(items.find(i => i.key.startsWith('road:2,2:'))!.key);
    expect(kept.some(k => k.startsWith('path:'))).toBe(true);
    expect(after.some(i => i.key.startsWith('road:0,0:') && before.has(i.key))).toBe(false);
  });
  it('a dirt lane joined to a street gets its mouth piece, and the street a dropped kerb', () => {
    const s = rich(); street(s, [[1, 1]]); tile(s, [[6, 4], [7, 4]], 'dirtLane');
    const keys = buildRoadItems(s).map(i => i.key);
    expect(keys.some(k => k.startsWith('laneMouth:6,4:'))).toBe(true);
    const plain = rich(); street(plain, [[1, 1]]);
    expect(keys.find(k => k.startsWith('road:1,1:'))).not.toBe(buildRoadItems(plain)[0].key); // the cut is in the key
  });
});
