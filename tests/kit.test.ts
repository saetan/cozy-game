// Kit compatibility: guards the vendored Claude Design kit (design/kit, see design/README.md) against the game's use of it.
import { describe, expect, it } from 'vitest';
import * as Kit from '../src/kit/index.js';
import plans from './fixtures/kit-plans.json';

const sources = import.meta.glob(['../src/**/*.ts', '../src/**/*.js', '!../src/kit/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Every name the game imports from the kit (parsed from src/ so the list cannot drift). */
function importedNames(): string[] {
  const names = new Set<string>();
  for (const text of Object.values(sources))
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[./]*(?:src\/)?kit\/index\.js'/g))
      for (const n of m[1].split(',')) { const t = n.trim(); if (t && !t.startsWith('type ')) names.add(t.split(/\s+as\s+/)[0]); }
  return [...names].sort();
}

const kindOf = (v: unknown) => typeof v;
const EXPECTED_KIND: Record<string, string> = {
  CELL: 'number', LEVELS: 'object', P: 'object', M: 'function', box: 'function', grp: 'function',
  buildPlan: 'function', animate: 'function', board: 'function', resident: 'function', setAction: 'function',
};

describe('kit compatibility', () => {
  it('every kit name the game imports exists with the right kind', () => {
    const names = importedNames();
    expect(names).toEqual(expect.arrayContaining(Object.keys(EXPECTED_KIND)));
    for (const n of names) {
      expect((Kit as Record<string, unknown>)[n], n).toBeDefined();
      if (EXPECTED_KIND[n]) expect(kindOf((Kit as Record<string, unknown>)[n]), n).toBe(EXPECTED_KIND[n]);
    }
  });

  it('upgrade regression: LEVELS plans match the committed fixture (bike stands excluded)', () => {
    expect(Kit.LEVELS.length).toBe(plans.length);
    Kit.LEVELS.forEach((spec, i) => {
      const got = Kit.buildPlan(spec, -3, -3)
        .filter(p => !p.key.startsWith('bikeStand'))
        .map(({ key, x, y, z, ry }) => ({ key, x, y, z, ry }));
      expect(got, `LEVELS[${i}] ${spec.name}`).toEqual(plans[i]);
    });
  });

  it('every piece the game calls builds', () => {
    const wanted = ['beltCourse', 'bicycle', 'car', 'chimney', 'cornerPost', 'crate', 'driveway', 'farmPlot', 'fence', 'foundation',
      'gable', 'gableHalf', 'garageSlab', 'hoe', 'marketStall', 'porchDeck', 'porchPost', 'porchSteps', 'ridgeCap', 'roofSlope',
      'scarecrow', 'shrub', 'wagon', 'wall', 'wallDoor', 'wallGarage', 'wallWindow', 'wateringCan'];
    for (const k of wanted) expect(Kit.P[k], k).toBeTypeOf('function');
    const args: Record<string, unknown> = {
      roofSlope: { run: 2, rise: 1.2, width: 2 }, ridgeCap: { rise: 1 }, gable: { ridgeAt: 1, run: 2, rise: 1.2 }, gableHalf: { run: 2, rise: 1.2 },
    };
    for (const k of wanted) expect(() => Kit.P[k](args[k]), k).not.toThrow();
    for (const t of Kit.CROPS) for (const s of [0, 1, 2]) expect(() => Kit.P['crop_' + t]?.(s) ?? Kit.crop(t, s), `${t}/${s}`).not.toThrow();
    expect(() => Kit.house(3)).not.toThrow();
  });

  it('setAction / animate work for every action the game uses, and work aliases hoe', () => {
    for (const a of ['stand', 'walk', 'carry', 'work', 'water', 'sell', 'hoe', 'sow']) {
      const r = Kit.resident('fox');
      expect(() => { Kit.setAction(r, a); Kit.animate(r, 1.3); Kit.animate(r, 2.9); }, a).not.toThrow();
    }
    const w = Kit.resident('cat'), h = Kit.resident('cat');
    Kit.setAction(w, 'work'); Kit.setAction(h, 'hoe'); Kit.animate(w, 0.4); Kit.animate(h, 0.4);
    expect(w.children.length).toBe(h.children.length);
  });
});
