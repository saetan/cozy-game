import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CELL } from '../src/kit/index.js';
import { HOUSE_FRAME_FOOTPRINT, createHouseObject, housePlan, poseFootprint, rotationShift, setHouseLevel, setHousePose, stepTweens, activeTweens } from '../src/render/houseView';
import { HOUSE_MAX_LEVEL, houseCells } from '../src/sim/houses';
import { apply, createSim } from '../src/sim/sim';
import { rotateFootprint, type Rotation } from '../src/systems/placement';

describe('rotationShift', () => {
  it('the house frame is one fixed 4x5 block shared by all levels', () => {
    expect(HOUSE_FRAME_FOOTPRINT.length).toBe(20);
    expect(houseCells(1).length).toBe(4);
  });
  it('rotating the model about Y by -r*90deg then shifting lands on rotateFootprint cells', () => {
    const fp = [[0, 0], [1, 0], [2, 0], [0, 1]] as const;
    for (let r = 0; r < 4; r++) {
      const [sx, sz] = rotationShift(fp, r);
      const want = new Set(rotateFootprint(fp, r).map(c => c.join(',')));
      const got = fp.map(([x, z]) => {
        let cx = x + 0.5, cz = z + 0.5;
        for (let i = 0; i < r; i++) [cx, cz] = [-cz, cx];
        return `${Math.floor(cx + sx)},${Math.floor(cz + sz)}`;
      });
      expect(new Set(got)).toEqual(want);
    }
  });
});

describe('house rendering matches the sim', () => {
  // pieces that sit on exactly one ground cell, with the key prefix that says so
  const GROUND = /^(found|gslab|porch):/;
  it('for every level and rotation, ground pieces land on exactly the sim-occupied cells', () => {
    for (const rotation of [0, 1, 2, 3] as Rotation[]) {
      const sim = createSim({ seed: 1 });
      sim.coins = 1e6;
      const [ox, oz] = [7, -3];
      const id = (apply(sim, { type: 'placeBuilding', building: 'house', rotation, origin: [ox, oz] }) as { id: number }).id;
      for (let level = 1; level <= HOUSE_MAX_LEVEL; level++) {
        const b = sim.buildings.get(id)!;
        const g = createHouseObject(level);
        setHousePose(g, poseFootprint(b.placement), rotation, ox, oz);
        g.updateMatrixWorld(true);
        const rendered = new Set<string>();
        for (const o of g.children) {
          if (!GROUND.test(o.userData.key)) continue;
          const p = o.getWorldPosition(new THREE.Vector3());
          rendered.add(`${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`);
        }
        const occupied = new Set([...sim.world.occupied].filter(([, v]) => v === b.placement.id).map(([k]) => k));
        expect([...rendered].sort(), `Lv${level} rot${rotation}`).toEqual([...occupied].sort());
        if (level < HOUSE_MAX_LEVEL) expect(apply(sim, { type: 'levelUpHouse', houseId: id }).ok).toBe(true);
      }
    }
  });
  it('no driveway pieces are rendered', () => {
    for (let l = 1; l <= HOUSE_MAX_LEVEL; l++) expect(housePlan(l).some(p => p.key.startsWith('drive:'))).toBe(false);
  });
});

describe('level-up diff animation', () => {
  it('keeps unchanged pieces, pops new ones in and shrinks removed ones out over 0.3 s', () => {
    const g = createHouseObject(1);
    const before = new Map(g.children.map(o => [o.userData.key as string, o]));
    const next = new Set(housePlan(2).map(p => p.key));
    setHouseLevel(g, 2, 10);
    for (const [k, o] of before) if (next.has(k)) expect(g.children).toContain(o); // untouched
    const gone = [...before].filter(([k]) => !next.has(k));
    expect(gone.length).toBeGreaterThan(0); // Lv1 -> Lv2 replaces roof pieces
    stepTweens(10.15);
    for (const [, o] of gone) { expect(o.scale.x).toBeLessThan(1); expect(g.children).toContain(o); }
    const added = g.children.filter(o => !before.has(o.userData.key));
    expect(added.length).toBeGreaterThan(0);
    for (const o of added) expect(o.scale.x).toBeLessThan(0.01);
    stepTweens(20);
    for (const [, o] of gone) expect(g.children).not.toContain(o);
    for (const o of added) expect(o.scale.x).toBeCloseTo(1);
    expect(activeTweens()).toBe(0);
  });
});
