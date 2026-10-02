import { expect, test, type Page } from '@playwright/test';
import { cellToScreen, houseCentre, openGame, occupiedBy } from './helpers';

const HOUSE_ORIGIN: [number, number] = [-6, -3];
const game = <T>(page: Page, fn: string) => page.evaluate(`(${fn})(window.__game)`) as Promise<T>;
const e2e = (page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).__e2e[f as string](...(a as unknown[])), [fn, args] as const);

async function placeHouse(page: Page, origin = HOUSE_ORIGIN) {
  return page.evaluate(o => (window as any).__game.placeBuilding('house', 0, o).id as number, origin);
}
/** Click the house on screen (a ground cell it occupies) and wait for its panel. */
async function selectHouse(page: Page, id: number) {
  const [cx, cz] = await houseCentre(page, id);
  const p = await cellToScreen(page, Math.floor(cx), Math.floor(cz));
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#panel')).toBeVisible();
}
const dismissArrival = async (page: Page) => { await page.locator('#arrival-ok').click(); };

test('level up a house from its panel: coins spent, level 2, new pieces rendered', async ({ page }) => {
  await openGame(page);
  const id = await placeHouse(page);
  await dismissArrival(page);
  await e2e(page, 'giveCoins', 100);
  const before = await e2e(page, 'housePieceKeys', id) as string[];
  await selectHouse(page, id);
  await expect(page.locator('#panel .panel-title')).toHaveText('Lv 1 · Cottage');
  await expect(page.locator('#levelup')).toHaveText('Level up — 70 coins');
  await expect(page.locator('#levelup')).toBeEnabled();
  const coins = await game<number>(page, 's => s.sim.coins');
  await page.locator('#levelup').click();
  expect(await game<number>(page, `s => s.sim.buildings.get(${id}).level`)).toBe(2);
  expect(await game<number>(page, 's => s.sim.coins')).toBe(coins - 70);
  await page.clock.runFor(2500); // let the pop-in / shrink-out tweens finish
  await expect(page.locator('#panel .panel-title')).toHaveText('Lv 2 · Longer');
  await expect(page.locator('#toast')).toContainText('Lv 2');
  const after = await e2e(page, 'housePieceKeys', id) as string[];
  expect(after.length).toBeGreaterThan(before.length);
  expect(after).toContain('found:2,0'); // the new ground cell of Lv2
  expect(before).not.toContain('found:2,0');
  // the first four ground cells never moved
  for (const k of ['found:0,0', 'found:1,0', 'found:0,1', 'found:1,1']) expect(after).toContain(k);
});

test('blocked level-up: red cells, disabled button with the reason', async ({ page }) => {
  await openGame(page);
  const id = await placeHouse(page);
  await dismissArrival(page);
  await e2e(page, 'giveCoins', 200);
  // Lv2 grows into the two cells east of the Lv1 block; put a farm plot on one of them
  const blocker = await page.evaluate(([x, z]) => (window as any).__game.placeBuilding('farmPlot', 0, [x + 3, z + 1]).ok, HOUSE_ORIGIN);
  expect(blocker).toBe(true);
  await selectHouse(page, id);
  await expect(page.locator('#levelup')).toBeDisabled();
  await expect(page.locator('#levelup-reason')).toHaveText('Blocked: clear the red cells');
  await page.clock.runFor(100);
  expect(await e2e(page, 'countNamed', 'ghost_blocked')).toBe(1);
  expect(await e2e(page, 'countNamed', 'ghost_free')).toBe(1);
});

test('not enough coins shows the reason; max level is reported', async ({ page }) => {
  await openGame(page);
  const id = await placeHouse(page);
  await dismissArrival(page);
  await selectHouse(page, id); // 30 coins left, Lv2 costs 70
  await expect(page.locator('#levelup')).toBeDisabled();
  await expect(page.locator('#levelup-reason')).toHaveText('Not enough coins');
  await page.evaluate(() => { const g = (window as any).__game; g.sim.coins = 9999; for (let i = 1; i < 7; i++) g.apply({ type: 'levelUpHouse', houseId: 2 }); });
  await page.clock.runFor(200);
  await expect(page.locator('#levelup')).toHaveText('Max level');
  await expect(page.locator('#levelup')).toBeDisabled();
  await expect(page.locator('#levelup-reason')).toHaveText('Max level');
});

test('building a house shows the arrival card; cards queue', async ({ page }) => {
  await openGame(page);
  await e2e(page, 'giveCoins', 50);
  await page.getByRole('button', { name: 'Build House' }).click();
  const p = await cellToScreen(page, 3, 3);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  const card = page.locator('#arrival-card');
  await expect(card).toBeVisible();
  const r = await game<{ name: string; species: string }>(page, 's => { const r = s.sim.residents.get(1); return { name: r.name, species: r.species }; }');
  await expect(card).toContainText(`${r.name} the ${r.species} moved in!`);
  await expect(card).toContainText('—'); // trait name and description
  // a second arrival while the first card is open queues behind it
  await page.evaluate(() => { const g = (window as any).__game; g.sim.coins = 500; g.placeBuilding('house', 0, [-6, -3]); });
  await page.clock.runFor(100);
  await expect(card).toContainText('1 more arriving');
  await dismissArrival(page);
  await expect(card).toBeVisible();
  await dismissArrival(page);
  await expect(card).toBeHidden();
});

test('pick a resident from the Residents list and set their role', async ({ page }) => {
  await openGame(page);
  await placeHouse(page);
  await dismissArrival(page);
  await page.getByRole('button', { name: 'Residents' }).click();
  const list = page.locator('#residents-panel');
  await expect(list).toBeVisible();
  const name = await game<string>(page, 's => s.sim.residents.get(1).name');
  await expect(list.locator('.r-row')).toHaveCount(1);
  // role picker inside the list
  await list.getByRole('button', { name: 'Hauler' }).click();
  expect(await game<string | null>(page, 's => s.sim.residents.get(1).role')).toBe('hauler');
  // clicking the name selects the resident -> bottom panel with trait and role picker
  await list.getByRole('button', { name }).click();
  const panel = page.locator('#panel');
  await expect(panel.locator('.panel-title')).toHaveText(name);
  await expect(panel.locator('.trait')).toContainText('—');
  await expect(panel.getByRole('button', { name: 'Hauler' })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'Farmer' }).click();
  expect(await game<string | null>(page, 's => s.sim.residents.get(1).role')).toBe('farmer');
  await panel.getByRole('button', { name: 'Generalist' }).click();
  expect(await game<string | null>(page, 's => s.sim.residents.get(1).role')).toBeNull();
  await panel.getByRole('button', { name: 'Seller' }).click();
  expect(await game<string | null>(page, 's => s.sim.residents.get(1).role')).toBe('seller');
  await page.clock.runFor(100);
  await expect(panel.locator('.activity')).not.toBeEmpty();
});

test('dragging with the Path tool paints tiles and charges coins; Erase removes them', async ({ page }) => {
  await openGame(page);
  const camBefore = await cellToScreen(page, 3, 3);
  await page.getByRole('button', { name: /^Path/ }).click();
  await expect(page.locator('#tile-bar')).toBeVisible();
  const a = await cellToScreen(page, 3, 3), b = await cellToScreen(page, 4, 3), c = await cellToScreen(page, 5, 3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.mouse.up();
  const tiles = await game<[string, string][]>(page, 's => [...s.sim.tiles].sort()');
  expect(tiles).toEqual([['3,3', 'path'], ['4,3', 'path'], ['5,3', 'path']]);
  expect(await game<number>(page, 's => s.sim.coins')).toBe(77);
  await page.clock.runFor(100);
  await expect(page.locator('#coins')).toHaveText('77');
  // the left-drag painted instead of orbiting the camera
  expect(await cellToScreen(page, 3, 3)).toEqual(camBefore);
  // Road tool, then Erase
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /^Road/ }).click();
  await page.mouse.click(a.x, a.y);
  expect(await game<string>(page, 's => s.sim.tiles.get("3,3")')).toBe('road');
  expect(await game<number>(page, 's => s.sim.coins')).toBe(75);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Erase tile' }).click();
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(c.x, c.y, { steps: 8 }); await page.mouse.up();
  expect(await game<number>(page, 's => s.sim.tiles.size')).toBe(0);
  expect(await game<number>(page, 's => s.sim.coins')).toBe(75); // no refund
});

test('unaffordable tools are disabled and costs are shown', async ({ page }) => {
  await openGame(page);
  await expect(page.getByRole('button', { name: /Build House/ })).toContainText('50');
  await expect(page.getByRole('button', { name: /^Path/ })).toContainText('1');
  await expect(page.getByRole('button', { name: /^Road/ })).toContainText('2');
  await page.evaluate(() => { (window as any).__game.sim.coins = 10; });
  await page.clock.runFor(100);
  await expect(page.getByRole('button', { name: /Build House/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Build Farm plot/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Path/ })).toBeEnabled();
});

test('screenshot: selected house with the level-up panel and next-level ghost cells', async ({ page }, testInfo) => {
  await openGame(page);
  const id = await placeHouse(page);
  await dismissArrival(page);
  await e2e(page, 'giveCoins', 100);
  await page.clock.runFor(2500);
  await selectHouse(page, id);
  await page.clock.runFor(200);
  expect(await e2e(page, 'countNamed', 'ghost_free')).toBe(2);
  const shot = await page.screenshot({ path: testInfo.outputPath('m3-levelup.png') });
  await testInfo.attach('m3-levelup', { body: shot, contentType: 'image/png' });
  expect((await occupiedBy(page, id)).length).toBe(4);
});
