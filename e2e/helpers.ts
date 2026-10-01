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
