import { describe, expect, it } from 'vitest';
import { CHUNK, cellToChunk, createWorld, isFree, isUnlocked, occupy, release, unlockChunk } from '../src/sim/world';

describe('world', () => {
  it('chunk is 16 cells and cellToChunk floors (negatives too)', () => {
    expect(CHUNK).toBe(16);
    expect(cellToChunk(0, 0)).toEqual([0, 0]);
    expect(cellToChunk(15, 16)).toEqual([0, 1]);
    expect(cellToChunk(-1, -16)).toEqual([-1, -1]);
    expect(cellToChunk(-17, 0)).toEqual([-2, 0]);
  });
  it('starts with a 3x3 block of chunks unlocked', () => {
    const w = createWorld();
    expect(w.unlocked.size).toBe(9);
    expect(isUnlocked(w, -16, -16)).toBe(true);
    expect(isUnlocked(w, 31, 31)).toBe(true);
    expect(isUnlocked(w, 32, 0)).toBe(false);
    expect(isUnlocked(w, 0, -17)).toBe(false);
  });
  it('cells outside the world bounds are never unlocked', () => {
    const w = createWorld({ width: 64, height: 64, startUnlockedRadius: 5 });
    expect(isUnlocked(w, 31, 31)).toBe(true);
    expect(isUnlocked(w, 32, 0)).toBe(false);
    expect(isUnlocked(w, -33, 0)).toBe(false);
  });
  it('unlockChunk adds neighbours', () => {
    const w = createWorld();
    unlockChunk(w, 2, 0);
    expect(isUnlocked(w, 32, 0)).toBe(true);
  });
  it('occupy and release toggle freedom', () => {
    const w = createWorld();
    expect(isFree(w, 3, 4)).toBe(true);
    occupy(w, 3, 4, 7);
    expect(isFree(w, 3, 4)).toBe(false);
    release(w, 3, 4);
    expect(isFree(w, 3, 4)).toBe(true);
  });
});
