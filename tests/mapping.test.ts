import { describe, expect, it } from 'vitest';
import { kitAction, plotKitStage, plotThirsty } from '../src/render/mapping';
import type { Task } from '../src/sim/state';

const work: Task = { kind: 'job', action: 'work', start: 100, end: 110 };
describe('kitAction', () => {
  it('planting is sow for the first half, hoe for the second', () => {
    expect(kitAction(work, 'plant', 100)).toBe('sow');
    expect(kitAction(work, 'plant', 104.9)).toBe('sow');
    expect(kitAction(work, 'plant', 105)).toBe('hoe');
    expect(kitAction(work, 'plant', 110)).toBe('hoe');
  });
  it('other work keeps its look', () => {
    for (const k of ['harvest', 'haul'] as const) expect(kitAction(work, k, 101)).toBe('work');
    expect(kitAction(work, undefined, 101)).toBe('work');
  });
  it('water and walking pass through, no task stands', () => {
    expect(kitAction({ ...work, action: 'water' }, 'water', 101)).toBe('water');
    expect(kitAction({ ...work, action: 'walk' }, 'plant', 101)).toBe('walk');
    expect(kitAction(null, 'plant', 101)).toBe('stand');
  });
});
describe('thirsty plot', () => {
  it('draws kit stage 1 with the thirsty flag; watered is stage 1 without it', () => {
    expect([plotKitStage('thirsty'), plotThirsty('thirsty')]).toEqual([1, true]);
    expect([plotKitStage('watered'), plotThirsty('watered')]).toEqual([1, false]);
    for (const s of ['empty', 'growing', 'ripe'] as const) expect(plotThirsty(s)).toBe(false);
  });
});
