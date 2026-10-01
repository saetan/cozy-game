import { expect, test } from '@playwright/test';
import { buildings, cellToScreen, openGame } from './helpers';

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } });

test('touch: tap moves the ghost, Place button confirms', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Build House' }).tap();
  const a = await cellToScreen(page, 3, 3);
  await page.touchscreen.tap(a.x, a.y);
  // a tap only positions the ghost; nothing is built yet
  await expect(page.locator('#confirm')).toBeEnabled();
  expect((await buildings(page)).filter(b => b.type === 'house')).toHaveLength(0);
  const b = await cellToScreen(page, 1, 4);
  await page.touchscreen.tap(b.x, b.y);
  expect((await buildings(page)).filter(x => x.type === 'house')).toHaveLength(0);
  await page.getByRole('button', { name: 'Place' }).tap();
  const houses = (await buildings(page)).filter(x => x.type === 'house');
  expect(houses).toHaveLength(1);
  expect(Math.abs(houses[0].placement.origin[0] - 1)).toBeLessThanOrEqual(1);
  expect(Math.abs(houses[0].placement.origin[1] - 4)).toBeLessThanOrEqual(1);
});
