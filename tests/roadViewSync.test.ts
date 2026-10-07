import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRoadView } from '../src/render/roadView';
import { apply, createSim, type SimState } from '../src/sim/sim';
import { deserialize, serialize } from '../src/systems/save';
import type { Cell } from '../src/sim/state';

// The view reads sim.streets and sim.tiles only when it rebuilds, so counting reads of them counts rebuilds.
function watched(sim: SimState) {
  const reads = { n: 0 };
  const src = { get streets() { reads.n++; return sim.streets; }, get tiles() { return sim.tiles; } };
  const view = createRoadView(new THREE.Scene(), src);
  return { view, reads, sync: () => { const before = reads.n; view.sync(0); return reads.n > before; } };
}
const rich = () => { const s = createSim({ seed: 1 }); s.coins = 100000; return s; };

describe('road view change detection', () => {
  it('builds once, then does nothing until a road command changes something', () => {
    const sim = rich(), w = watched(sim);
    expect(w.sync()).toBe(true); // first frame
    for (let i = 0; i < 5; i++) expect(w.sync()).toBe(false);
    apply(sim, { type: 'setStreet', tiles: [[0, 0]], kind: 'road' });
    expect(w.sync()).toBe(true); expect(w.sync()).toBe(false);
    expect(w.view.keys().length).toBeGreaterThan(0);
  });
  it('rebuilds after place, erase, a 6 m tile replacing lanes, and a building clearing a path', () => {
    const sim = rich(), w = watched(sim); w.sync();
    const step = (cmd: Parameters<typeof apply>[1]) => { expect(apply(sim, cmd).ok).toBe(true); expect(w.sync()).toBe(true); expect(w.sync()).toBe(false); };
    step({ type: 'setTile', cells: [[0, 3], [1, 3]], kind: 'lane' });
    step({ type: 'setTile', cells: [[0, 3]], kind: null });
    step({ type: 'setTile', cells: [[4, 3]], kind: 'path' });
    step({ type: 'setStreet', tiles: [[0, 1]], kind: 'road' }); // covers the lane cells (0..2, 3..5)
    expect([...sim.tiles.keys()].some(k => k === '1,3')).toBe(false);
    step({ type: 'setTile', cells: [[0, 4]] as Cell[], kind: null }); // erasing a street cell removes its tile
    step({ type: 'placeBuilding', building: 'house', rotation: 0, origin: [-8, 0] });
  });
  it('a loaded village gets a fresh view that builds all its roads on its first frame', () => {
    const sim = rich();
    apply(sim, { type: 'setStreet', tiles: [[0, 0], [1, 0]], kind: 'road' }); apply(sim, { type: 'setTile', cells: [[0, 3]], kind: 'path' });
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(sim, 0)))), a = watched(sim), b = watched(loaded);
    a.sync(); expect(b.sync()).toBe(true);
    expect(b.view.keys()).toEqual(a.view.keys());
    expect(b.sync()).toBe(false);
  });
});
