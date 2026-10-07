import { expect, test, type Page } from '@playwright/test';
import { cellToScreen, evidencePath, openGame } from './helpers';

const game = <T>(page: Page, fn: string) => page.evaluate(`(${fn})(window.__game)`) as Promise<T>;
const giveCoins = (page: Page, n: number) => page.evaluate(k => (window as any).__e2e.giveCoins(k), n);
const place = (page: Page, type: string, o: [number, number]) =>
  page.evaluate(([t, p]) => (window as any).__game.placeBuilding(t, 0, p).id as number, [type, o] as const);
const click = async (page: Page, x: number, z: number) => { const p = await cellToScreen(page, x, z); await page.mouse.click(p.x, p.y); };

test('unlock a crop from a plot panel and set it on the plot', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  const plot = await place(page, 'farmPlot', [0, 6]);
  await page.clock.runFor(200); // a frame so the plot is drawn
  await giveCoins(page, 500);
  await click(page, 0, 6);
  await expect(page.locator('#panel .panel-title')).toHaveText('Farm plot');
  const cabbage = page.locator('.crop-btn[data-crop=cabbage]'), pumpkin = page.locator('.crop-btn[data-crop=pumpkin]');
  await expect(cabbage).toContainText('Unlock · 100');
  await expect(pumpkin).toBeDisabled(); // 1000 coins needed
  const coins = await game<number>(page, 's => s.sim.coins');
  await cabbage.click();
  await expect(cabbage).not.toContainText('Unlock');
  expect(await game<number>(page, 's => s.sim.coins')).toBe(coins - 100);
  await cabbage.click();
  await expect(cabbage).toHaveAttribute('aria-pressed', 'true');
  expect(await game<string>(page, `s => s.sim.buildings.get(${plot}).crop`)).toBe('cabbage');
  await page.clock.runFor(100);
  await page.screenshot({ path: evidencePath(testInfo, 'm5a-progression.png') });
  expect(errors).toEqual([]);
});

test('level up the market from its panel: two stalls render', async ({ page }) => {
  await openGame(page);
  const mk = await game<number>(page, 's => [...s.sim.buildings.values()].find(b => b.type === "market").id');
  expect(await page.evaluate(id => (window as any).__e2e.countNamed('marketStall'), mk)).toBe(1);
  await giveCoins(page, 400);
  await click(page, 0, 0);
  await expect(page.locator('#panel .panel-sub')).toHaveText('Market');
  await expect(page.locator('#levelup')).toHaveText('Level up — 300 coins');
  await page.locator('#levelup').click();
  expect(await game<number>(page, `s => s.sim.buildings.get(${mk}).level`)).toBe(2);
  await page.clock.runFor(1500);
  expect(await page.evaluate(() => (window as any).__e2e.countNamed('marketStall'))).toBe(2);
  await expect(page.locator('#panel .panel-title')).toHaveText('Lv 2 · 2 stalls');
});

const goTo = async (page: Page, x: number, z: number) => {
  await page.evaluate(([cx, cz]) => (window as any).__e2e.centreOnCell(cx, cz), [x, z]);
  await page.clock.runFor(200);
};

test('buy an adjacent chunk from the meadow panel and build on it', async ({ page }) => {
  await openGame(page);
  await giveCoins(page, 400);
  await goTo(page, 34, 0);
  await click(page, 34, 0); // chunk (2, 0) touches the village's east edge
  await expect(page.locator('#panel .panel-title')).toHaveText('Meadow');
  await expect(page.locator('#buy-land')).toHaveText('Buy this land · 300 coins');
  await page.locator('#buy-land').click();
  expect(await game<number>(page, 's => s.sim.coins')).toBe(80 + 400 - 300);
  expect(await game<boolean>(page, 's => s.sim.world.unlocked.has("2,0")')).toBe(true);
  await giveCoins(page, 100);
  expect(await page.evaluate(() => (window as any).__game.placeBuilding('farmPlot', 0, [34, 0]).ok)).toBe(true);
});

test('a chunk that does not touch your land is refused', async ({ page }) => {
  await openGame(page);
  await giveCoins(page, 1000);
  await goTo(page, 50, 0);
  await click(page, 50, 0); // chunk (3, 0): one chunk beyond the village edge
  await expect(page.locator('#panel .panel-title')).toHaveText('Meadow');
  await expect(page.locator('#land-reason')).toHaveText('Must touch your land');
  await expect(page.locator('#buy-land')).toBeDisabled();
  expect(await game<number>(page, 's => s.sim.chunksBought')).toBe(0);
  expect(await game<number>(page, 's => s.sim.coins')).toBe(80 + 1000);
});
