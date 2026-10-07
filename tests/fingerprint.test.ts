// Golden fingerprint: a fixed, command-built village run for several days. Its hash proves "defaults change nothing"
// across the live-config stages (#22): any drift in how balance.json is read changes it. Re-record only for a
// deliberate behaviour change, never for a refactor.
import { describe, expect, it } from 'vitest';
import { advance, apply, createSim, snapshot, type SimState } from '../src/sim/sim';
import type { BuildingType, Cell, TileKind, TraitId } from '../src/sim/state';

const ok = (sim: SimState, cmd: Parameters<typeof apply>[1]) => {
  const r = apply(sim, cmd);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.reason}`);
  return (r as { id?: number }).id!;
};
const place = (sim: SimState, building: BuildingType, origin: Cell) => ok(sim, { type: 'placeBuilding', building, rotation: 0, origin });
const levelTo = (sim: SimState, id: number, level: number) => {
  sim.coins = 100000;
  while (sim.buildings.get(id)!.level < level) ok(sim, { type: 'levelUp', buildingId: id });
};
const tiles = (sim: SimState, from: Cell, to: Cell, kind: TileKind) => {
  const cells: Cell[] = [];
  for (let x = from[0]; x <= to[0]; x++) for (let z = from[1]; z <= to[1]; z++) cells.push([x, z]);
  sim.coins = 100000; ok(sim, { type: 'setTile', cells, kind });
};
const hash = (sim: SimState) => {
  const str = JSON.stringify(snapshot(sim)); let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return h;
};

function goldenVillage(): SimState {
  const sim = createSim({ seed: 42 }); sim.coins = 100000;
  place(sim, 'market', [0, 0]);
  const hs = [-8, 8, 16].map(z => place(sim, 'house', [-10, z]));
  levelTo(sim, hs[0], 5); levelTo(sim, hs[1], 4); levelTo(sim, hs[2], 3);
  sim.coins = 100000;
  const traits: TraitId[] = ['greenThumb', 'sturdy', 'chatty', 'sleepy'];
  traits.forEach((trait, i) => ok(sim, { type: 'addResident', homeId: hs[i % 3], trait }));
  for (const c of ['cabbage', 'wheat', 'tomato', 'pumpkin']) ok(sim, { type: 'unlockCrop', crop: c });
  const crops = ['carrot', 'cabbage', 'wheat', 'tomato', 'pumpkin'];
  crops.forEach((crop, i) => ok(sim, { type: 'setCrop', plotId: place(sim, 'farmPlot', i < 3 ? [i * 2, 8] : [(i - 3) * 2, 13]), crop }));
  place(sim, 'scarecrow', [2, 11]); place(sim, 'shrub', [9, 6]); place(sim, 'fence', [10, 6]);
  ok(sim, { type: 'buyChunk', cx: 2, cz: 0 });
  ok(sim, { type: 'setStreet', tiles: [[4, 1]], kind: 'road' }); ok(sim, { type: 'setStreet', tiles: [[5, 1]], kind: 'dirt' });
  tiles(sim, [-9, 4], [11, 4], 'lane'); tiles(sim, [3, 3], [5, 3], 'path'); tiles(sim, [6, 5], [6, 9], 'dirtLane');
  const roles = ['farmer', 'hauler', 'seller', 'farmer'] as const;
  [...sim.residents.keys()].forEach((id, i) => ok(sim, { type: 'setRole', residentId: id, role: roles[i % 4] }));
  return sim;
}

describe('golden fingerprint (live-config stage 1 and later)', () => {
  // Recorded on main (cb9e5f1), before sim/config.ts existed. Do not edit for a refactor.
  const GOLDEN = { hash: 239390499, coins: 101295, stats: { harvested: 58, delivered: 58, sold: 58, earned: 1300 }, t: 12300 };
  it('the golden village is unchanged by moving config reads', () => {
    const sim = goldenVillage(); advance(sim, 12000);
    expect({ hash: hash(sim), coins: sim.coins, stats: sim.stats, t: sim.t }).toEqual(GOLDEN);
  });
  it('and stays deterministic: one step == many', () => {
    const a = goldenVillage(), b = goldenVillage();
    advance(a, 3000); for (let i = 0; i < 3000; i++) advance(b, 1);
    expect(snapshot(b)).toEqual(snapshot(a));
  });
});
