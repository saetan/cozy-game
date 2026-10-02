import { expect, test, type Page } from '@playwright/test';
import { openGame } from './helpers';

const game = <T>(page: Page, fn: string) => page.evaluate(`(${fn})(window.__game)`) as Promise<T>;
const e2e = (page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).__e2e[f as string](...(a as unknown[])), [fn, args] as const);
const HOUR = 3600_000;

async function buildVillage(page: Page) {
  await e2e(page, 'giveCoins', 500);
  await page.evaluate(() => {
    const g = (window as any).__game;
    for (const o of [[-8, 0], [-8, 6], [-8, -6]]) g.placeBuilding('house', 0, o);
    for (const x of [0, 2, 4, 6, 8, 10]) g.placeBuilding('farmPlot', 0, [x, 4]);
    ['farmer', 'hauler', 'seller'].forEach((role, i) => g.apply({ type: 'setRole', residentId: i + 1, role }));
  });
  await e2e(page, 'advance', 900);
}
/** Close the tab and return `ms` later: save, backdate the stored savedAt, reload. */
async function away(page: Page, ms: number) {
  await e2e(page, 'saveNow');
  await e2e(page, 'backdateSave', ms);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__game);
  await page.clock.runFor(100);
}
const dismissCards = async (page: Page) => { while (await page.locator('#arrival-card').isVisible()) await page.locator('#arrival-ok').click(); };
const roles = (page: Page) => game<(string | null)[]>(page, 'g => [...g.sim.residents.values()].map(r => r.role)');

test('MVP: build a village, leave for 3 h, return to a summary and a restored village', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await buildVillage(page);
  const before = await game<{ houses: number; residents: number }>(page, 'g => ({ houses: [...g.sim.buildings.values()].filter(b => b.type === "house").length, residents: g.sim.residents.size })');
  expect(before).toEqual({ houses: 3, residents: 3 });
  await away(page, 3 * HOUR);
  const card = page.locator('#away-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('While you were away (3h 0m)');
  await expect(card).not.toContainText('capped');
  await expect(card).toContainText('Crops sold');
  await expect(card).toContainText('days passed');
  expect(await game<number>(page, 'g => g.sim.stats.sold')).toBeGreaterThan(0);
  expect(await game<number>(page, 'g => g.sim.coins')).toBeGreaterThan(0);
  expect(await game(page, 'g => g.sim.residents.size')).toBe(3);
  expect(await roles(page)).toEqual(['farmer', 'hauler', 'seller']);
  expect(await game(page, 'g => [...g.sim.buildings.values()].filter(b => b.type === "house").length')).toBe(3);
  await expect(page.locator('#arrival-card')).toBeHidden(); // old arrivals are not re-announced
  await page.screenshot({ path: 'docs/screenshots/m4-away.png' });
  await testInfo.attach('m4-away', { path: 'docs/screenshots/m4-away.png', contentType: 'image/png' });
  await page.locator('#away-ok').click();
  await expect(card).toBeHidden();
  expect(errors).toEqual([]);
});

test('away time is capped at 8 h', async ({ page }) => {
  await openGame(page);
  await buildVillage(page);
  const t0 = await game<number>(page, 'g => g.sim.t');
  await away(page, 20 * HOUR);
  await expect(page.locator('#away-card')).toContainText('(capped at 8 h)');
  await expect(page.locator('#away-card')).toContainText('While you were away (20h 0m)');
  expect(await game<number>(page, 'g => g.sim.t')).toBeGreaterThanOrEqual(t0 + 8 * 3600);
  expect(await game<number>(page, 'g => g.sim.t')).toBeLessThan(t0 + 8 * 3600 + 60);
});

test('a plain reload shows no summary and keeps the village', async ({ page }) => {
  await openGame(page);
  await buildVillage(page);
  const coins = await game<number>(page, 'g => g.sim.coins');
  await e2e(page, 'saveNow');
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__game);
  await page.clock.runFor(100);
  await expect(page.locator('#away-card')).toBeHidden();
  expect(await game(page, 'g => g.sim.residents.size')).toBe(3);
  expect(await game<number>(page, 'g => g.sim.coins')).toBeGreaterThanOrEqual(coins);
});

test('export then import restores the village; a bad file is rejected', async ({ page }) => {
  await openGame(page);
  await buildVillage(page);
  await e2e(page, 'saveNow');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^cozy-village-\d{4}-\d\d-\d\d\.json$/);
  const path = await dl.path();
  const saved = JSON.parse(await (await import('node:fs/promises')).readFile(path, 'utf8'));
  expect(saved.version).toBe(1);
  expect(saved.sim.residents).toHaveLength(3);

  // bad file: toast, game untouched
  await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":99,"sim":{}}') });
  await expect(page.locator('#toast')).toContainText('Import failed');
  expect(await game(page, 'g => g.sim.residents.size')).toBe(3);

  // New village wipes; import brings it back
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'New village' }).click();
  await page.waitForFunction(() => !!(window as any).__game && (window as any).__game.sim.residents.size === 0);
  await page.clock.runFor(100);
  await page.locator('#import-file').setInputFiles(path);
  await page.waitForFunction(() => (window as any).__game?.sim.residents.size === 3);
  expect(await roles(page)).toEqual(['farmer', 'hauler', 'seller']);
});
