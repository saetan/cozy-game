// Player/system commands applied to the sim.
import balance from '../data/balance.json';
import { canPlace, place, placementCells, worldCells, type Footprint, type Rotation } from '../systems/placement';
import { accessCell } from '../systems/pathfinding';
import { cellKey, isFree, isUnlocked, occupy } from './world';
import { market, syncMarket, syncPlot } from './jobs';
import { canAfford, costOf, scaleCost, spend, type Cost } from './costs';
import { HOUSE_FRAME, houseCells, levelUpCheck } from './houses';
import { arrive, arrivesAt, createResident } from './residents';
import type { Building, BuildingType, Cell, Role, SimState, TileKind, TraitId } from './state';

export type Command =
  | { type: 'placeBuilding'; building: BuildingType; rotation: Rotation; origin: Cell }
  | { type: 'levelUpHouse'; houseId: number }
  | { type: 'addResident'; homeId: number; name?: string; species?: string; trait?: TraitId }
  | { type: 'setRole'; residentId: number; role: Role | null }
  | { type: 'setTile'; cells: Cell[]; kind: TileKind | null };
export type CommandResult = { ok: true; id?: number } | { ok: false; reason: string };

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const NO_COINS = 'not enough coins';

/** Footprint of a building when first placed (houses: Lv1 cells inside their fixed frame). */
export const footprintFor = (t: BuildingType): Footprint | undefined =>
  t === 'house' ? houseCells(1) : (balance.footprints as unknown as Record<string, Footprint | undefined>)[t];

export function apply(sim: SimState, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'placeBuilding': {
      const fp = footprintFor(cmd.building);
      if (!fp) return fail('unknown building');
      if (cmd.building === 'market' && market(sim)) return fail('only one market per village');
      const frame = cmd.building === 'house' ? HOUSE_FRAME : undefined;
      const [ox, oz] = cmd.origin;
      if (!canPlace(sim.world, fp, cmd.rotation, ox, oz, frame)) return fail('blocked');
      const cost = costOf(cmd.building);
      if (!canAfford(sim, cost)) return fail(NO_COINS);
      spend(sim, cost);
      const p = place(sim.world, fp, cmd.rotation, ox, oz, frame)!;
      for (const [x, z] of worldCells(fp, cmd.rotation, ox, oz, frame)) sim.tiles.delete(cellKey(x, z));
      const b = { id: p.id, type: cmd.building, placement: p, level: 1 } as Building;
      if (b.type === 'farmPlot') { b.crop = balance.defaultCrop; b.plotState = 'empty'; b.crates = 0; }
      if (b.type === 'market') b.stock = 0;
      sim.buildings.set(b.id, b);
      if (b.type === 'farmPlot') syncPlot(sim, b);
      if (b.type === 'market') syncMarket(sim, b);
      if (b.type === 'house' && arrivesAt(1)) arrive(sim, b);
      return { ok: true, id: b.id };
    }
    case 'levelUpHouse': {
      const check = levelUpCheck(sim, cmd.houseId);
      if (!check.ok) return fail(check.reason!);
      const b = sim.buildings.get(cmd.houseId)!, p = b.placement;
      spend(sim, check.cost);
      b.level++;
      p.footprint = houseCells(b.level);
      for (const [x, z] of check.newCells) { occupy(sim.world, x, z, p.id); sim.tiles.delete(cellKey(x, z)); }
      sim.log.push({ t: sim.t, kind: 'levelUp', houseId: b.id, level: b.level });
      // anyone idling on a cell the house just grew over steps back out to the door
      const own = new Set(placementCells(p).map(([x, z]) => cellKey(x, z)));
      for (const r of sim.residents.values()) {
        if (r.task?.path || !own.has(cellKey(r.cell[0], r.cell[1]))) continue;
        const home = sim.buildings.get(r.homeId), to = home && accessCell(sim.world, home.placement);
        if (to) r.cell = to;
      }
      if (arrivesAt(b.level)) arrive(sim, b);
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
