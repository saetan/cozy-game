// Player/system commands applied to the sim.
import balance from '../data/balance.json';
import { canPlace, place, placementCells, worldCells, type Footprint, type Rotation } from '../systems/placement';
import { accessCell } from '../systems/pathfinding';
import { CHUNK, cellKey, chunkKey, inBounds, isFree, isUnlocked, occupy, unlockChunk } from './world';
import { market, syncMarket, syncPlot } from './jobs';
import { canAfford, costOf, scaleCost, spend, type Cost } from './costs';
import { levelSpec, levelUpCheck } from './levels';
import { cropInfo, emptyStock, isCrop } from './crops';
import { arrive, arrivesAt, createResident } from './residents';
import type { Building, BuildingType, Cell, Role, SimState, TileKind, TraitId } from './state';

export type Command =
  | { type: 'placeBuilding'; building: BuildingType; rotation: Rotation; origin: Cell }
  | { type: 'levelUp'; buildingId: number }
  | { type: 'levelUpHouse'; houseId: number } // alias of levelUp, kept for houses
  | { type: 'unlockCrop'; crop: string }
  | { type: 'setCrop'; plotId: number; crop: string }
  | { type: 'buyChunk'; cx: number; cz: number }
  | { type: 'addResident'; homeId: number; name?: string; species?: string; trait?: TraitId }
  | { type: 'setRole'; residentId: number; role: Role | null }
  | { type: 'setTile'; cells: Cell[]; kind: TileKind | null };
export type CommandResult = { ok: true; id?: number } | { ok: false; reason: string };

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const NO_COINS = 'not enough coins';

/** Footprint of a building when first placed (growing buildings: Lv1 cells inside their fixed frame). */
export const footprintFor = (t: BuildingType): Footprint | undefined =>
  levelSpec(t)?.cells(1) ?? (balance.footprints as unknown as Record<string, Footprint | undefined>)[t];

/** Price of the next land chunk: grows with each one bought. */
export const chunkPrice = (sim: SimState): Cost => ({ coins: Math.round(balance.chunkCost.base * balance.chunkCost.growth ** sim.chunksBought) });
const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Pure: why a chunk cannot be bought now (null = ok). */
export function chunkBuyReason(sim: SimState, cx: number, cz: number): string | null {
  const w = sim.world;
  if (!Number.isInteger(cx) || !Number.isInteger(cz)) return 'no such land';
  if (!inBounds(w, cx * CHUNK, cz * CHUNK)) return 'outside the world';
  if (w.unlocked.has(chunkKey(cx, cz))) return 'already yours';
  if (!EDGES.some(([dx, dz]) => w.unlocked.has(chunkKey(cx + dx, cz + dz)))) return 'must touch your land';
  return canAfford(sim, chunkPrice(sim)) ? null : NO_COINS;
}

export function apply(sim: SimState, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'placeBuilding': {
      const fp = footprintFor(cmd.building);
      if (!fp) return fail('unknown building');
      if (cmd.building === 'market' && market(sim)) return fail('only one market per village');
      const frame = levelSpec(cmd.building)?.frame;
      const [ox, oz] = cmd.origin;
      if (!canPlace(sim.world, fp, cmd.rotation, ox, oz, frame)) return fail('blocked');
      const cost = costOf(cmd.building);
      if (!canAfford(sim, cost)) return fail(NO_COINS);
      spend(sim, cost);
      const p = place(sim.world, fp, cmd.rotation, ox, oz, frame)!;
      for (const [x, z] of worldCells(fp, cmd.rotation, ox, oz, frame)) sim.tiles.delete(cellKey(x, z));
      const b = { id: p.id, type: cmd.building, placement: p, level: 1 } as Building;
      if (b.type === 'farmPlot') { b.crop = balance.defaultCrop; b.plotState = 'empty'; b.crates = 0; }
      if (b.type === 'market') b.stock = emptyStock();
      sim.buildings.set(b.id, b);
      if (b.type === 'farmPlot') syncPlot(sim, b);
      if (b.type === 'market') syncMarket(sim, b);
      if (b.type === 'house' && arrivesAt(1)) arrive(sim, b);
      return { ok: true, id: b.id };
    }
    case 'levelUpHouse':
    case 'levelUp': {
      const id = cmd.type === 'levelUp' ? cmd.buildingId : cmd.houseId;
      const check = levelUpCheck(sim, id);
      if (!check.ok) return fail(check.reason!);
      const b = sim.buildings.get(id)!, p = b.placement;
      spend(sim, check.cost);
      b.level++;
      p.footprint = levelSpec(b.type)!.cells(b.level);
      for (const [x, z] of check.newCells) { occupy(sim.world, x, z, p.id); sim.tiles.delete(cellKey(x, z)); }
      if (b.type === 'house') sim.log.push({ t: sim.t, kind: 'levelUp', houseId: b.id, level: b.level });
      // anyone idling on a cell the building just grew over steps back out to the door
      const own = new Set(placementCells(p).map(([x, z]) => cellKey(x, z)));
      for (const r of sim.residents.values()) {
        if (r.task?.path || !own.has(cellKey(r.cell[0], r.cell[1]))) continue;
        const home = sim.buildings.get(r.homeId), to = home && accessCell(sim.world, home.placement);
        if (to) r.cell = to;
      }
      if (b.type === 'house' && arrivesAt(b.level)) arrive(sim, b);
      if (b.type === 'market') syncMarket(sim, b);
      return { ok: true };
    }
    case 'unlockCrop': {
      if (!isCrop(cmd.crop)) return fail('unknown crop');
      if (sim.unlockedCrops.includes(cmd.crop)) return fail('already unlocked');
      const cost: Cost = { coins: cropInfo(cmd.crop).unlock };
      if (!canAfford(sim, cost)) return fail(NO_COINS);
      spend(sim, cost);
      sim.unlockedCrops.push(cmd.crop);
      return { ok: true };
    }
    case 'setCrop': {
      const plot = sim.buildings.get(cmd.plotId);
      if (!plot || plot.type !== 'farmPlot') return fail('not a farm plot');
      if (!isCrop(cmd.crop) || !sim.unlockedCrops.includes(cmd.crop)) return fail('crop not unlocked');
      plot.crop = cmd.crop; // read at the next planting; a growing plot keeps growCrop
      return { ok: true };
    }
    case 'buyChunk': {
      const why = chunkBuyReason(sim, cmd.cx, cmd.cz);
      if (why) return fail(why);
      spend(sim, chunkPrice(sim));
      unlockChunk(sim.world, cmd.cx, cmd.cz);
      sim.chunksBought++;
      return { ok: true };
    }
    case 'addResident': {
      const home = sim.buildings.get(cmd.homeId);
      if (!home || home.type !== 'house') return fail('home must be a house');
      const r = createResident(sim, home, cmd);
      return r ? { ok: true, id: r.id } : fail('home has no access cell');
    }
    case 'setRole': {
      const r = sim.residents.get(cmd.residentId);
      if (!r) return fail('no such resident');
      r.role = cmd.role;
      return { ok: true };
    }
    case 'setTile': {
      const cells = cmd.cells.filter(([x, z]) => sim.tiles.get(cellKey(x, z)) !== (cmd.kind ?? undefined));
      if (cmd.kind === null) { for (const [x, z] of cells) sim.tiles.delete(cellKey(x, z)); return { ok: true }; }
      if (!cells.every(([x, z]) => isUnlocked(sim.world, x, z) && isFree(sim.world, x, z))) return fail('some cells blocked or locked');
      const cost: Cost = scaleCost(costOf(cmd.kind), cells.length);
      if (!canAfford(sim, cost)) return fail(NO_COINS);
      spend(sim, cost);
      for (const [x, z] of cells) sim.tiles.set(cellKey(x, z), cmd.kind);
      return { ok: true };
    }
  }
}
