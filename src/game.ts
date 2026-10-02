// Game wiring: owns the sim (single source of truth). No three.js, so it is testable headlessly.
import { advance, apply, createSim, type Command, type CommandResult, type SimState } from './sim/sim';
import { footprintFor } from './sim/commands';
import { HOUSE_FRAME } from './sim/houses';
import type { BuildingType, Cell } from './sim/state';
import type { Frame, Rotation } from './systems/placement';

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

export function createGame(opts: { demo?: boolean } = {}): Game {
  const sim = createSim({ seed: SEED });
  const game: Game = {
    sim, speed: 1,
    setSpeed(s) { game.speed = s; },
    apply: cmd => apply(sim, cmd),
    placeBuilding: (type, rotation, origin) => apply(sim, { type: 'placeBuilding', building: type, rotation, origin }),
    frame(realDt) {
      const dt = Math.min(Math.max(realDt, 0), MAX_FRAME_DT);
      advance(sim, dt * game.speed);
    },
  };
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
/** Fixed rotation frame for building types that grow in place (houses). */
export const frameOf = (t: BuildingType): Frame | undefined => (t === 'house' ? HOUSE_FRAME : undefined);
