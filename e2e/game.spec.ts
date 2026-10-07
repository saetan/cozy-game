import { expect, test } from '@playwright/test';
import { buildings, cellToScreen, houseCentre, openGame, pauseClock } from './helpers';

const FREE: [number, number] = [3, 3]; // on screen, unlocked, empty ground away from the starter market at (0,0)

test('loads with no console errors and shows the HUD', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('#coins')).toHaveText('80'); // starting coins: 1 house + 2 farm plots
  await expect(page.locator('#day')).toHaveText('Day 1');
  await expect(page.locator('#clock')).toHaveText(/^06:\d\d$/);
  expect(errors).toEqual([]);
});

test('build a house: ghost, rotate, blocked cell, place', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Build House' }).click();
  await expect(page.locator('#place-bar')).toBeVisible();
  await expect(page.locator('#confirm')).toBeDisabled(); // no cell chosen yet

  // blocked: hover the starter market
  const blocked = await cellToScreen(page, 0, 0);
  await page.mouse.move(blocked.x, blocked.y);
  await expect(page.locator('#place-status')).toContainText('Blocked');
  await expect(page.locator('#confirm')).toBeDisabled();

  // valid cell: ghost turns green (status + enabled Place)
  const p = await cellToScreen(page, ...FREE);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator('#place-status')).toContainText('Place to build');
  await expect(page.locator('#confirm')).toBeEnabled();

  // rotate with the R key and the button; rotation is carried into the sim
  await page.keyboard.press('r');
  await page.getByRole('button', { name: /Rotate/ }).click();
  await page.getByRole('button', { name: /Rotate/ }).click(); // 3 steps total
  await expect(page.locator('#confirm')).toBeEnabled();
  await page.getByRole('button', { name: 'Place' }).click();

  const houses = (await buildings(page)).filter(b => b.type === 'house');
  expect(houses).toHaveLength(1);
  expect(houses[0].placement.rotation).toBe(3);
  // the ghost was centred on the pointer cell: the house's cells sit around FREE
  const [cx, cz] = await houseCentre(page, 2);
  expect(Math.abs(cx - FREE[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(cz - FREE[1])).toBeLessThanOrEqual(1);
  await expect(page.locator('#coins')).toHaveText('30'); // 80 - 50
  await expect(page.locator('#place-bar')).toBeHidden();
});

test('clicking a free cell places the building (mouse)', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Build Farm plot' }).click();
  const p = await cellToScreen(page, ...FREE);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  const plots = (await buildings(page)).filter(b => b.type === 'farmPlot');
  expect(plots).toHaveLength(1);
  expect(plots[0].placement.origin).toEqual(FREE);
});

test('speed buttons change speed', async ({ page }) => {
  await openGame(page);
  const speed = () => page.evaluate(() => (window as any).__game.speed);
  expect(await speed()).toBe(1);
  for (const s of [5, 20, 1]) {
    await page.locator(`.speed-btn[data-speed="${s}"]`).click();
    expect(await speed()).toBe(s);
    await page.clock.runFor(50);
    await expect(page.locator(`.speed-btn[data-speed="${s}"]`)).toHaveClass(/active/);
  }
});

test('page.clock drives the frame loop: sim time follows fake real time and speed', async ({ page }) => {
  await openGame(page);
  await pauseClock(page); // otherwise the clock also flows in real time and the deltas below drift under load
  const t = () => page.evaluate(() => (window as any).__game.sim.t as number);
  const t0 = await t();
  await page.clock.runFor(2000);
  const t1 = await t();
  expect(t1 - t0).toBeGreaterThan(1.5); // ~2 s at 1x
  expect(t1 - t0).toBeLessThan(2.5);
  await page.locator('.speed-btn[data-speed="20"]').click();
  await page.clock.runFor(2000);
  expect((await t()) - t1).toBeGreaterThan(30); // ~40 s at 20x
});

test('?demo: two in-game days earn coins', async ({ page }, testInfo) => {
  await openGame(page, '?demo');
  // Time control: real-time play can't reach 2 days in a test. game.frame clamps dt to 0.25 s and
  // speed is 20x, i.e. 5 sim s per real s, so 2 days (2400 sim s) = 480 real s = ~30k rendered
  // SwiftShader frames, too slow even with page.clock.runFor. So the sim is advanced through the
  // test-only __e2e.advance hook (same `advance` the loop uses), then runFor drives a few real frames
  // so the renderer, HUD and screenshot reflect the new state.
  const day = () => page.evaluate(() => Math.floor((window as any).__game.sim.t / 1200));
  await page.evaluate(() => (window as any).__e2e.advance(2 * 1200));
  await page.clock.runFor(1000);
  expect(await day()).toBeGreaterThanOrEqual(2);
  const sim = await page.evaluate(() => { const s = (window as any).__game.sim; return { coins: s.coins, delivered: s.stats.delivered }; });
  expect(sim.coins).toBeGreaterThan(0);
  expect(sim.delivered).toBeGreaterThan(0);
  await expect(page.locator('#coins')).not.toHaveText('0');
  const shot = await page.screenshot({ path: testInfo.outputPath('demo-after-2-days.png') });
  await testInfo.attach('demo-after-2-days', { body: shot, contentType: 'image/png' });
});
