// Game wiring: owns the sim (single source of truth). No three.js, so it is testable headlessly.
import balance from './data/balance.json';
import { advance, apply, createSim, type SimState } from './sim/sim';
import type { BuildingType, Cell } from './sim/state';
import type { Rotation } from './systems/placement';

export const SEED = 1;
export const MAX_FRAME_DT = 0.25;
export const SPEEDS = [1, 5, 20] as const;
export type Speed = typeof SPEEDS[number];

export interface Game {
  sim: SimState;
  speed: Speed;
  setSpeed(s: Speed): void;
  placeBuilding(type: BuildingType, rotation: Rotation, origin: Cell): { ok: boolean; id?: number; reason?: string };
  /** Advance by a real frame delta (clamped, scaled by speed). */
  frame(realDt: number): void;
}

export function createGame(opts: { demo?: boolean } = {}): Game {
  const sim = createSim({ seed: SEED });
  let houses = 0;
  const game: Game = {
    sim, speed: 1,
    setSpeed(s) { game.speed = s; },
    placeBuilding(type, rotation, origin) {
      const r = apply(sim, { type: 'placeBuilding', building: type, rotation, origin });
      if (!r.ok) return r;
      // Temporary until M3 arrivals: the first house comes with one resident.
      if (type === 'house' && houses++ === 0) apply(sim, { type: 'addResident', homeId: r.id! });
      return r;
    },
    frame(realDt) {
      const dt = Math.min(Math.max(realDt, 0), MAX_FRAME_DT);
      advance(sim, dt * game.speed);
    },
  };
  game.placeBuilding('market', 0, [0, 0]);
  if (opts.demo) {
    game.placeBuilding('house', 0, [-5, 0]);
    game.placeBuilding('farmPlot', 0, [0, 4]);
    game.placeBuilding('farmPlot', 0, [2, 4]);
    game.speed = 20;
  }
  return game;
}

export const footprintOf = (t: BuildingType) => balance.footprints[t] as unknown as ReadonlyArray<readonly [number, number]>;
