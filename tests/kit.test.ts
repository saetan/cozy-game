import { describe, expect, it } from 'vitest';
import * as Kit from '../src/kit/index.js';
// @ts-expect-error untyped original single-file kit, the behaviour reference
import * as Orig from '../design_handoff_house_kit/kit/kit.js';

const summarize = (plan: { key: string; x: number; y: number; z: number; ry: number }[]) =>
  plan.map(({ key, x, y, z, ry }) => ({ key, x, y, z, ry }));

describe('kit split preserves behaviour', () => {
  it('exports the same public API as the original', () => {
    expect(Object.keys(Kit).sort()).toEqual(Object.keys(Orig).sort());
  });

  Kit.LEVELS.forEach((spec, i) => {
    it(`LEVELS[${i}] ${spec.name}: buildPlan matches the original`, () => {
      const a = Kit.buildPlan(spec, -3, -3), b = Orig.buildPlan(Orig.LEVELS[i], -3, -3);
      expect(a.length).toBeGreaterThan(0);
      expect(summarize(a)).toEqual(summarize(b));
      for (const p of a) expect(() => p.make()).not.toThrow();
    });
  });

  it('every named piece, action scene and the random house build', () => {
    for (const k of Object.keys(Kit.P)) expect(() => Kit.P[k]()).not.toThrow();
    for (const sp of Kit.SPECIES) for (const a of Object.keys(Kit.ACTIONS)) {
      const scene = Kit.actorScene(sp, a);
      expect(() => { for (const r of Kit.getActors()) Kit.animate(r, 1.3); }).not.toThrow();
      expect(scene).toBeTruthy();
    }
    expect(() => Kit.house(3)).not.toThrow();
  });
});
