import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// A save from a build newer than this one. The version is clearly in the future, so the test does not track SAVE_VERSION.
const FUTURE_SAVE = { version: 999, savedAt: 123456, sim: { note: 'from a newer game' } };

/** Writes the save into IndexedDB from the demo page, which never loads or saves, so nothing can overwrite it. */
async function seed(page: Page, save: unknown) {
  await page.goto('/?demo');
  await page.waitForFunction(() => !!(window as any).__game);
  await page.evaluate(d => new Promise<void>((res, rej) => {
    const r = indexedDB.open('cozy-game', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('saves');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(d, 'village');
      tx.oncomplete = () => { r.result.close(); res(); };
      tx.onerror = () => rej(tx.error);
    };
  }), save);
}
const stored = (page: Page) => page.evaluate(() => new Promise<unknown>((res, rej) => {
  const r = indexedDB.open('cozy-game', 1);
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const g = r.result.transaction('saves').objectStore('saves').get('village');
    g.onsuccess = () => { r.result.close(); res(g.result ?? null); };
  };
}));

test('an unsupported save shows the recovery screen; export keeps it; a new village replaces it', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await seed(page, FUTURE_SAVE);
  await page.goto('/');

  await expect(page.locator('#recovery-msg')).toContainText('newer version');
  await expect(page.getByRole('button', { name: 'Export this save' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a new village' })).toBeVisible();
  await expect(page.locator('#recovery-card')).toContainText('replaces the saved one');
  expect(await page.evaluate(() => !!(window as any).__game)).toBe(false);
  for (const id of ['#export-btn', '#new-btn', '#import-btn', '#coins']) await expect(page.locator(id)).toBeHidden(); // the dead HUD is not shown
  await page.screenshot({ path: testInfo.outputPath('recovery.png') });

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export this save' }).click()]);
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(FUTURE_SAVE);
  expect(await stored(page)).toEqual(FUTURE_SAVE); // exporting and viewing the screen leave the save alone

  await page.reload(); // reload (pagehide) while the screen is up: still there, save unchanged
  await expect(page.locator('#recovery-card')).toBeVisible();
  expect(await stored(page)).toEqual(FUTURE_SAVE);

  // dismissing the confirm keeps the save
  page.once('dialog', d => { expect(d.message()).toContain('Export it first'); void d.dismiss(); });
  await page.getByRole('button', { name: 'Start a new village' }).click();
  await expect(page.locator('#recovery-card')).toBeVisible();
  expect(await stored(page)).toEqual(FUTURE_SAVE);

  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'Start a new village' }).click();
  await page.waitForFunction(() => !!(window as any).__game);
  await expect(page.locator('#recovery-card')).toHaveCount(0);
  await expect(page.locator('#day')).toHaveText('Day 1');
  expect(await stored(page)).not.toEqual(FUTURE_SAVE);
  expect(errors).toEqual([]);
});

test('a damaged save gets the damaged message', async ({ page }) => {
  await seed(page, { version: 1, savedAt: 0 }); // no `sim`: damaged whatever the version
  await page.goto('/');
  await expect(page.locator('#recovery-msg')).toContainText('damaged');
});
