import type { Page } from '@playwright/test';

export interface Pt { x: number; y: number }

/** Fake time BEFORE goto so performance.now / rAF / timers are all controlled by page.clock. */
export async function openGame(page: Page, query = '') {
  await page.clock.install({ time: 0 });
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/' + query);
  await page.waitForFunction(() => !!(window as any).__game);
  await page.clock.runFor(100); // a few frames
  return errors;
}

export const cellToScreen = (page: Page, x: number, z: number) =>
  page.evaluate(([cx, cz]) => (window as any).__e2e.cellToScreen(cx, cz) as Pt, [x, z]);

export const buildings = (page: Page) =>
  page.evaluate(() => [...(window as any).__game.sim.buildings.values()].map((b: any) => ({ type: b.type, placement: b.placement })));

/** Cells occupied by a building (from the sim's world), as [x, z] pairs. */
export const occupiedBy = (page: Page, id: number) =>
  page.evaluate(bid => {
    const g = (window as any).__game.sim as { world: { occupied: Map<string, number> }; buildings: Map<number, any> };
    const pid = g.buildings.get(bid).placement.id;
    return [...g.world.occupied].filter(([, v]) => v === pid).map(([k]) => k.split(',').map(Number) as [number, number]);
  }, id);

/** Mean cell index of a building's occupied cells. */
export async function houseCentre(page: Page, id: number) {
  const cells = await occupiedBy(page, id);
  return [cells.reduce((a, c) => a + c[0], 0) / cells.length, cells.reduce((a, c) => a + c[1], 0) / cells.length] as [number, number];
}
export const simState = <T>(page: Page, fn: string): Promise<T> =>
  page.evaluate(`(${fn})(window.__game.sim)`) as Promise<T>;

/** page.clock keeps flowing in real time by default, so on slow CI renderers the sim would run on between steps.
 *  Pause it a moment ahead (at most one clamped frame); retry if that moment has already passed. */
export async function pauseClock(page: Page) {
  for (let i = 0; i < 5; i++) {
    try { await page.clock.pauseAt(await page.evaluate(() => Date.now() + 250)); return; }
    catch (e) { if (!String(e).includes('past')) throw e; }
  }
  throw new Error('could not pause page.clock');
}
