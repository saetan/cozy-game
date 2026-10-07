import { expect, test, type Page } from '@playwright/test';
import { evidencePath, openGame, pauseClock } from './helpers';

// Proof is sim and scene inspection at exact moments (runUntil steps the sim event by event, then redraws once).
// The screenshot is evidence only.
const e2e = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as any).__e2e[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const until = (page: Page, pred: string) => page.evaluate(`window.__e2e.runUntil(${pred})`) as Promise<number>;
const game = <T>(page: Page, fn: string) => page.evaluate(`(${fn})(window.__game)`) as Promise<T>;

const WAITING = `s => [...s.residents.values()].some(r => r.task && r.task.action === 'wait')`;

test('two cars share one lane: the second waits at the entrance on its car, then rides on', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await e2e(page, 'giveCoins', 5000);
  // Both lane rules say "always wait" (the default would let the second resident take the unlimited bicycle instead)
  await e2e(page, 'setTraffic', { lane: { whenBusy: 'wait' }, dirtLane: { whenBusy: 'wait' } });
  const setup = await page.evaluate(() => {
    const g = (window as any).__game;
    const h1 = g.placeBuilding('house', 0, [-14, 10]).id, h2 = g.placeBuilding('house', 0, [-14, 20]).id;
    for (const h of [h1, h2]) for (let i = 0; i < 3; i++) g.apply({ type: 'levelUp', buildingId: h });
    const all = [...g.sim.residents.values()] as any[];
    const r1 = all.find(r => r.homeId === h1), r2 = all.find(r => r.homeId === h2);
    for (const r of all) if (r !== r1 && r !== r2) g.sim.residents.delete(r.id);
    const [x, z] = r1.cell as [number, number];
    const cells: number[][] = [];
    for (let i = 6; i <= 20; i++) cells.push([x + i, z]);
    for (let j = z; j <= r2.cell[1]; j++) cells.push([x + 6, j]);
    g.apply({ type: 'setTile', cells, kind: 'lane' });
    g.placeBuilding('farmPlot', 0, [x + 20, z + 2]); g.placeBuilding('farmPlot', 0, [x + 20, z - 4]);
    return { ids: [r1.id, r2.id] as number[], names: [r1.name, r2.name] as string[], entrance: [x + 5, z] as [number, number], x, z };
  });
  await page.locator('#arrival-ok').click({ timeout: 2000 }).catch(() => {});
  await page.clock.runFor(100);
  await pauseClock(page);

  await until(page, WAITING);
  const state = await page.evaluate(() => {
    const s = (window as any).__game.sim;
    const w = [...s.residents.values()].find((r: any) => r.task?.action === 'wait') as any;
    const other = [...s.residents.values()].find((r: any) => r !== w && r.vehicle) as any;
    return {
      waiter: w.id as number, vehicle: w.vehicle as string, name: w.name as string, path: !!w.task.path, until: w.task.end as number, now: s.t as number,
      otherRiding: !!other && !!other.task?.path, reserved: s.reservations.length as number,
      blockedUntil: Math.max(...s.reservations.map((x: any) => x.to)) as number, waiterCell: w.cell as [number, number],
    };
  });
  expect(setup.ids).toContain(state.waiter);
  expect(state.vehicle).toBe('car');
  expect(state.path).toBe(false);
  expect(state.otherRiding).toBe(true);
  expect(state.reserved).toBeGreaterThan(0);
  expect(state.until).toBeGreaterThan(state.now);
  expect(state.until).toBeCloseTo(state.blockedUntil, 6); // it waits exactly until the blocking reservation ends
  const [wx, wz] = state.waiterCell; // the cell before the lane: not a lane cell itself, but next to one
  const lane = (a: number, b: number) => game<boolean>(page, `s => s.sim.tiles.get('${a},${b}') === 'lane'`);
  expect(await lane(wx, wz)).toBe(false);
  expect((await Promise.all([lane(wx + 1, wz), lane(wx - 1, wz), lane(wx, wz + 1), lane(wx, wz - 1)])).some(Boolean)).toBe(true);

  // the resident panel says so
  await page.getByRole('button', { name: 'Residents' }).click();
  await page.locator('#residents-panel').getByRole('button', { name: state.name }).click();
  await page.clock.runFor(100);
  await expect(page.locator('#panel .activity')).toHaveText('Waiting for the lane to clear');
  // the resident is drawn sitting on the car, not walking beside it
  expect(await e2e<{ action: string }>(page, 'residentView', state.waiter)).toMatchObject({ action: 'sit' });
  expect(await game<string | null>(page, `s => s.sim.residents.get(${state.waiter}).vehicle`)).toBe('car');

  // evidence: a car waiting at the entrance while the other is in the lane
  for (let i = 0; i < 3; i++) await page.locator('#arrival-ok').click({ timeout: 500 }).catch(() => {});
  await page.locator('#residents-btn').click(); // close the list again
  await e2e(page, 'closeUp', wx + 1, wz - 5, 46);
  await page.clock.runFor(100);
  await page.screenshot({ path: evidencePath(testInfo, 'traffic-wait.png') });

  // then it rides on from the entrance, still on its car, and the vehicle is released at the end
  await until(page, `s => { const r = s.residents.get(${state.waiter}); return !r.task || r.task.action !== 'wait'; }`);
  expect(await game<boolean>(page, `s => { const r = s.sim.residents.get(${state.waiter}); return !!r.task && !!r.task.path && r.vehicle === 'car'; }`)).toBe(true);
  await until(page, `s => { const r = s.residents.get(${state.waiter}); return r.vehicle === null && (!r.task || !r.task.path); }`);
  await page.clock.runFor(100);
  expect(errors).toEqual([]);
});
