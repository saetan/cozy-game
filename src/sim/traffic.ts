// Lane traffic rules: ALL of them live in this file. economy.ts / vehicles.ts only ask questions
// (laneSegments, planEntry, reserve); a new rule is a change here and in tests/traffic.test.ts.
//
// Model: the lane network (`lane` + `dirtLane` cells of sim.tiles) is cut into SEGMENTS at junction cells. A limited vehicle
// holds a time-interval RESERVATION on each segment it rides through; a segment takes `capacity` overlapping reservations.
// A vehicle that finds a segment busy rides to the cell before it, waits there holding nothing, and re-plans when the blocker leaves.
import balance from '../data/balance.json';
import { travelTime, type Cell, type PathResult } from '../systems/pathfinding';
import { cellKey } from './world';
import { isLane } from './surfaces';
import type { Reservation, SimState, TileKind, VehicleKind } from './state';

// ---- config: one accessor, overridable per test --------------------------------------------------------------------
export type WhenBusy = 'wait' | 'waitOrWalk' | 'ignore';
export interface LaneRule { capacity: number | null; appliesTo: VehicleKind[]; whenBusy: WhenBusy; maxWaitSeconds: number }
export interface TrafficConfig {
  lane: LaneRule; dirtLane: LaneRule;
  street: { capacity: number | null }; dirtRoad: { capacity: number | null }; // reserved: only lanes are limited so far
}
export type TrafficOverride = { [K in keyof TrafficConfig]?: Partial<TrafficConfig[K]> };

const DEFAULTS = balance.traffic as unknown as TrafficConfig;
let override: TrafficConfig | null = null;
/** The single read site of the traffic config (balance.json unless a test or a later runtime setting overrides it). */
export const trafficConfig = (): TrafficConfig => override ?? DEFAULTS;
/** Override parts of the config (merged over balance.json); null restores the defaults. Tests: call in afterEach(() => setTrafficConfig(null)). */
export function setTrafficConfig(o: TrafficOverride | null): void {
  override = o && {
    lane: { ...DEFAULTS.lane, ...o.lane }, dirtLane: { ...DEFAULTS.dirtLane, ...o.dirtLane },
    street: { ...DEFAULTS.street, ...o.street }, dirtRoad: { ...DEFAULTS.dirtRoad, ...o.dirtRoad },
  };
}
/** An "everything off" config, for tests that compare against the unlimited behaviour. */
export const TRAFFIC_OFF: TrafficOverride = { lane: { capacity: null }, dirtLane: { capacity: null } };

// ---- segments ------------------------------------------------------------------------------------------------------
export interface Segment { id: string; cells: Cell[]; kinds: TileKind[] }
export interface LaneNetwork { segments: Segment[]; byCell: Map<string, Segment>; byId: Map<string, Segment>; junctions: Set<string> }

const DIRS: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const parse = (k: string): Cell => { const c = k.indexOf(','); return [Number(k.slice(0, c)), Number(k.slice(c + 1))]; };
const byXZ = (a: Cell, b: Cell) => a[0] - b[0] || a[1] - b[1];

/**
 * Segment definition: a junction cell is a lane cell with 3+ lane neighbours (4-neighbourhood; street tiles do not count)
 * and is never limited. A segment is a connected run of non-junction lane cells (lane and dirt lane alike: one run is one
 * segment). Its id is its smallest cell ('x,z' with x then z ordering). Runs end at junctions, lane mouths, dead ends, lane ends.
 */
export function laneNetwork(sim: Pick<SimState, 'tiles'>): LaneNetwork {
  const lanes: Cell[] = [];
  for (const [k, kind] of sim.tiles) if (isLane(kind)) lanes.push(parse(k));
  lanes.sort(byXZ);
  const laneAt = (x: number, z: number) => isLane(sim.tiles.get(cellKey(x, z)));
  const junctions = new Set<string>();
  for (const [x, z] of lanes) if (DIRS.filter(([dx, dz]) => laneAt(x + dx, z + dz)).length >= 3) junctions.add(cellKey(x, z));
  const segments: Segment[] = [], byCell = new Map<string, Segment>(), byId = new Map<string, Segment>();
  for (const start of lanes) {
    const sk = cellKey(start[0], start[1]);
    if (junctions.has(sk) || byCell.has(sk)) continue;
    const seg: Segment = { id: sk, cells: [], kinds: [] };
    const stack = [start]; byCell.set(sk, seg);
    while (stack.length) {
      const [x, z] = stack.pop()!;
      seg.cells.push([x, z]);
      const kind = sim.tiles.get(cellKey(x, z))!;
      if (!seg.kinds.includes(kind)) seg.kinds.push(kind);
      for (const [dx, dz] of DIRS) {
        const nk = cellKey(x + dx, z + dz);
        if (laneAt(x + dx, z + dz) && !junctions.has(nk) && !byCell.has(nk)) { byCell.set(nk, seg); stack.push([x + dx, z + dz]); }
      }
    }
    seg.cells.sort(byXZ); seg.kinds.sort();
    segments.push(seg); byId.set(seg.id, seg);
  }
  return { segments, byCell, byId, junctions };
}
/** The segments of the lane network (stable ids). */
export const laneSegments = (sim: Pick<SimState, 'tiles'>): Segment[] => laneNetwork(sim).segments;

/** The rule that limits `vehicle` in a segment, or null. A mixed run uses its strictest limiting rule (lowest capacity; lane before dirtLane on a tie). */
function ruleFor(seg: Segment, vehicle: VehicleKind): (LaneRule & { capacity: number }) | null {
  const cfg = trafficConfig();
  let best: (LaneRule & { capacity: number }) | null = null;
  for (const kind of ['lane', 'dirtLane'] as const) {
    if (!seg.kinds.includes(kind)) continue;
    const r = cfg[kind];
    if (r.capacity === null || r.whenBusy === 'ignore' || !r.appliesTo.includes(vehicle)) continue;
    const cap = Math.max(1, r.capacity);
    if (!best || cap < best.capacity) best = { ...r, capacity: cap };
  }
  return best;
}

// ---- reservations and entry planning ---------------------------------------------------------------------------------
export type Claim = Omit<Reservation, 'residentId'>;
export type Entry =
  | { kind: 'free'; claims: Claim[] }
  /** Ride cells 0..stop (the cell before the busy segment), wait until `resumeAt`, then re-plan. */
  | { kind: 'wait'; stop: number; resumeAt: number; waitSeconds: number; whenBusy: WhenBusy; maxWaitSeconds: number; claims: Claim[] };

/**
 * Can `vehicle` ride `path` (starting at `now`, per-cell timing from path.cum and the leg duration) through every
 * limited lane segment? Pure: no state is changed. `claims` are the reservations to make if the entry is taken.
 */
export function planEntry(sim: SimState, vehicle: VehicleKind, path: PathResult, now: number): Entry {
  const cfg = trafficConfig();
  if ([cfg.lane, cfg.dirtLane].every(r => r.capacity === null || r.whenBusy === 'ignore' || !r.appliesTo.includes(vehicle))) return { kind: 'free', claims: [] };
  const net = laneNetwork(sim);
  if (net.segments.length === 0) return { kind: 'free', claims: [] };
  const D = travelTime(path.cost), n = path.cells.length;
  const span = new Map<string, [number, number]>(); // segment id -> first and last path index inside it
  for (let i = 0; i < n; i++) {
    const s = net.byCell.get(cellKey(path.cells[i][0], path.cells[i][1]));
    if (!s) continue;
    const sp = span.get(s.id);
    if (sp) sp[1] = i; else span.set(s.id, [i, i]);
  }
  const live = sim.reservations.filter(r => r.to > now && net.byId.has(r.segment));
  const claims: Claim[] = [];
  for (const [id, [i0, i1]] of span) { // insertion order = order along the path
    const rule = ruleFor(net.byId.get(id)!, vehicle);
    if (!rule) continue;
    // occupied from leaving the cell before the segment until reaching the cell after it
    const enter = now + (i0 > 0 ? path.cum[i0 - 1] : 0) * D;
    const leave = now + path.cum[Math.min(n - 1, i1 + 1)] * D;
    const width = leave - enter;
    let w = enter;
    for (;;) {
      const hit = live.filter(r => r.segment === id && r.from < w + width && r.to > w);
      if (hit.length < rule.capacity) break;
      w = Math.min(...hit.map(r => r.to));
    }
    if (w === enter) { claims.push({ segment: id, from: enter, to: leave }); continue; }
    return { kind: 'wait', stop: Math.max(0, i0 - 1), resumeAt: w, waitSeconds: w - enter, whenBusy: rule.whenBusy, maxWaitSeconds: rule.maxWaitSeconds, claims };
  }
  return { kind: 'free', claims };
}

/** The part of a path a vehicle rides before waiting: cells 0..stop, with cum and cost rescaled to that part. */
export function pathUntilStop(path: PathResult, stop: number): PathResult {
  const f = path.cum[stop];
  return { cells: path.cells.slice(0, stop + 1), cost: path.cost * f, cum: path.cum.slice(0, stop + 1).map(v => (f > 0 ? v / f : 0)) };
}

/** Commit an entry's reservations for a resident. Expired reservations and ones on vanished segments are dropped first. */
export function reserve(sim: SimState, residentId: number, entry: Entry): void {
  if (entry.claims.length === 0) return;
  const byId = laneNetwork(sim).byId;
  sim.reservations = sim.reservations.filter(r => r.to > sim.t && byId.has(r.segment));
  for (const c of entry.claims) sim.reservations.push({ residentId, ...c });
}
