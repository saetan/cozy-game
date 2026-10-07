// Game wiring: owns the sim (single source of truth). No three.js, so it is testable headlessly.
import { advance, apply, createSim, type Command, type CommandResult, type SimState } from './sim/sim';
import { footprintFor } from './sim/commands';
import { levelSpec } from './sim/levels';
import type { BuildingType, Cell } from './sim/state';
import type { Frame, Rotation } from './systems/placement';
import { catchUp, type AwaySummary } from './systems/catchup';
import { deserialize, SaveError, serialize, type SaveData, type SaveProblem, type SaveStore } from './systems/save';

export const SEED = 1;
export const MAX_FRAME_DT = 0.25;
export const SPEEDS = [1, 5, 20] as const;
export type Speed = typeof SPEEDS[number];

export interface Game {
  sim: SimState;
  speed: Speed;
  setSpeed(s: Speed): void;
  /** Sends any command to the sim (the only way UI changes the village). */
  apply(cmd: Command): CommandResult;
  placeBuilding(type: BuildingType, rotation: Rotation, origin: Cell): { ok: boolean; id?: number; reason?: string };
  /** Advance by a real frame delta (clamped, scaled by speed). */
  frame(realDt: number): void;
}

export function createGame(opts: { demo?: boolean; sim?: SimState; speed?: Speed } = {}): Game {
  const sim = opts.sim ?? createSim({ seed: SEED });
  const game: Game = {
    sim, speed: opts.speed ?? 1,
    setSpeed(s) { game.speed = s; },
    apply: cmd => apply(sim, cmd),
    placeBuilding: (type, rotation, origin) => apply(sim, { type: 'placeBuilding', building: type, rotation, origin }),
    frame(realDt) {
      const dt = Math.min(Math.max(realDt, 0), MAX_FRAME_DT);
      advance(sim, dt * game.speed);
    },
  };
  if (opts.sim) return game; // loaded village: market and everything else already exist
  game.placeBuilding('market', 0, [0, 0]); // free (balance.costs.market = 0), pre-placed
  if (opts.demo) {
    game.placeBuilding('house', 0, [-5, 0]);
    game.placeBuilding('farmPlot', 0, [0, 4]);
    game.placeBuilding('farmPlot', 0, [2, 4]);
    game.speed = 20;
  }
  return game;
}

export const footprintOf = (t: BuildingType) => footprintFor(t)!;
/** Fixed rotation frame for building types that grow in place (houses, market). */
export const frameOf = (t: BuildingType): Frame | undefined => levelSpec(t)?.frame;

export const saveGame = (g: Game, store: SaveStore, now: number) => store.save(serialize(g.sim, now, g.speed));

export type LoadResult =
  | { ok: true; game: Game; away: AwaySummary | null }
  | { ok: false; reason: SaveProblem; data: SaveData; error: unknown }; // the stored save, untouched, and what was thrown

/** Startup from a store: loads + catches up an existing save, else a new game. A store that cannot be read counts as no save.
 *  A save that exists but cannot be loaded comes back as `ok: false` with the stored data; nothing is written or cleared. */
export async function loadGame(store: SaveStore, now: number): Promise<LoadResult> {
  let data: SaveData | null = null;
  try { data = await store.load(); } catch { data = null; }
  if (!data) return { ok: true, game: createGame(), away: null };
  try {
    const sim = deserialize(data);
    const away = catchUp(sim, data.savedAt, now);
    const speed = SPEEDS.find(s => s === data!.speed) ?? 1;
    return { ok: true, game: createGame({ sim, speed }), away };
  } catch (e) {
    return { ok: false, reason: e instanceof SaveError ? e.reason : 'damaged', data, error: e };
  }
}
