// Save format: versioned plain JSON of the whole sim (Maps/Sets as entry arrays) + SaveStore interface.
import { createEventQueue, type QueuedEvent } from '../sim/events';
import type { Building, Job, LogEntry, Resident, SimState, Stats, TileKind } from '../sim/state';
import type { WorldConfig } from '../sim/world';

export const SAVE_VERSION = 1;

export interface SimData {
  t: number; rng: number; coins: number; stats: Stats; nextJobId: number; nextResidentId: number; dispatchPending: boolean;
  world: { config: WorldConfig; unlocked: string[]; occupied: [string, number][]; nextId: number };
  tiles: [string, TileKind][];
  buildings: Building[]; residents: Resident[]; jobs: Job[]; log: LogEntry[];
  queue: { items: QueuedEvent[]; seq: number }; // heap array order kept as-is (already a valid heap)
}
export interface SaveData { version: number; savedAt: number; sim: SimData; speed?: number }
export interface SaveStore {
  load(): Promise<SaveData | null>;
  save(d: SaveData): Promise<void>;
  clear(): Promise<void>;
}

export function serialize(sim: SimState, savedAt = 0, speed?: number): SaveData {
  const data: SaveData = {
    version: SAVE_VERSION, savedAt,
    sim: {
      t: sim.t, rng: sim.rng, coins: sim.coins, stats: sim.stats, nextJobId: sim.nextJobId, nextResidentId: sim.nextResidentId,
      dispatchPending: sim.dispatchPending,
      world: { config: sim.world.config, unlocked: [...sim.world.unlocked], occupied: [...sim.world.occupied], nextId: sim.world.nextId },
      tiles: [...sim.tiles], buildings: [...sim.buildings.values()], residents: [...sim.residents.values()], jobs: [...sim.jobs.values()],
      log: sim.log, queue: { items: sim.queue.heap.items, seq: sim.queue.seq },
    },
  };
  if (speed !== undefined) data.speed = speed;
  return JSON.parse(JSON.stringify(data));
}

/** Hook for future format changes; only v1 exists. */
function migrate(data: SaveData): SaveData {
  if (data.version !== SAVE_VERSION) throw new Error(`Unsupported save version: ${String(data.version)}`);
  return data;
}

export function deserialize(raw: SaveData): SimState {
  if (!raw || typeof raw !== 'object' || !raw.sim) throw new Error('Not a valid save file');
  const s = migrate(raw).sim;
  const queue = createEventQueue();
  queue.heap.items.push(...s.queue.items); queue.seq = s.queue.seq;
  return {
    t: s.t, rng: s.rng, coins: s.coins, stats: { ...s.stats }, nextJobId: s.nextJobId, nextResidentId: s.nextResidentId,
    dispatchPending: s.dispatchPending,
    world: { config: s.world.config, unlocked: new Set(s.world.unlocked), occupied: new Map(s.world.occupied), nextId: s.world.nextId },
    tiles: new Map(s.tiles),
    buildings: new Map(s.buildings.map(b => [b.id, b])), residents: new Map(s.residents.map(r => [r.id, r])), jobs: new Map(s.jobs.map(j => [j.id, j])),
    queue, log: s.log,
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
