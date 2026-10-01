import { describe, expect, it } from 'vitest';
import { advance, apply, createSim } from '../src/sim/sim';
import { describeActivity } from '../src/ui/activity';
import { lineCells } from '../src/ui/tileTool';

describe('lineCells', () => {
  it('connects two cells without gaps', () => {
    const c = lineCells([0, 0], [5, 2]);
    expect(c[0]).toEqual([0, 0]); expect(c.at(-1)).toEqual([5, 2]);
    for (let i = 1; i < c.length; i++) expect(Math.abs(c[i][0] - c[i - 1][0]) + Math.abs(c[i][1] - c[i - 1][1])).toBeLessThanOrEqual(2);
    expect(lineCells([2, 2], [2, 2])).toEqual([[2, 2]]);
  });
});

describe('describeActivity', () => {
  it('rests at night and works by day', () => {
    const sim = createSim({ seed: 1 });
    apply(sim, { type: 'placeBuilding', building: 'house', rotation: 0, origin: [0, 0] });
    apply(sim, { type: 'placeBuilding', building: 'farmPlot', rotation: 0, origin: [0, 6] });
    const r = sim.residents.get(1)!;
    r.trait = 'sturdy';
    advance(sim, 0.001);
    expect(describeActivity(sim, r)).toMatch(/Walking to the field|Planting/);
    advance(sim, 1100);
    expect(describeActivity(sim, r)).toBe('Resting at home');
  });
});
