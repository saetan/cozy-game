import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { advance, apply, createSim, levelUpCheck, snapshot, type SimState } from '../src/sim/sim';
import { chunkPrice } from '../src/sim/commands';
import { market, syncMarket } from '../src/sim/jobs';
import { cellKey } from '../src/sim/world';
import { placementCells, type Rotation } from '../src/systems/placement';
import { createMemoryStore, deserialize, serialize, SAVE_VERSION, type SaveData } from '../src/systems/save';

const place = (sim: SimState, building: 'house' | 'farmPlot' | 'market', origin: [number, number], rotation: Rotation = 0) =>
  (apply(sim, { type: 'placeBuilding', building, rotation, origin }) as { id: number }).id;
const levelUp = (sim: SimState, id: number) => apply(sim, { type: 'levelUp', buildingId: id });
const cells = (sim: SimState, id: number) => placementCells(sim.buildings.get(id)!.placement).map(c => cellKey(c[0], c[1])).sort();

describe('crops', () => {
  it('unlockCrop charges the unlock price and unlocks in order', () => {
    const sim = createSim({ seed: 1 });
    expect(sim.unlockedCrops).toEqual(['carrot']);
    expect(apply(sim, { type: 'unlockCrop', crop: 'cabbage' })).toEqual({ ok: false, reason: 'not enough coins' });
    sim.coins = 1000;
    expect(apply(sim, { type: 'unlockCrop', crop: 'cabbage' }).ok).toBe(true);
    expect(sim.coins).toBe(1000 - balance.crops.cabbage.unlock);
    expect(sim.unlockedCrops).toEqual(['carrot', 'cabbage']);
    expect(apply(sim, { type: 'unlockCrop', crop: 'cabbage' })).toEqual({ ok: false, reason: 'already unlocked' });
    expect(apply(sim, { type: 'unlockCrop', crop: 'carrot' })).toEqual({ ok: false, reason: 'already unlocked' });
    expect(apply(sim, { type: 'unlockCrop', crop: 'kale' })).toEqual({ ok: false, reason: 'unknown crop' });
    expect(sim.coins).toBe(1000 - balance.crops.cabbage.unlock);
  });
  it('setCrop needs an unlocked crop and a farm plot', () => {
    const sim = createSim({ seed: 1 }); sim.coins = 1000;
    const plot = place(sim, 'farmPlot', [0, 6]), h = place(sim, 'house', [10, 0]);
    expect(apply(sim, { type: 'setCrop', plotId: plot, crop: 'wheat' })).toEqual({ ok: false, reason: 'crop not unlocked' });
    expect(apply(sim, { type: 'setCrop', plotId: h, crop: 'carrot' })).toEqual({ ok: false, reason: 'not a farm plot' });
    apply(sim, { type: 'unlockCrop', crop: 'wheat' });
    expect(apply(sim, { type: 'setCrop', plotId: plot, crop: 'wheat' }).ok).toBe(true);
    expect(sim.buildings.get(plot)!.crop).toBe('wheat');
  });
  it('setCrop never resets a growing plot; it applies at the next planting', () => {
    const sim = createSim({ seed: 1 }); sim.coins = 1000;
    place(sim, 'market', [0, 0]); place(sim, 'house', [-8, 0]);
    const plot = place(sim, 'farmPlot', [0, 6]), b = sim.buildings.get(plot)!;
    apply(sim, { type: 'unlockCrop', crop: 'cabbage' });
    for (let i = 0; i < 400 && b.plotState !== 'growing'; i++) advance(sim, 1);
    expect(b.growCrop).toBe('carrot');
    apply(sim, { type: 'setCrop', plotId: plot, crop: 'cabbage' });
    expect(b.plotState).toBe('growing'); expect(b.growCrop).toBe('carrot');
    for (let i = 0; i < 3000 && b.growCrop !== 'cabbage'; i++) advance(sim, 1);
    expect(b.growCrop).toBe('cabbage');
  });
  it('a pumpkin plot sells for the pumpkin price; stock is per crop', () => {
    const sim = createSim({ seed: 1 }); sim.coins = 5000;
    place(sim, 'market', [0, 0]); place(sim, 'house', [-8, 0]);
    const plot = place(sim, 'farmPlot', [0, 6]);
    apply(sim, { type: 'unlockCrop', crop: 'pumpkin' }); apply(sim, { type: 'setCrop', plotId: plot, crop: 'pumpkin' });
    const c0 = sim.coins;
    for (let i = 0; i < 10 && sim.stats.sold < 2; i++) advance(sim, 1000);
    expect(sim.stats.sold).toBeGreaterThanOrEqual(2);
    expect(sim.stats.earned).toBe(sim.stats.sold * balance.crops.pumpkin.price);
    expect(sim.coins - c0).toBe(sim.stats.earned);
    const m = market(sim)!;
    expect(m.stock!.carrot).toBe(0);
    expect(m.stock!.pumpkin).toBeGreaterThanOrEqual(0);
  });
  it('sells the most valuable crop first', () => {
    const sim = createSim({ seed: 1 });
    const m = sim.buildings.get(place(sim, 'market', [0, 0]))!; place(sim, 'house', [-8, 0]);
    Object.assign(m.stock!, { carrot: 1, pumpkin: 1, wheat: 1 }); syncMarket(sim, m);
    const seen: number[] = []; let last = sim.coins;
    for (let i = 0; i < 600 && seen.length < 3; i++) { advance(sim, 1); if (sim.coins !== last) { seen.push(sim.coins - last); last = sim.coins; } }
    expect(seen).toEqual([52, 24, 10]);
  });
});

describe('market levels', () => {
  it('Lv1 is 2x2; Lv2/Lv3 cost coins and add one stall of cells each', () => {
    const sim = createSim({ seed: 1 }); sim.coins = 0;
    const id = place(sim, 'market', [0, 0]);
    expect(cells(sim, id)).toEqual(['0,0', '0,1', '1,0', '1,1']);
    expect(levelUpCheck(sim, id)).toMatchObject({ ok: false, reason: 'not enough coins', cost: { coins: 300 } });
    sim.coins = 300; expect(levelUp(sim, id).ok).toBe(true);
    expect(sim.coins).toBe(0); expect(cells(sim, id).length).toBe(6);
    expect(levelUpCheck(sim, id)).toMatchObject({ cost: { coins: 800 } });
    sim.coins = 800; expect(levelUp(sim, id).ok).toBe(true);
    expect(cells(sim, id).length).toBe(8);
    expect(levelUp(sim, id)).toEqual({ ok: false, reason: 'max level' });
  });
  it('is blocked by buildings on its new cells, and a failed level-up changes nothing', () => {
    const sim = createSim({ seed: 1 }); sim.coins = 2000;
    const id = place(sim, 'market', [0, 0]); place(sim, 'farmPlot', [2, 1]);
    const before = JSON.stringify(snapshot(sim));
    expect(levelUpCheck(sim, id)).toMatchObject({ ok: false, reason: 'blocked', blockedCells: [[2, 1]] });
    expect(levelUp(sim, id)).toEqual({ ok: false, reason: 'blocked' });
    expect(JSON.stringify(snapshot(sim))).toBe(before);
  });
  for (const rotation of [0, 1, 2, 3] as Rotation[]) {
    it(`never shifts across levels (rotation ${rotation})`, () => {
      const sim = createSim({ seed: 1 }); sim.coins = 5000;
      const id = place(sim, 'market', [5, 5], rotation);
      let prev = cells(sim, id);
      for (let l = 2; l <= 3; l++) {
        expect(levelUp(sim, id).ok).toBe(true);
        const now = cells(sim, id);
        expect(prev.every(c => now.includes(c))).toBe(true);
        expect(now.length).toBe(prev.length + 2);
        prev = now;
      }
      expect(sim.buildings.get(id)!.placement.origin).toEqual([5, 5]);
    });
  }
  it('a Lv3 market runs three concurrent sellers; Lv1 runs one', () => {
    const run = (level: number) => {
      const sim = createSim({ seed: 1 }); sim.coins = 5000;
      const id = place(sim, 'market', [0, 0]);
      for (let i = 1; i < level; i++) levelUp(sim, id);
      for (const z of [-8, 0, 8]) place(sim, 'house', [-8, z]);
      const m = sim.buildings.get(id)!; m.stock!.carrot = 30; syncMarket(sim, m);
      expect([...sim.jobs.values()].filter(j => j.kind === 'sell').length).toBe(level);
      let peak = 0;
      for (let i = 0; i < 300; i++) {
        advance(sim, 1);
        peak = Math.max(peak, [...sim.residents.values()].filter(r => r.task?.action === 'sell').length);
      }
      return peak;
    };
    expect(run(3)).toBe(3);
    expect(run(1)).toBe(1);
  });
});

describe('buyChunk', () => {
  it('buys an edge-adjacent locked chunk, with a price that rises each time', () => {
    const sim = createSim({ seed: 1 }); sim.coins = 10000;
    expect(chunkPrice(sim)).toEqual({ coins: 300 });
    expect(apply(sim, { type: 'buyChunk', cx: 2, cz: 0 }).ok).toBe(true);
    expect(sim.coins).toBe(9700); expect(sim.chunksBought).toBe(1);
    expect(sim.world.unlocked.has('2,0')).toBe(true);
    expect(chunkPrice(sim)).toEqual({ coins: 450 });
    apply(sim, { type: 'buyChunk', cx: 3, cz: 0 });
    expect(chunkPrice(sim)).toEqual({ coins: 675 });
    expect(sim.coins).toBe(9700 - 450);
  });
  it('refuses diagonal, far, owned, out-of-world and unaffordable chunks', () => {
    const sim = createSim({ seed: 1 }); sim.coins = 10000;
    expect(apply(sim, { type: 'buyChunk', cx: 2, cz: 2 })).toEqual({ ok: false, reason: 'must touch your land' });
    expect(apply(sim, { type: 'buyChunk', cx: 5, cz: 0 })).toEqual({ ok: false, reason: 'must touch your land' });
    expect(apply(sim, { type: 'buyChunk', cx: 0, cz: 0 })).toEqual({ ok: false, reason: 'already yours' });
    expect(apply(sim, { type: 'buyChunk', cx: 1000, cz: 0 })).toEqual({ ok: false, reason: 'outside the world' });
    sim.coins = 299;
    expect(apply(sim, { type: 'buyChunk', cx: 2, cz: 0 })).toEqual({ ok: false, reason: 'not enough coins' });
    expect(sim.chunksBought).toBe(0); expect(sim.coins).toBe(299);
  });
  it('lets buildings be placed on the new land', () => {
    const sim = createSim({ seed: 1 }); sim.coins = 1000;
    expect(apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [33, 0] }).ok).toBe(false);
    apply(sim, { type: 'buyChunk', cx: 2, cz: 0 });
    expect(apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [33, 0] }).ok).toBe(true);
  });
});

/** A save as v1 wrote it: one carrot, numeric market stock, frameless market. */
function v1Save(): SaveData {
  const sim = createSim({ seed: 1 }); sim.coins = 500;
  place(sim, 'market', [0, 0]); place(sim, 'house', [-8, 0]); place(sim, 'farmPlot', [0, 6]);
  advance(sim, 200);
  const d = serialize(sim, 123) as unknown as { version: number; sim: Record<string, any> };
  d.version = 1;
  delete d.sim.unlockedCrops; delete d.sim.chunksBought;
  for (const b of d.sim.buildings) if (b.type === 'market') { b.stock = 4; delete b.placement.frame; }
  return d as unknown as SaveData;
}

describe('save v2', () => {
  it('is version 2', () => expect(SAVE_VERSION).toBe(2));
  it('migrates a v1 save: carrot only, stock as carrot, Lv1 market, no land bought', () => {
    const sim = deserialize(v1Save());
    expect(sim.unlockedCrops).toEqual(['carrot']); expect(sim.chunksBought).toBe(0);
    const m = market(sim)!;
    expect(m.level).toBe(1); expect(m.stock).toMatchObject({ carrot: 4, cabbage: 0, wheat: 0, tomato: 0, pumpkin: 0 });
    expect(m.placement.frame).toEqual([4, 2]);
    expect(sim.coins).toBe(500 - 50 - 15);
    sim.coins = 300; // growth works on a migrated market
    expect(levelUp(sim, m.id).ok).toBe(true); expect(m.level).toBe(2);
  });
  it('a migrated save keeps simulating', () => {
    const sim = deserialize(v1Save()); advance(sim, 3000);
    expect(sim.stats.sold).toBeGreaterThan(0);
  });
  it('round-trips a mixed-crop village with a Lv3 market, and a loaded sim advances identically', async () => {
    const sim = createSim({ seed: 3 }); sim.coins = 9000;
    const mk = place(sim, 'market', [0, 0]); levelUp(sim, mk); levelUp(sim, mk);
    for (const z of [-8, 0, 8]) place(sim, 'house', [-8, z]);
    ['cabbage', 'wheat', 'pumpkin'].forEach((c, i) => {
      const p = place(sim, 'farmPlot', [i * 2, 6]);
      apply(sim, { type: 'unlockCrop', crop: c }); apply(sim, { type: 'setCrop', plotId: p, crop: c });
    });
    apply(sim, { type: 'buyChunk', cx: 2, cz: 0 });
    advance(sim, 1500);
    const store = createMemoryStore(); await store.save(serialize(sim, 9));
    const copy = deserialize((await store.load())!);
    expect(snapshot(copy)).toEqual(snapshot(sim));
    advance(sim, 6000); advance(copy, 6000);
    expect(snapshot(copy)).toEqual(snapshot(sim));
    expect(sim.stats.sold).toBeGreaterThan(0);
  });
  it('one big step equals many small steps with mixed crops and a Lv3 market', () => {
    const mk = () => {
      const sim = createSim({ seed: 5 }); sim.coins = 9000;
      const m = place(sim, 'market', [0, 0]); levelUp(sim, m); levelUp(sim, m);
      for (const z of [-8, 0, 8]) place(sim, 'house', [-8, z]);
      ['carrot', 'tomato', 'pumpkin'].forEach((c, i) => {
        const p = place(sim, 'farmPlot', [i * 2, 6]);
        apply(sim, { type: 'unlockCrop', crop: c }); apply(sim, { type: 'setCrop', plotId: p, crop: c });
      });
      return sim;
    };
    const a = mk(), b = mk();
    advance(a, 9000); for (let i = 0; i < 9000; i++) advance(b, 1);
    expect(snapshot(b)).toEqual(snapshot(a));
  });
});
