import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/kit/index.js';
import { HOUSE_FRAME, HOUSE_OFFSET, HOUSE_MAX_LEVEL, houseCells } from '../src/sim/houses';

// The sim cannot import the kit, so its per-level cells are data; this keeps that data honest.
const kitCells = (L: (typeof LEVELS)[number]) => {
  const s = new Map<string, [number, number]>();
  const add = (c: readonly number[]) => s.set(`${c[0]},${c[1]}`, [c[0], c[1]]);
  L.cells.filter(c => c.length === 2 || c[2] === 0).forEach(add);
  L.porch.forEach(add);
  (L.garage?.cells ?? []).forEach(add);
  return [...s.values()];
};
const norm = (cells: ReadonlyArray<readonly number[]>) => cells.map(c => `${c[0]},${c[1]}`).sort();

describe('houseLevels.json vs the kit LEVELS', () => {
  const union = LEVELS.flatMap(kitCells);
  const min = [Math.min(...union.map(c => c[0])), Math.min(...union.map(c => c[1]))];
  it('has one entry per kit level', () => expect(HOUSE_MAX_LEVEL).toBe(LEVELS.length));
  it('frame is the bbox of the union of all levels, offset shifts its min to 0', () => {
    expect(HOUSE_OFFSET).toEqual([-min[0], -min[1]]);
    expect(HOUSE_FRAME).toEqual([Math.max(...union.map(c => c[0])) - min[0] + 1, Math.max(...union.map(c => c[1])) - min[1] + 1]);
  });
  LEVELS.forEach((L, i) => {
    it(`Lv${i + 1} cells = floor-0 cells + porch + garage (no driveway), shifted into the frame`, () => {
      const want = kitCells(L).map(([x, z]) => [x + HOUSE_OFFSET[0], z + HOUSE_OFFSET[1]]);
      expect(norm(houseCells(i + 1))).toEqual(norm(want));
    });
  });
});
