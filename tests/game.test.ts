import { describe, expect, it } from 'vitest';
import { createGame, MAX_FRAME_DT } from '../src/game';
import { market } from '../src/sim/jobs';
import { DAY_LENGTH } from '../src/sim/clock';
import { facingAngle, kitAction, plotKitStage } from '../src/render/mapping';
import { ACTIONS } from '../src/kit/index.js';

describe('game wiring', () => {
  it('pre-places the market', () => {
    const g = createGame();
    expect(market(g.sim)).toBeTruthy();
    expect(g.sim.residents.size).toBe(0);
  });
  it('starts with coins for 1 house + 2 farm plots (the market is free)', () => {
    const g = createGame();
    expect(g.sim.coins).toBe(80);
    expect(g.placeBuilding('house', 0, [-8, 0]).ok).toBe(true);
    expect(g.placeBuilding('farmPlot', 0, [0, 4]).ok).toBe(true);
    expect(g.placeBuilding('farmPlot', 0, [2, 4]).ok).toBe(true);
    expect(g.sim.coins).toBe(0);
    expect(g.placeBuilding('farmPlot', 0, [4, 4])).toEqual({ ok: false, reason: 'not enough coins' });
  });
  it('every house brings a resident when placed', () => {
    const g = createGame();
    g.sim.coins = 200;
    expect(g.placeBuilding('house', 0, [-8, 0]).ok).toBe(true);
    expect(g.sim.residents.size).toBe(1);
    expect(g.placeBuilding('house', 0, [-8, 8]).ok).toBe(true);
    expect(g.sim.residents.size).toBe(2);
  });
  it('fails when blocked', () => {
    const g = createGame();
    expect(g.placeBuilding('house', 0, [0, 0]).ok).toBe(false);
    expect(g.sim.residents.size).toBe(0);
  });
  it('clamps frame dt and scales by speed', () => {
    const g = createGame(); g.setSpeed(5);
    const t0 = g.sim.t; g.frame(100);
    expect(g.sim.t - t0).toBeCloseTo(MAX_FRAME_DT * 5);
  });
  it('demo village earns coins within 2 in-game days', () => {
    const g = createGame({ demo: true });
    expect(g.speed).toBe(20);
    const end = g.sim.t + 2 * DAY_LENGTH;
    while (g.sim.t < end) g.frame(0.25);
    expect(g.sim.coins).toBeGreaterThan(0);
  });
});

describe('render mappings', () => {
  it('plot state -> kit stage', () => {
    expect(plotKitStage('empty')).toBeNull();
    expect(plotKitStage('growing')).toBe(0);
    expect(plotKitStage('thirsty')).toBe(1);
    expect(plotKitStage('watered')).toBe(1);
    expect(plotKitStage('ripe')).toBe(2);
  });
  it('task action -> kit action (all exist in the kit)', () => {
    expect(kitAction(null)).toBe('stand');
    for (const a of ['walk', 'work', 'water', 'carry', 'sell', 'stand'] as const) {
      expect(ACTIONS[a]).toBeDefined();
      expect(kitAction({ kind: 'job', action: a, start: 0, end: 1 })).toBe(a);
    }
  });
  it('facing angle', () => {
    expect(facingAngle(0, 0)).toBeNull();
    expect(facingAngle(0, 1)).toBeCloseTo(0);
    expect(facingAngle(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(facingAngle(-1, 0)).toBeCloseTo(-Math.PI / 2);
  });
});
