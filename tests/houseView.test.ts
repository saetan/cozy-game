import { describe, expect, it } from 'vitest';
import { HOUSE_FOOTPRINT, rotationShift } from '../src/render/houseView';
import { rotateFootprint } from '../src/systems/placement';

describe('rotationShift', () => {
  it('Lv1 house footprint is the 2x2 ground block', () => {
    expect(HOUSE_FOOTPRINT.length).toBe(4);
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
