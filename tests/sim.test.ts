import { describe, expect, it } from 'vitest';
import { DAY_LENGTH, dayOf, isWorkHours, timeOfDay } from '../src/sim/clock';
import { createEventQueue, popEvent, pushEvent } from '../src/sim/events';
import { advance, apply, createSim, snapshot, type SimState } from '../src/sim/sim';
import { jobCost, claimJob, pickJob, postJob } from '../src/sim/jobs';
import { residentPositionAt } from '../src/sim/position';
import { accessCell, findPath } from '../src/systems/pathfinding';
import balance from '../src/data/balance.json';
import { createWorld, occupy } from '../src/sim/world';
import type { Resident } from '../src/sim/state';

function village(seed = 1, residents = 1): SimState {
  const sim = createSim({ seed });
  const m = apply(sim, { type: 'placeBuilding', building: 'market', rotation: 0, origin: [4, 0] });
  const h = apply(sim, { type: 'placeBuilding', building: 'house', rotation: 0, origin: [0, 0] });
  apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [0, 6] });
  apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [2, 6] });
  expect(m.ok && h.ok).toBe(true);
  for (let i = 0; i < residents; i++) apply(sim, { type: 'addResident', homeId: (h as { id: number }).id });
  return sim;
}
const res = (sim: SimState, id = 1) => sim.residents.get(id)!;

describe('clock', () => {
  it('day, time of day, work hours', () => {
    expect(dayOf(DAY_LENGTH * 2.5)).toBe(2);
    expect(timeOfDay(DAY_LENGTH * 2.5)).toBeCloseTo(0.5);
    expect(isWorkHours(0.1 * DAY_LENGTH)).toBe(false);
    expect(isWorkHours(0.5 * DAY_LENGTH)).toBe(true);
    expect(isWorkHours(0.9 * DAY_LENGTH)).toBe(false);
  });
});

describe('event queue', () => {
  it('orders by time then insertion', () => {
    const q = createEventQueue();
    pushEvent(q, 5, { kind: 'dispatch' });
    pushEvent(q, 1, { kind: 'resident', residentId: 1, token: 0 });
    pushEvent(q, 1, { kind: 'resident', residentId: 2, token: 0 });
    pushEvent(q, 1, { kind: 'resident', residentId: 3, token: 0 });
    const ids = [1, 2, 3, 4].map(() => popEvent(q)!.event).map(e => (e.kind === 'resident' ? e.residentId : 0));
    expect(ids).toEqual([1, 2, 3, 0]);
  });
});

describe('pathfinding', () => {
  const w = () => createWorld();
  it('finds a shortest path', () => {
    const p = findPath(w(), new Set(), [0, 0], [3, 2])!;
    expect(p.cost).toBe(5);
    expect(p.cells.length).toBe(6);
  });
  it('prefers path tiles when cheaper', () => {
    const paths = new Set(['1,0', '2,0', '3,0', '4,0', '5,0']);
    const p = findPath(w(), paths, [0, 0], [5, 0])!;
        expect(p.cost).toBeLessThan(5);
  });
  it('avoids buildings and returns null when unreachable or locked', () => {
    const world = w();
    for (let z = -3; z <= 3; z++) occupy(world, 1, z, 99);
    const p = findPath(world, new Set(), [0, 0], [2, 0])!;
    expect(p.cells.every(([x, z]) => !(x === 1 && z >= -3 && z <= 3))).toBe(true);
    for (let z = -16; z < 32; z++) occupy(world, 1, z, 99);
    expect(findPath(world, new Set(), [0, 0], [2, 0])).toBeNull();
    expect(findPath(w(), new Set(), [0, 0], [500, 0])).toBeNull();
  });
  it('access cell is in front of the building and rotates', () => {
    const sim = village();
    const house = sim.buildings.get(2)!;
    expect(accessCell(sim.world, house.placement)).toEqual([0, 2]);
  });
});

describe('job board', () => {
  it('one claimant per job', () => {
    const sim = village(1, 2);
    // both residents wake at dispatch; each claimed a distinct job
    advance(sim, 0);
    const claimed = [...sim.jobs.values()].filter(x => x.claimedBy !== null).map(x => x.claimedBy);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed.length).toBeGreaterThan(0);
  });
  const bare = () => {
    const sim = village(1, 0);
    // remove auto jobs, post our own
    sim.jobs.clear();
    const h = apply(sim, { type: 'addResident', homeId: 2 }) as { id: number };
    sim.jobs.clear();
    for (const r of sim.residents.values()) { r.jobId = null; r.task = null; }
    return { sim, r: sim.residents.get(h.id)! };
  };
  it('role preference then generalist fallback', () => {
    const { sim, r } = bare();
    const sellJob = postJob(sim, 'sell', 1);
    const plant = postJob(sim, 'plant', 3);
    r.role = 'farmer';
    expect(pickJob(sim, r)).toBe(plant);
    sim.jobs.delete(plant.id);
    expect(pickJob(sim, r)).toBe(sellJob);
  });
  it('urgency order for generalists', () => {
    const { sim, r } = bare();
    postJob(sim, 'plant', 3); const water = postJob(sim, 'water', 3);
    expect(pickJob(sim, r)).toBe(water);
    const haul = postJob(sim, 'haul', 3); sim.buildings.get(3)!.crates = 1;
    expect(pickJob(sim, r)).toBe(haul);
    const sell = postJob(sim, 'sell', 1);
    expect(pickJob(sim, r)).toBe(sell);
  });
  it('ties break to nearest then lowest id', () => {
    const { sim, r } = bare();
    const first = postJob(sim, 'plant', 4); const second = postJob(sim, 'plant', 3);
    expect(jobCost(sim, r, first)).toBe(jobCost(sim, r, second));
    expect(pickJob(sim, r)).toBe(first); // equal distance: lowest id
    const nearPlot = (apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [3, 3] }) as { id: number }).id;
    sim.jobs.clear();
    const far = postJob(sim, 'plant', 3); const near = postJob(sim, 'plant', nearPlot);
    expect(pickJob(sim, r)).toBe(near);
    claimJob(sim, near, r); claimJob(sim, far, r);
    expect(pickJob(sim, r)).toBeNull();
  });
});

describe('specialist speed', () => {
  const plantDuration = (role: 'farmer' | null) => {
    const sim = createSim({ seed: 1 });
    const h = apply(sim, { type: 'placeBuilding', building: 'house', rotation: 0, origin: [0, 0] }) as { id: number };
    const id = (apply(sim, { type: 'addResident', homeId: h.id }) as { id: number }).id;
    apply(sim, { type: 'setRole', residentId: id, role });
    apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [0, 4] });
    const r = res(sim, id);
    for (let i = 0; i < 100 && r.task?.action !== 'work'; i++) advance(sim, 0.5);
    return r.task!.end - r.task!.start;
  };
  it('divides work durations by the multiplier', () => {
    expect(plantDuration(null)).toBeCloseTo(balance.times.plant);
    expect(plantDuration('farmer')).toBeCloseTo(balance.times.plant / balance.specialistMultiplier);
  });
});

describe('residentPositionAt', () => {
  const r = (): Resident => ({
    id: 1, name: 'a', species: 'cat', homeId: 1, role: null, cell: [0, 0], token: 0, jobId: null, stage: 0, carrying: 0,
    task: { kind: 'job', action: 'walk', path: [[0, 0], [1, 0], [1, 1]], cum: [0, 0.5, 1], start: 10, end: 20 },
  });
  it('interpolates along the path in metres', () => {
    expect(residentPositionAt(r(), 10)).toEqual({ x: 1, z: 1 });
    expect(residentPositionAt(r(), 12.5)).toEqual({ x: 2, z: 1 });
    expect(residentPositionAt(r(), 17.5)).toEqual({ x: 3, z: 2 });
    expect(residentPositionAt(r(), 25)).toEqual({ x: 3, z: 3 });
  });
  it('stands at the cell without a path', () => {
    const q = r(); q.task = null;
    expect(residentPositionAt(q, 5)).toEqual({ x: 1, z: 1 });
  });
});

describe('integration', () => {
  it('earns coins after two days', () => {
    const sim = village(1, 1);
    advance(sim, 2 * DAY_LENGTH);
    expect(sim.coins).toBeGreaterThan(0);
    expect(sim.stats.harvested).toBeGreaterThan(0);
    expect(sim.stats.delivered).toBeGreaterThan(0);
    expect(sim.stats.sold).toBeGreaterThan(0);
    expect(sim.coins).toBe(sim.stats.earned);
  });
  it('plots stop at max crates', () => {
    const sim = createSim({ seed: 1 });
    apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [0, 0] });
    const h = apply(sim, { type: 'placeBuilding', building: 'house', rotation: 0, origin: [4, 0] }) as { id: number };
    apply(sim, { type: 'addResident', homeId: h.id });
    advance(sim, 3 * DAY_LENGTH);
    expect(sim.buildings.get(1)!.crates).toBe(3);
    expect([...sim.jobs.values()].filter(j => j.kind === 'plant' || j.kind === 'harvest')).toEqual([]);
  });
});

describe('determinism', () => {
  it('same seed + commands gives identical snapshot', () => {
    const a = village(7, 2), b = village(7, 2);
    advance(a, 3000); advance(b, 3000);
    expect(snapshot(a)).toEqual(snapshot(b));
  });
  it('one big step equals many uneven steps', () => {
    const a = village(3, 2), b = village(3, 2);
    advance(a, 2 * DAY_LENGTH);
    let left = 2 * DAY_LENGTH, k = 12345;
    for (let i = 0; i < 1000 && left > 0; i++) {
      k = (k * 1103515245 + 12345) % 2147483648;
      const d = i === 999 ? left : Math.min(left, 1 + (k % 4));
      advance(b, d); left -= d;
    }
    advance(b, left);
    expect(snapshot(b)).toEqual(snapshot(a));
  });
});

describe('night', () => {
  it('starts no jobs outside work hours and everyone is home', () => {
    const sim = village(1, 2);
    advance(sim, 0.9 * DAY_LENGTH - sim.t + 1); // just after work end
    advance(sim, 400); // settle: finish in-flight jobs, walk home
    const t0 = sim.t;
    expect(isWorkHours(t0)).toBe(false);
    for (let i = 0; i < 50; i++) {
      advance(sim, 5);
      if (!isWorkHours(sim.t)) {
        for (const r of sim.residents.values()) expect(r.jobId).toBeNull();
      }
    }
    for (const r of sim.residents.values()) expect(r.task?.kind).not.toBe('job');
  });
});

describe('purity', () => {
  const sources = import.meta.glob('../src/{sim,systems}/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  it('sim/ and systems/ have no three/kit/render/ui imports or nondeterministic calls', () => {
    const bad = /from\s+['"](three|[^'"]*\/(kit|render|ui)(\/[^'"]*)?)['"]|performance\.now|Date\.now|Math\.random/;
    expect(Object.keys(sources).length).toBeGreaterThan(5);
    for (const [f, src] of Object.entries(sources)) expect(src, f).not.toMatch(bad);
  });
});
