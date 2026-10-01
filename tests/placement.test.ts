import { describe, expect, it } from 'vitest';
import { createWorld, isFree } from '../src/sim/world';
import { canPlace, place, remove, rotateFootprint, worldCells } from '../src/systems/placement';

const sorted = (c: number[][]) => c.map(p => p.join(',')).sort();
const L = [[0, 0], [1, 0], [2, 0]] as const; // 3 wide, 1 deep

describe('rotateFootprint', () => {
  it('rotation 0 is identity', () => {
    expect(sorted(rotateFootprint(L, 0))).toEqual(sorted([[0, 0], [1, 0], [2, 0]]));
  });
  it('90 degrees turns a 3x1 into a 1x3', () => {
    expect(sorted(rotateFootprint(L, 1))).toEqual(sorted([[0, 0], [0, 1], [0, 2]]));
  });
  it('180 keeps the 3x1 shape, 270 is the 1x3 again', () => {
    expect(sorted(rotateFootprint(L, 2))).toEqual(sorted([[0, 0], [1, 0], [2, 0]]));
    expect(sorted(rotateFootprint(L, 3))).toEqual(sorted([[0, 0], [0, 1], [0, 2]]));
  });
  it('four turns return an asymmetric shape to itself', () => {
    const fp = [[0, 0], [1, 0], [0, 1]] as const;
    expect(sorted(rotateFootprint(fp, 4))).toEqual(sorted(fp.map(c => [...c])));
    expect(sorted(rotateFootprint(fp, 1))).not.toEqual(sorted(fp.map(c => [...c])));
  });
  it('rotations are normalised to non-negative local cells', () => {
    for (let r = 0; r < 4; r++) for (const [x, z] of rotateFootprint(L, r)) { expect(x).toBeGreaterThanOrEqual(0); expect(z).toBeGreaterThanOrEqual(0); }
  });
});

describe('placement', () => {
  it('places on free unlocked cells and occupies them', () => {
    const w = createWorld(), p = place(w, L, 1, 2, 2)!;
    expect(p).not.toBeNull();
    expect(sorted(worldCells(L, 1, 2, 2))).toEqual(sorted([[2, 2], [2, 3], [2, 4]]));
    expect(isFree(w, 2, 4)).toBe(false);
  });
  it('blocks overlap, and rotation changes which cells overlap', () => {
    const w = createWorld();
    place(w, L, 0, 0, 0);
    expect(canPlace(w, L, 0, 1, 0)).toBe(false);
    expect(canPlace(w, L, 1, 3, 0)).toBe(true);
    expect(canPlace(w, L, 1, 2, 0)).toBe(false);
    expect(place(w, L, 0, 2, 0)).toBeNull();
  });
  it('blocks locked chunks and partial overlaps with the border', () => {
    const w = createWorld();
    expect(canPlace(w, L, 0, 40, 0)).toBe(false);
    expect(canPlace(w, L, 0, 30, 0)).toBe(false); // spills into locked chunk x=32
    expect(canPlace(w, L, 0, 29, 0)).toBe(true);
  });
  it('remove frees the cells again', () => {
    const w = createWorld(), p = place(w, L, 0, 0, 0)!;
    remove(w, p);
    expect(canPlace(w, L, 0, 0, 0)).toBe(true);
  });
});
