// Sim state: plain data as far as practical (World uses Map/Set; save in M4 will serialise it).
import { createWorld, type World, type WorldConfig } from './world';
import type { Placement } from '../systems/placement';
import { DEFAULTS } from './config';
import { createEventQueue, type EventQueue } from './events';

export type BuildingType = 'house' | 'farmPlot' | 'market' | 'shrub' | 'fence' | 'scarecrow';
export type Role = 'farmer' | 'hauler' | 'seller';
export type JobKind = 'plant' | 'water' | 'harvest' | 'haul' | 'sell';
export type PlotState = 'empty' | 'growing' | 'thirsty' | 'watered' | 'ripe';
export type Cell = [number, number];
/** One-cell tiles (2 m grid) and 6 m street tiles (3x3 cells, kit tile grid). */
export type TileKind = 'path' | 'lane' | 'dirtLane';
export type StreetKind = 'road' | 'dirt';
/** What a cell is made of: the key into every speed table in balance.json. */
export type Surface = 'grass' | 'path' | 'street' | 'dirtRoad' | 'lane' | 'dirtLane';
export type TraitId = keyof typeof DEFAULTS.traits;
export type VehicleKind = keyof typeof DEFAULTS.vehicles;

export interface Building {
  id: number; type: BuildingType; placement: Placement;
  level: number;                                   // house/market level
  crop?: string; plotState?: PlotState; crates?: number; // farmPlot: crop = chosen for the next planting
  growCrop?: string; crateCrop?: string;           // farmPlot: crop in the ground / crop of the crates on hand
  stock?: Record<string, number>;                  // market: crates per crop
}
export interface Task {
  kind: 'job' | 'home' | 'idle';
  action: 'walk' | 'work' | 'water' | 'carry' | 'sell' | 'stand' | 'wait';
  path?: Cell[]; cum?: number[];                   // cum[i] = fraction of walk time elapsed on arriving at path[i]
  waitUntil?: number;                              // path legs: on arrival, wait on the vehicle until then (lane traffic), then re-plan
  start: number; end: number;
}
export interface Resident {
  id: number; name: string; species: string; trait: TraitId; homeId: number; role: Role | null;
  cell: Cell; task: Task | null; token: number;
  vehicle: VehicleKind | null;                     // claimed from the home house for the current walk leg
  jobId: number | null; stage: number; carrying: number; carryingCrop?: string;
}
/** Append-only, plain-data event log (UI notifications read it by index; M4's away summary reuses it). */
export type LogEntry =
  | { t: number; kind: 'arrival'; residentId: number; houseId: number }
  | { t: number; kind: 'levelUp'; houseId: number; level: number };
/** A vehicle holds `segment` (a lane segment id, see sim/traffic.ts) during [from, to). */
export interface Reservation { segment: string; residentId: number; from: number; to: number }
export interface Job { id: number; kind: JobKind; targetId: number; claimedBy: number | null; pickedUp: boolean }
export interface Stats { harvested: number; delivered: number; sold: number; earned: number }

export interface SimState {
  t: number; rng: number; world: World;
  tiles: Map<string, TileKind>;   // cell key -> 1-cell tile (path, lane, dirt lane)
  streets: Map<string, StreetKind>; // 'i,j' -> 6 m street tile covering cells 3i..3i+2, 3j..3j+2 (see sim/surfaces.ts)
  buildings: Map<number, Building>;
  residents: Map<number, Resident>;
  coins: number;
  unlockedCrops: string[]; chunksBought: number;
  reservations: Reservation[];    // lane traffic (sim/traffic.ts)
  jobs: Map<number, Job>; nextJobId: number; nextResidentId: number;
  dispatchPending: boolean;
  queue: EventQueue;
  stats: Stats;
  log: LogEntry[];
}

export function newState(seed: number, t0: number, worldConfig?: WorldConfig): SimState {
  return {
    t: t0, rng: seed >>> 0, world: createWorld(worldConfig), tiles: new Map(), streets: new Map(),
    buildings: new Map(), residents: new Map(), reservations: [], coins: DEFAULTS.startingCoins,
    unlockedCrops: [DEFAULTS.defaultCrop], chunksBought: 0,
    jobs: new Map(), nextJobId: 1, nextResidentId: 1, dispatchPending: false,
    queue: createEventQueue(), stats: { harvested: 0, delivered: 0, sold: 0, earned: 0 }, log: [],
  };
}

/** mulberry32; state lives in sim.rng. Returns [0,1). */
export function rand(sim: SimState): number {
  sim.rng = (sim.rng + 0x6d2b79f5) >>> 0;
  let x = sim.rng;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (sim: SimState, n: number) => Math.floor(rand(sim) * n);
