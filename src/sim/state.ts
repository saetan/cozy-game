// Sim state: plain data as far as practical (World uses Map/Set; save in M4 will serialise it).
import { createWorld, type World, type WorldConfig } from './world';
import type { Placement } from '../systems/placement';
import balance from '../data/balance.json';
import { createEventQueue, type EventQueue } from './events';

export type BuildingType = 'house' | 'farmPlot' | 'market';
export type Role = 'farmer' | 'hauler' | 'seller';
export type JobKind = 'plant' | 'water' | 'harvest' | 'haul' | 'sell';
export type PlotState = 'empty' | 'growing' | 'thirsty' | 'watered' | 'ripe';
export type Cell = [number, number];
export type TileKind = 'path' | 'road';
export type TraitId = keyof typeof balance.traits;

export interface Building {
  id: number; type: BuildingType; placement: Placement;
  level: number;                                   // house/market level
  crop?: string; plotState?: PlotState; crates?: number; // farmPlot: crop = chosen for the next planting
  growCrop?: string; crateCrop?: string;           // farmPlot: crop in the ground / crop of the crates on hand
  stock?: Record<string, number>;                  // market: crates per crop
}
export interface Task {
  kind: 'job' | 'home' | 'idle';
  action: 'walk' | 'work' | 'water' | 'carry' | 'sell' | 'stand';
  path?: Cell[]; cum?: number[];                   // cum[i] = fraction of walk time elapsed on arriving at path[i]
  start: number; end: number;
}
export interface Resident {
  id: number; name: string; species: string; trait: TraitId; homeId: number; role: Role | null;
  cell: Cell; task: Task | null; token: number;
  jobId: number | null; stage: number; carrying: number; carryingCrop?: string;
}
/** Append-only, plain-data event log (UI notifications read it by index; M4's away summary reuses it). */
export type LogEntry =
  | { t: number; kind: 'arrival'; residentId: number; houseId: number }
  | { t: number; kind: 'levelUp'; houseId: number; level: number };
export interface Job { id: number; kind: JobKind; targetId: number; claimedBy: number | null; pickedUp: boolean }
export interface Stats { harvested: number; delivered: number; sold: number; earned: number }

export interface SimState {
  t: number; rng: number; world: World;
  tiles: Map<string, TileKind>;   // cell key -> tile (walking speed bonus; roads later gate vehicles)
  buildings: Map<number, Building>;
  residents: Map<number, Resident>;
  coins: number;
  unlockedCrops: string[]; chunksBought: number;
  jobs: Map<number, Job>; nextJobId: number; nextResidentId: number;
  dispatchPending: boolean;
  queue: EventQueue;
  stats: Stats;
  log: LogEntry[];
}

export function newState(seed: number, t0: number, worldConfig?: WorldConfig): SimState {
  return {
    t: t0, rng: seed >>> 0, world: createWorld(worldConfig), tiles: new Map(),
    buildings: new Map(), residents: new Map(), coins: balance.startingCoins,
    unlockedCrops: [balance.defaultCrop], chunksBought: 0,
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
