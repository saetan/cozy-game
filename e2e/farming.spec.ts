import { expect, test, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { openGame, pauseClock } from './helpers';

// Proof is scene-graph assertions at exact sim moments (runUntil steps the sim event by event, then redraws once).
// Screenshots and the video are evidence only.
const PLOT_AT: [number, number] = [0, 4];
const e2e = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as any).__e2e[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const until = (page: Page, pred: string) => page.evaluate(`window.__e2e.runUntil(${pred})`) as Promise<number>;
const plotView = (page: Page, id: number) => e2e<{ thirsty: boolean; marker: boolean; stage: number | null; crop: string | null }>(page, 'plotView', id);
const resView = (page: Page, id: number) => e2e<{ action: string; props: string[]; fxVisible: number }>(page, 'residentView', id);

const R = '(s => [...s.residents.values()][0])';
const onPlant = `s => { const r = ${R}(s); return !!r.task && r.task.action === 'work' && s.jobs.get(r.jobId)?.kind === 'plant'; }`;
const onWater = `s => { const r = ${R}(s); return !!r.task && r.task.action === 'water'; }`;
const plotIs = (id: number, st: string) => `s => s.buildings.get(${id}).plotState === '${st}'`;

/** A house with one resident and a plot next to the market. */
async function village(page: Page) {
  const errors = await openGame(page);
  await e2e(page, 'giveCoins', 500);
  const ids = await page.evaluate(([x, z]) => {
    const g = (window as any).__game;
    const h = g.placeBuilding('house', 0, [-6, -3]).id, p = g.placeBuilding('farmPlot', 0, [x, z]).id;
    return { h, p, r: [...g.sim.residents.values()][0].id as number };
  }, PLOT_AT);
  await page.locator('#arrival-ok').click();
  await page.clock.runFor(100);
  await pauseClock(page);
  return { errors, plot: ids.p, res: ids.r };
}

test('a thirsty plot shows dry soil, wilted crops and the drop until it is watered', async ({ page }) => {
  const { errors, plot } = await village(page);
  expect(await plotView(page, plot)).toMatchObject({ thirsty: false, marker: false, stage: null });
  await until(page, plotIs(plot, 'thirsty'));
  expect(await plotView(page, plot)).toMatchObject({ thirsty: true, marker: true, stage: 1 });
  await until(page, plotIs(plot, 'watered'));
  expect(await plotView(page, plot)).toMatchObject({ thirsty: false, marker: false, stage: 1 });
  expect(errors).toEqual([]);
});

test('planting is sow with the pouch, then hoe with the hoe, then a sprout', async ({ page }) => {
  const { errors, plot, res } = await village(page);
  await until(page, onPlant);
  await page.clock.runFor(50);
  expect(await resView(page, res)).toMatchObject({ action: 'sow', props: ['seedPouch'] });
  // jump into the second half of the task
  await page.evaluate(() => {
    const e = (window as any).__e2e, s = (window as any).__game.sim, t = [...s.residents.values()][0].task;
    e.advance((t.start + t.end) / 2 - s.t + 0.2);
  });
  await page.clock.runFor(50);
  expect(await resView(page, res)).toMatchObject({ action: 'hoe', props: ['hoe_grip'] });
  await until(page, plotIs(plot, 'growing'));
  expect(await plotView(page, plot)).toMatchObject({ thirsty: false, marker: false, stage: 0 });
  expect(errors).toEqual([]);
});

test('watering uses the can and pours droplets', async ({ page }) => {
  const { errors, res } = await village(page);
  await until(page, onWater);
  await page.clock.runFor(300);
  const v = await resView(page, res);
  expect(v).toMatchObject({ action: 'water', props: ['wateringCan'] });
  expect(v.fxVisible).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('at 20x a full plant, water, harvest cycle leaves no stray particles or errors', async ({ page }) => {
  test.setTimeout(240_000);
  const { errors, res } = await village(page);
  await page.evaluate(() => (window as any).__game.setSpeed(20));
  const seen = new Set<string>();
  let crates = false;
  for (let i = 0; i < 1500 && !crates; i++) {
    // idle stretches (growing crops) are skipped by sim time; every task is run through rendered frames
    await until(page, `s => { const r = ${R}(s); return !!r.task && r.task.action !== 'stand'; }`);
    await page.clock.runFor(50);
    const s = await page.evaluate(() => {
      const g = (window as any).__game.sim, r = [...g.residents.values()][0];
      return { act: r.task?.action ?? 'stand', crates: [...g.buildings.values()].some((b: any) => b.crates > 0) };
    });
    const v = await resView(page, res);
    seen.add(v.action);
    if (!['work', 'water'].includes(s.act)) expect(v.fxVisible, `fx while ${s.act}`).toBe(0);
    crates = s.crates;
  }
  expect(crates).toBe(true);
  expect(seen).toContain('water');
  expect([...seen].some(a => a === 'sow' || a === 'hoe')).toBe(true);
  expect(errors).toEqual([]);
});

test('evidence: close-up screenshots and a short video of sow, hoe and water', async ({ browser }) => {
  test.setTimeout(240_000);
  const dir = 'test-results/farming-video';
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, recordVideo: { dir, size: { width: 800, height: 500 } } });
  const page = await ctx.newPage();
  const { errors, res } = await village(page);
  mkdirSync('docs/screenshots', { recursive: true });
  const shot = (name: string) => page.screenshot({ path: `docs/screenshots/farming-${name}.png` });
  const frames = async (ms: number) => { for (let i = 0; i < ms / 100; i++) { await page.clock.runFor(100); await page.waitForTimeout(40); } };
  await page.evaluate(() => { document.getElementById('hud')!.style.display = 'none'; }); // clean evidence frames
  await page.evaluate(([x, z]) => (window as any).__game.placeBuilding('farmPlot', 0, [x + 3, z]), PLOT_AT);
  const look = () => e2e(page, 'closeUp', PLOT_AT[0] + 0.5, PLOT_AT[1] + 0.3, 6);
  await until(page, onPlant);
  await look();
  await frames(800);
  expect((await resView(page, res)).action).toBe('sow');
  await shot('sow');
  await page.evaluate(() => {
    const e = (window as any).__e2e, s = (window as any).__game.sim, t = [...s.residents.values()][0].task;
    e.advance((t.start + t.end) / 2 - s.t + 0.2);
  });
  await frames(700);
  expect((await resView(page, res)).action).toBe('hoe');
  await shot('hoe');
  await until(page, onWater);
  await look();
  await frames(1200);
  expect((await resView(page, res)).action).toBe('water');
  await shot('water');
  // one plot watered, the other still thirsty
  await until(page, `s => { const p = [...s.buildings.values()].filter(b => b.type === 'farmPlot').map(b => b.plotState); return p.includes('watered') && p.includes('thirsty'); }`);
  await e2e(page, 'closeUp', PLOT_AT[0] + 2, PLOT_AT[1] + 0.5, 11);
  await frames(500);
  await shot('thirsty');
  await ctx.close();
  const video = readdirSync(dir).find(f => f.endsWith('.webm'));
  expect(video).toBeTruthy();
  copyFileSync(`${dir}/${video}`, 'docs/screenshots/farming.webm');
  expect(errors).toEqual([]);
});
