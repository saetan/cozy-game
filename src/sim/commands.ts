// Player/system commands applied to the sim.
import balance from '../data/balance.json';
import { canPlace, place, worldCells, type Footprint, type Rotation } from '../systems/placement';
import { accessCell } from '../systems/pathfinding';
import { cellKey, isFree, isUnlocked } from './world';
import { market, syncMarket, syncPlot } from './jobs';
import { step } from './economy';
import { randInt, type Building, type BuildingType, type Cell, type Resident, type Role, type SimState } from './state';

export type Command =
  | { type: 'placeBuilding'; building: BuildingType; rotation: Rotation; origin: Cell }
  | { type: 'addResident'; homeId: number; name?: string; species?: string }
  | { type: 'setRole'; residentId: number; role: Role | null }
  | { type: 'setPath'; cells: Cell[]; on: boolean };
export type CommandResult = { ok: true; id?: number } | { ok: false; reason: string };

const fail = (reason: string): CommandResult => ({ ok: false, reason });

export function apply(sim: SimState, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'placeBuilding': {
      const fp = balance.footprints[cmd.building] as unknown as Footprint | undefined;
      if (!fp) return fail('unknown building');
      if (cmd.building === 'market' && market(sim)) return fail('only one market per village');
      const [ox, oz] = cmd.origin;
      if (!canPlace(sim.world, fp, cmd.rotation, ox, oz)) return fail('blocked');
      const p = place(sim.world, fp, cmd.rotation, ox, oz)!;
      for (const [x, z] of worldCells(fp, cmd.rotation, ox, oz)) sim.paths.delete(cellKey(x, z));
      const b = { id: p.id, type: cmd.building, placement: p, level: 1 } as Building;
      if (b.type === 'farmPlot') { b.crop = balance.defaultCrop; b.plotState = 'empty'; b.crates = 0; }
      if (b.type === 'market') b.stock = 0;
      sim.buildings.set(b.id, b);
      if (b.type === 'farmPlot') syncPlot(sim, b);
      if (b.type === 'market') syncMarket(sim, b);
      return { ok: true, id: b.id };
    }
    case 'addResident': {
      const home = sim.buildings.get(cmd.homeId);
      if (!home || home.type !== 'house') return fail('home must be a house');
      const cell = accessCell(sim.world, home.placement);
      if (!cell) return fail('home has no access cell');
      const id = sim.nextResidentId++;
      const species = cmd.species ?? balance.species[randInt(sim, balance.species.length)];
      const name = cmd.name ?? balance.names[randInt(sim, balance.names.length)];
      const r: Resident = { id, name, species, homeId: home.id, role: null, cell, task: null, token: 0, jobId: null, stage: 0, carrying: 0 };
      sim.residents.set(id, r);
      step(sim, r);
      return { ok: true, id };
    }
    case 'setRole': {
      const r = sim.residents.get(cmd.residentId);
      if (!r) return fail('no such resident');
      r.role = cmd.role;
      return { ok: true };
    }
    case 'setPath': {
      let ok = true;
      for (const [x, z] of cmd.cells) {
        if (!cmd.on) { sim.paths.delete(cellKey(x, z)); continue; }
        if (isUnlocked(sim.world, x, z) && isFree(sim.world, x, z)) sim.paths.add(cellKey(x, z)); else ok = false;
      }
      return ok ? { ok: true } : fail('some cells blocked or locked');
    }
  }
}
