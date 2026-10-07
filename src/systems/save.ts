// Save format: versioned plain JSON of the whole sim (Maps/Sets as entry arrays) + SaveStore interface.
import balance from '../data/balance.json';
import { emptyStock } from '../sim/crops';
import { MARKET_FRAME } from '../sim/levels';
import { createEventQueue, type QueuedEvent } from '../sim/events';
import type { Building, Job, LogEntry, Reservation, Resident, SimState, Stats, StreetKind, TileKind } from '../sim/state';
import type { WorldConfig } from '../sim/world';

export const SAVE_VERSION = 5;

export interface SimData {
  t: number; rng: number; coins: number; unlockedCrops: string[]; chunksBought: number; stats: Stats; nextJobId: number; nextResidentId: number; dispatchPending: boolean;
  world: { config: WorldConfig; unlocked: string[]; occupied: [string, number][]; nextId: number };
  tiles: [string, TileKind][];
  streets: [string, StreetKind][];
  buildings: Building[]; residents: Resident[]; jobs: Job[]; log: LogEntry[]; reservations: Reservation[];
  queue: { items: QueuedEvent[]; seq: number }; // heap array order kept as-is (already a valid heap)
}
export interface SaveData { version: number; savedAt: number; sim: SimData; speed?: number }
/** Why a stored save cannot be loaded: written by a version this build does not know, or not a readable save at all. */
export type SaveProblem = 'unsupported-version' | 'damaged';
export class SaveError extends Error {
  constructor(readonly reason: SaveProblem, message: string) { super(message); this.name = 'SaveError'; }
}
export interface SaveStore {
  load(): Promise<SaveData | null>;
  save(d: SaveData): Promise<void>;
  clear(): Promise<void>;
}

export function serialize(sim: SimState, savedAt = 0, speed?: number): SaveData {
  const data: SaveData = {
    version: SAVE_VERSION, savedAt,
    sim: {
      t: sim.t, rng: sim.rng, coins: sim.coins, unlockedCrops: sim.unlockedCrops, chunksBought: sim.chunksBought, stats: sim.stats, nextJobId: sim.nextJobId, nextResidentId: sim.nextResidentId,
      dispatchPending: sim.dispatchPending,
      world: { config: sim.world.config, unlocked: [...sim.world.unlocked], occupied: [...sim.world.occupied], nextId: sim.world.nextId },
      tiles: [...sim.tiles], streets: [...sim.streets], buildings: [...sim.buildings.values()], residents: [...sim.residents.values()], jobs: [...sim.jobs.values()],
      log: sim.log, reservations: sim.reservations, queue: { items: sim.queue.heap.items, seq: sim.queue.seq },
    },
  };
  if (speed !== undefined) data.speed = speed;
  return JSON.parse(JSON.stringify(data));
}

/** v1 -> v2: carrot-only unlocks, stock and crates as carrot, market gets its growth frame (Lv1), no land bought. */
function v1ToV2(data: SaveData): SaveData {
  const sim = JSON.parse(JSON.stringify(data.sim)) as SimData;
  sim.unlockedCrops = [balance.defaultCrop]; sim.chunksBought = 0;
  for (const b of sim.buildings) {
    if (b.type !== 'market') continue;
    b.stock = { ...emptyStock(), [balance.defaultCrop]: typeof b.stock === 'number' ? b.stock : 0 };
    b.placement.frame = MARKET_FRAME;
  }
  return { ...data, version: 2, sim };
}
/** v2 -> v3: residents carry a vehicle claim (none yet); decor is just new building types. */
function v2ToV3(data: SaveData): SaveData {
  const sim = JSON.parse(JSON.stringify(data.sim)) as SimData;
  for (const r of sim.residents) r.vehicle = null;
  return { ...data, version: 3, sim };
}
/** v3 -> v4: road kit. The old 'road' tile (the dirt-road stand-in) becomes a dirt lane; paths stay; no 6 m tiles yet. */
function v3ToV4(data: SaveData): SaveData {
  const sim = JSON.parse(JSON.stringify(data.sim)) as SimData;
  sim.tiles = (sim.tiles as [string, string][]).map(([k, kind]) => [k, kind === 'road' ? 'dirtLane' : kind] as [string, TileKind]);
  sim.streets = [];
  return { ...data, version: 4, sim };
}
/** v4 -> v5: lane traffic. No reservations yet (vehicles in flight simply hold nothing). */
function v4ToV5(data: SaveData): SaveData {
  const sim = JSON.parse(JSON.stringify(data.sim)) as SimData;
  sim.reservations = [];
  return { ...data, version: 5, sim };
}
const MIGRATIONS: Record<number, (d: SaveData) => SaveData> = { 1: v1ToV2, 2: v2ToV3, 3: v3ToV4, 4: v4ToV5 };

export function migrate(data: SaveData): SaveData {
  let d = data;
  if (!MIGRATIONS[d.version] && d.version !== SAVE_VERSION) {
    const newer = typeof d.version === 'number' && d.version > SAVE_VERSION; // anything else (missing, 0, 2.5, a string) is not from a newer game
    throw new SaveError(newer ? 'unsupported-version' : 'damaged', `Unsupported save version: ${String(data.version)}`);
  }
  while (d.version < SAVE_VERSION) d = MIGRATIONS[d.version](d);
  return d;
}

export function deserialize(raw: SaveData): SimState {
  if (!raw || typeof raw !== 'object' || !raw.sim) throw new SaveError('damaged', 'Not a valid save file');
  const s = migrate(raw).sim;
  const queue = createEventQueue();
  queue.heap.items.push(...s.queue.items); queue.seq = s.queue.seq;
  return {
    t: s.t, rng: s.rng, coins: s.coins, unlockedCrops: [...s.unlockedCrops], chunksBought: s.chunksBought, stats: { ...s.stats }, nextJobId: s.nextJobId, nextResidentId: s.nextResidentId,
    dispatchPending: s.dispatchPending,
    world: { config: s.world.config, unlocked: new Set(s.world.unlocked), occupied: new Map(s.world.occupied), nextId: s.world.nextId },
    tiles: new Map(s.tiles), streets: new Map(s.streets),
    buildings: new Map(s.buildings.map(b => [b.id, b])), residents: new Map(s.residents.map(r => [r.id, r])), jobs: new Map(s.jobs.map(j => [j.id, j])),
    queue, log: s.log, reservations: s.reservations,
  };
}

export function createMemoryStore(initial: SaveData | null = null): SaveStore {
  let d = initial;
  return {
    load: async () => (d ? JSON.parse(JSON.stringify(d)) : null),
    save: async x => { d = JSON.parse(JSON.stringify(x)); },
    clear: async () => { d = null; },
  };
}

const DB = 'cozy-game', STORE = 'saves', KEY = 'village';
export function createIdbStore(): SaveStore {
  const open = () => new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open();
    try {
      return await new Promise<T>((res, rej) => {
        const req = f(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    } finally { db.close(); }
  }
  return {
    load: async () => (await run<SaveData | undefined>('readonly', s => s.get(KEY))) ?? null,
    save: async d => { await run('readwrite', s => s.put(d, KEY)); },
    clear: async () => { await run('readwrite', s => s.delete(KEY)); },
  };
}
