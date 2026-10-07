import { expect, test, type Page } from '@playwright/test';
import { cellToScreen, evidencePath, openGame, pauseClock } from './helpers';

// Road proof is scene inspection: `__e2e.roadKeys()` returns the kit item keys the view has put in the scene
// (road:<i,j>:<type>:<N E S W signature + dropped-kerb cuts>, lane:<x,z>:<type>:<sig>, laneMouth:..., path:...).
const e2e = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as any).__e2e[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const game = <T>(page: Page, fn: string) => page.evaluate(`(${fn})(window.__game)`) as Promise<T>;
const keys = (page: Page) => e2e<string[]>(page, 'roadKeys');
const coins = (page: Page) => game<number>(page, 's => s.sim.coins');
const status = (page: Page) => page.locator('#tile-status');
const tool = (page: Page, name: RegExp) => page.getByRole('button', { name }).click();
const done = (page: Page) => page.getByRole('button', { name: 'Done' }).click();
/** Centre cell of street tile (i, j). */
const tc = (i: number, j: number): [number, number] => [3 * i + 1, 3 * j + 1];

async function start(page: Page, at: [number, number], distance = 40) {
  await openGame(page);
  await pauseClock(page);
  await e2e(page, 'giveCoins', 1000);
  await e2e(page, 'closeUp', at[0], at[1], distance);
  await page.clock.runFor(100);
}
const click = async (page: Page, c: [number, number]) => { const p = await cellToScreen(page, c[0], c[1]); await page.mouse.click(p.x, p.y); await page.clock.runFor(100); };
async function drag(page: Page, a: [number, number], b: [number, number]) {
  const p = await cellToScreen(page, a[0], a[1]), q = await cellToScreen(page, b[0], b[1]);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 12 }); await page.mouse.up();
  await page.clock.runFor(100);
}
const roadKeys = async (page: Page) => (await keys(page)).filter(k => k.startsWith('road:'));

test('a street, then a perpendicular one, makes a T-junction', async ({ page }) => {
  await start(page, [4, -9]);
  const c0 = await coins(page);
  await tool(page, /^Street/);
  await drag(page, tc(0, -4), tc(2, -4));
  expect(await roadKeys(page)).toEqual(['road:0,-4:road:-r--', 'road:1,-4:road:-r-r', 'road:2,-4:road:---r']);
  expect(await coins(page)).toBe(c0 - 3 * 18);
  await click(page, tc(1, -3)); // the perpendicular one, below the middle tile
  expect(await roadKeys(page)).toEqual(['road:0,-4:road:-r--', 'road:1,-3:road:r---', 'road:1,-4:road:-rrr', 'road:2,-4:road:---r']);
  expect(await coins(page)).toBe(c0 - 4 * 18);
  expect(await game<number>(page, 's => s.sim.streets.size')).toBe(4);
});

test('a dirt lane joins a street on a flat edge: lane mouth and dropped kerb; a lane at a junction arm is refused', async ({ page }) => {
  await start(page, [4, -9]);
  await game(page, 's => s.apply({ type: "setStreet", tiles: [[0,-4],[1,-4],[2,-4]], kind: "road" })');
  await page.clock.runFor(100);
  const c0 = await coins(page);
  await tool(page, /^Dirt lane/);
  await click(page, [4, -9]); // the flat south edge of the middle tile
  expect(await coins(page)).toBe(c0 - 1);
  const k = await keys(page);
  expect(k).toContain('lane:4,-9:dirt:s---');
  expect(k).toContain('laneMouth:4,-9:N');
  expect(k).toContain('road:1,-4:road:-r-rS1'); // the street dropped its kerb at the lane (cut on side S, segment 1)
  // the stem of a T is a junction arm: lanes cannot start on it, and the reason is shown
  await done(page);
  await game(page, 's => s.apply({ type: "setStreet", tiles: [[1,-5]], kind: "road" })');
  await page.clock.runFor(100);
  await tool(page, /^Lane/);
  await click(page, [4, -14]);
  await expect(status(page)).toContainText('part of a street');
  expect(await coins(page)).toBe(c0 - 1 - 18);
  // and a street edit that would turn an existing join invalid is refused with its reason
  await done(page);
  await game(page, 's => s.apply({ type: "setTile", cells: [[7, -9]], kind: "dirtLane" })'); // joins tile (2,-4) on its flat south edge
  await tool(page, /^Street/);
  await click(page, tc(2, -5)); // would turn (2,-4) into a bend: its south side becomes an outer corner
  await expect(status(page)).toContainText('outer corner of a street bend');
  await expect(status(page)).toHaveClass(/refused/); // shown in red, so it isn't missed
  expect(await game<number>(page, 's => s.sim.streets.size')).toBe(4);
});

test('a lane on the outer corner of a bend is refused and the reason is shown', async ({ page }) => {
  await start(page, [4, -9]);
  await game(page, 's => s.apply({ type: "setStreet", tiles: [[1,-4],[2,-4],[1,-3]], kind: "road" })'); // tile (1,-4) bends east/south
  await page.clock.runFor(100);
  const c0 = await coins(page);
  await tool(page, /^Lane/);
  await click(page, [2, -11]); // west of the bend: its outer side
  await expect(status(page)).toContainText('outer corner of a street bend');
  expect(await coins(page)).toBe(c0);
  expect((await keys(page)).filter(k => k.startsWith('lane:'))).toEqual([]);
  await click(page, [4, -13]); // north of the bend: also outer
  await expect(status(page)).toContainText('outer corner');
  expect(await game<number>(page, 's => s.sim.tiles.size')).toBe(0);
});

test('a dirt road joins a street', async ({ page }) => {
  await start(page, [6, -9]);
  await tool(page, /^Street/); await click(page, tc(0, -4)); await done(page);
  await tool(page, /^Dirt road/); await click(page, tc(1, -4));
  expect(await roadKeys(page)).toEqual(['road:0,-4:road:-d--', 'road:1,-4:dirt:---r']);
  expect(await coins(page)).toBe(1080 - 18 - 9);
});

test('a dirt lane and a dirt road join, whichever is laid first; a dirt spur bridges the road\'s grass margin', async ({ page }) => {
  await start(page, [7, -9]);
  await tool(page, /^Dirt lane/); await drag(page, [4, -16], [4, -13]); await done(page); // runs south to the tile edge
  await tool(page, /^Dirt road/); await drag(page, tc(0, -4), tc(2, -4));                  // the lane meets tile (1,-4) on its flat north side
  await expect(status(page)).not.toHaveClass(/refused/);
  expect(await game<number>(page, 's => s.sim.streets.size')).toBe(3);
  expect((await keys(page)).filter(k => k.startsWith('dirtSpur:'))).toEqual(['dirtSpur:4,-13:S']);
  await done(page);
  await tool(page, /^Dirt lane/); await drag(page, [7, -9], [7, -6]); // dirt road first, then a lane up to the south side of tile (2,-4)
  expect((await keys(page)).filter(k => k.startsWith('dirtSpur:'))).toEqual(['dirtSpur:4,-13:S', 'dirtSpur:7,-9:N']);
});

test('a path auto-connects to its neighbours', async ({ page }) => {
  await start(page, [4, 4], 30);
  const c0 = await coins(page);
  await tool(page, /^Path/);
  await drag(page, [3, 3], [4, 3]);
  expect((await keys(page)).filter(k => k.startsWith('path:'))).toEqual(['path:3,3:-E--', 'path:4,3:---W']);
  await click(page, [4, 4]);
  expect((await keys(page)).filter(k => k.startsWith('path:'))).toEqual(['path:3,3:-E--', 'path:4,3:--SW', 'path:4,4:N---']);
  expect(await coins(page)).toBe(c0 - 3);
});

test('erase removes a whole 6 m tile from any of its cells; other cells lose just their lane or path', async ({ page }) => {
  await start(page, [4, -9]);
  await tool(page, /^Street/); await click(page, tc(1, -4)); await done(page);
  await tool(page, /^Path/); await click(page, [8, -9]); await done(page);
  expect((await keys(page)).length).toBe(2);
  const c0 = await coins(page);
  await tool(page, /^Erase/);
  await click(page, [5, -10]); // a corner cell of the tile, not its centre
  expect(await roadKeys(page)).toEqual([]);
  expect(await game<number>(page, 's => s.sim.streets.size')).toBe(0);
  await click(page, [8, -9]);
  expect(await keys(page)).toEqual([]);
  expect(await coins(page)).toBe(c0); // no refund
});

test('editing the network only rebuilds the changed pieces (diff by key)', async ({ page }) => {
  await start(page, [4, -9]);
  await tool(page, /^Street/); await drag(page, tc(0, -4), tc(2, -4));
  const before = await roadKeys(page);
  await click(page, tc(3, -4));
  const after = await roadKeys(page);
  expect(after.filter(k => !before.includes(k)).sort()).toEqual(['road:2,-4:road:-r-r', 'road:3,-4:road:---r']);
  expect(after.filter(k => before.includes(k)).sort()).toEqual(['road:0,-4:road:-r--', 'road:1,-4:road:-r-r']);
});

test('screenshot: option C village with a street T-junction, a dirt lane to the farm joining at a mouth, and a garden path', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await pauseClock(page);
  await e2e(page, 'giveCoins', 1000);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.apply({ type: 'setStreet', tiles: [[3, -1], [4, -1], [5, -1], [4, 0]], kind: 'road' }); // T-junction, stem south
    const lane: number[][] = []; // dirt lane from the street's flat north edge out to the farm
    for (let z = -4; z >= -8; z--) lane.push([10, z]);
    for (let x = 11; x <= 16; x++) lane.push([x, -8]);
    g.apply({ type: 'setTile', cells: lane, kind: 'dirtLane' });
    for (const x of [11, 12, 13, 14]) { g.placeBuilding('farmPlot', 0, [x, -9]); g.placeBuilding('farmPlot', 0, [x, -7]); } // a row on each side of the lane
    g.placeBuilding('house', 0, [17, 1]);
    g.apply({ type: 'setTile', cells: [[16, 1], [16, 2], [16, 3], [15, 3]], kind: 'path' }); // garden path from the house toward the street
    g.placeBuilding('shrub', 0, [18, -4]);
  });
  await e2e(page, 'closeUp', 14, -7, 52);
  await page.clock.runFor(2500);
  const k = await keys(page);
  expect(k.filter(x => x.startsWith('road:')).length).toBe(4);
  expect(k).toContain('road:4,-1:road:-rrr');
  expect(k.some(x => x.startsWith('laneMouth:10,-4:'))).toBe(true);
  expect(k.some(x => x.startsWith('path:'))).toBe(true);
  await page.locator('#arrival-ok').click({ timeout: 2000 }).catch(() => {});
  await page.clock.runFor(300);
  await page.screenshot({ path: evidencePath(testInfo, 'roads-option-c.png') });
  expect(errors).toEqual([]);
});
