import { expect, test, type Page } from '@playwright/test';
import { cellToScreen, houseCentre, openGame } from './helpers';

const game = <T>(page: Page, fn: string) => page.evaluate(`(${fn})(window.__game)`) as Promise<T>;
const giveCoins = (page: Page, n: number) => page.evaluate(k => (window as any).__e2e.giveCoins(k), n);
const place = (page: Page, type: string, o: [number, number]) =>
  page.evaluate(([t, p]) => (window as any).__game.placeBuilding(t, 0, p).id as number, [type, o] as const);

test('a Lv2 house panel shows the bicycle unlocked, wagon and car greyed with their levels', async ({ page }) => {
  await openGame(page);
  const id = await place(page, 'house', [-6, -3]);
  await page.locator('#arrival-ok').click();
  await giveCoins(page, 100);
  const [cx, cz] = await houseCentre(page, id);
  const p = await cellToScreen(page, Math.floor(cx), Math.floor(cz));
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#house-vehicles .vehicle[data-vehicle=bicycle]')).toHaveClass(/locked/);
  await page.locator('#levelup').click();
  await page.clock.runFor(100);
  await expect(page.locator('#house-vehicles .vehicle[data-vehicle=bicycle]')).toHaveText('Bicycle');
  await expect(page.locator('#house-vehicles .vehicle[data-vehicle=bicycle]')).toHaveClass(/open/);
  await expect(page.locator('#house-vehicles .vehicle[data-vehicle=wagon]')).toHaveText('Wagon (Lv3)');
  await expect(page.locator('#house-vehicles .vehicle[data-vehicle=car]')).toHaveClass(/locked/);
});

test('decor comes from the build menu, costs coins and blocks its cell', async ({ page }) => {
  await openGame(page);
  const before = await game<number>(page, 's => s.sim.coins');
  await page.locator('.build-btn[data-type=scarecrow]').click();
  const p = await cellToScreen(page, 3, -5);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  expect(await game<number>(page, 's => s.sim.coins')).toBe(before - 40);
  expect(await game<number>(page, 's => [...s.sim.buildings.values()].filter(b => b.type === "scarecrow").length')).toBe(1);
  expect(await page.evaluate(() => (window as any).__game.placeBuilding('shrub', 0, [3, -5]).ok)).toBe(false);
});

test('a resident with a bicycle and a road to the field is seen riding', async ({ page }) => {
  const errors = await openGame(page);
  await giveCoins(page, 2000);
  const h = await place(page, 'house', [-14, 10]);
  await page.locator('#arrival-ok').click();
  await page.evaluate(id => (window as any).__game.apply({ type: 'levelUp', buildingId: id }), h);
  const [x, z] = await game<[number, number]>(page, 's => [...s.sim.residents.values()][0].cell');
  await page.evaluate(([cx, cz]) => {
    const g = (window as any).__game, cells = [] as number[][];
    for (let i = 0; i <= 14; i++) cells.push([cx + i, cz]);
    g.apply({ type: 'setTile', cells, kind: 'road' });
    g.placeBuilding('farmPlot', 0, [cx + 14, cz + 2]);
    g.placeBuilding('scarecrow', 0, [cx + 11, cz + 2]);
    g.placeBuilding('shrub', 0, [cx + 3, cz - 2]);
    g.placeBuilding('fence', 0, [cx + 4, cz - 2]);
  }, [x, z]);
  expect(await game<boolean>(page, 's => s.sim.buildings.get(' + h + ').level === 2')).toBe(true);
  await page.evaluate(([cx, cz]) => (window as any).__e2e.centreOnCell(cx + 6, cz), [x, z]);
  // step the sim (no rendering) until the resident is on the bicycle
  const rode = await page.evaluate(() => {
    const e = (window as any).__e2e, sim = (window as any).__game.sim, r = [...sim.residents.values()][0];
    for (let i = 0; i < 120; i++) { e.advance(0.25); if (r.vehicle) return r.vehicle as string; }
    return null;
  });
  expect(rode).toBe('bicycle');
  await page.clock.runFor(400); // a few frames: the rider and the decor are drawn
  expect(await game<string | null>(page, 's => [...s.sim.residents.values()][0].vehicle')).toBe('bicycle');
  await expect(page.locator('#residents-btn')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/m5b-vehicles.png' });
  expect(errors).toEqual([]);
});
