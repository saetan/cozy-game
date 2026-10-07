// Game entry: wires the sim (src/game.ts) to the renderer, placement UI and HUD.
import * as THREE from 'three';
import { createScene } from './render/scene';
import { createChunkView } from './render/chunkView';
import { setHousePose, stepTweens } from './render/houseView';
import { createBuildingObject } from './render/buildingView';
import { createSimView } from './render/simView';
import { createPlacementMode } from './ui/placementMode';
import { createTileTool } from './ui/tileTool';
import { createSelection } from './ui/selection';
import { createNotifications } from './ui/notifications';
import { createBuildMenu } from './ui/buildMenu';
import { createGame, footprintOf, frameOf, loadGame, saveGame, SPEEDS } from './game';
import { createIdbStore, serialize } from './systems/save';
import { catchUp } from './systems/catchup';
import { showAway, shouldShowAway } from './ui/away';
import { createSaveMenu } from './ui/saveMenu';
import { showRecovery } from './ui/recovery';
import { dayOf, timeOfDay } from './sim/clock';
import { CELL } from './kit/index.js';
import { advance } from './sim/sim';
import { peekEvent } from './sim/events';
import { setTrafficConfig, type TrafficOverride } from './sim/traffic';
import { streetAt } from './sim/surfaces';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const { scene, camera, controls, setPaintMode, onFrame } = createScene(canvas);
const demo = new URLSearchParams(location.search).has('demo'); // demo: always fresh, never loads or saves
const store = createIdbStore();
const loaded = demo ? { ok: true as const, game: createGame({ demo }), away: null } : await loadGame(store, Date.now());
if (!loaded.ok) { // an unreadable save: stop here, so nothing (autosave included) touches it until the player chooses
  showRecovery(document.body, loaded, store);
  await new Promise<never>(() => {}); // never settles
  throw new Error('unreachable'); // narrows `loaded` below
}
const { game, away } = loaded;
const { sim } = game;
const chunks = createChunkView(sim.world);
scene.add(chunks.root);
const view = createSimView(scene, sim);

const placement = createPlacementMode({
  canvas, scene, camera, world: sim.world, root: document.body, footprintOf, frameOf, isBlocked: (x, z) => !!streetAt(sim, x, z),
  createGhost: (t, mat) => createBuildingObject(t, mat),
  onPlace: (t, rotation, origin) => game.placeBuilding(t, rotation, origin).ok,
});
const tiles = createTileTool({ canvas, scene, camera, game, root: document.body, setPaintMode, onStart: () => selection.clear() });
function centreOn(x: number, z: number) { // slide the camera so the focus lands on (x, z), keeping the view angle
  const dx = x - controls.target.x, dz = z - controls.target.z;
  controls.target.x += dx; controls.target.z += dz; camera.position.x += dx; camera.position.z += dz;
}
const selection = createSelection({
  canvas, camera, scene, game, root: document.body,
  pick: ray => view.pick(ray), onLandBought: () => chunks.sync(), residentPosition: id => view.residentPosition(id),
  centreOn,
  busy: () => placement.active || tiles.active,
});
document.querySelectorAll('.build-btn').forEach(b => b.addEventListener('click', () => selection.clear()));
const notes = createNotifications(sim, document.body);
const buildMenu = createBuildMenu(sim, document.body);
if (away && shouldShowAway(away)) showAway(document.body, away, sim);

// Persistence: every 30 s, when the tab is hidden and on pagehide. A hidden tab gets no frames, so the sim is
// frozen at hiddenAt: saves made while hidden are stamped with it, and on return the gap is caught up like a closed tab.
let saving = !demo, hiddenAt: number | null = null;
const save = () => { if (saving) saveGame(game, store, hiddenAt ?? Date.now()).catch(() => {}); };
if (!demo) {
  setInterval(save, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt ??= Date.now(); save(); return; }
    if (hiddenAt === null) return;
    const back = catchUp(sim, hiddenAt, Date.now());
    hiddenAt = null;
    notes.skipSeen(); // the summary lists these arrivals; no cards on top of it
    if (shouldShowAway(back)) showAway(document.body, back, sim);
  });
  addEventListener('pagehide', save);
  createSaveMenu({ root: document.body, store, snapshot: () => serialize(sim, Date.now(), game.speed), say: notes.say, stopSaving: () => { saving = false; } });
} else for (const id of ['export-btn', 'import-btn', 'new-btn']) document.getElementById(id)!.hidden = true;

// HUD
const coinsEl = document.getElementById('coins')!, dayEl = document.getElementById('day')!, clockEl = document.getElementById('clock')!;
const speedBtns = [...document.querySelectorAll<HTMLButtonElement>('.speed-btn')];
for (const b of speedBtns) b.addEventListener('click', () => game.setSpeed(Number(b.dataset.speed) as typeof SPEEDS[number]));
const pad = (n: number) => String(n).padStart(2, '0');
let hudKey = '';
function updateHud() {
  const mins = Math.floor(timeOfDay(sim.t) * 24 * 60);
  const key = `${sim.coins}|${dayOf(sim.t)}|${mins}|${game.speed}`;
  if (key === hudKey) return;
  hudKey = key;
  coinsEl.textContent = String(sim.coins);
  dayEl.textContent = `Day ${dayOf(sim.t) + 1}`;
  clockEl.textContent = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  for (const b of speedBtns) b.classList.toggle('active', Number(b.dataset.speed) === game.speed);
}

let last: number | null = null;
onFrame(t => {
  game.frame(last === null ? 0 : t - last);
  last = t;
  view.sync(t);
  stepTweens(t);
  updateHud();
  buildMenu.update();
  notes.update();
  selection.update();
});

// Dev-only cheat for playtesting: dropped from every build (dev server only, not e2e or production).
if (import.meta.env.DEV) {
  const add = document.createElement('button');
  add.id = 'dev-coins'; add.textContent = '+1000 coins'; add.title = 'Dev only: add 1000 coins';
  add.addEventListener('click', () => { sim.coins += 1000; });
  document.getElementById('stats')!.append(add);
}

// Test hooks: only in dev and `vite build --mode e2e`. Vite folds this condition to false in a
// normal production build, so the block (and the hook names) are dropped from dist/.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
  const w = window as unknown as Record<string, unknown>;
  w.__game = game;
  w.__e2e = {
    /** Sim-only fast-forward (no rendering), for tests that must not depend on rAF pacing. */
    advance: (simSeconds: number) => advance(sim, simSeconds),
    /** Writes the save now and resolves when stored. */
    saveNow: () => saveGame(game, store, hiddenAt ?? Date.now()),
    /** savedAt of the stored save (null if none). */
    savedAt: async () => (await store.load())?.savedAt ?? null,
    /** Rewrites the stored savedAt to `ms` earlier (simulates time away). */
    async backdateSave(ms: number) { const d = await store.load(); if (d) { d.savedAt -= ms; await store.save(d); } },
    /** Overrides lane traffic rules (merged over balance.json); null restores the defaults. */
    setTraffic: (o: TrafficOverride | null) => setTrafficConfig(o),
    /** Test-only coin grant (the sim has no such command, on purpose). */
    giveCoins: (n: number) => { sim.coins += n; },
    /** Keys of the road pieces currently rendered (streets, lanes, lane mouths, paths), sorted. */
    roadKeys: () => view.roadPieces(),
    /** Plan-piece keys currently rendered for a house. */
    housePieceKeys: (id: number) => view.housePieceKeys(id),
    /** Number of scene objects with this name (e.g. selection ghost cells). */
    countNamed(name: string) { let n = 0; scene.traverse(o => { if (o.name === name) n++; }); return n; },
    /** Steps the sim event by event until pred(sim) holds (checked before the first step too), then redraws once. Returns the sim time. */
    runUntil(pred: (s: typeof sim) => boolean, maxSimSeconds = 3 * 1200) {
      const limit = sim.t + maxSimSeconds;
      while (!pred(sim)) {
        const e = peekEvent(sim.queue);
        if (!e || e.time > limit) throw new Error(`runUntil: timed out after ${maxSimSeconds} sim seconds`);
        advance(sim, Math.max(0, e.time - sim.t));
      }
      view.sync(performance.now() / 1000);
      return sim.t;
    },
    /** What the scene draws for a plot: { thirsty, marker, stage, crop }. */
    plotView: (id: number) => view.plotView(id),
    /** A resident's kit action, hand props and visible particle meshes. */
    residentView: (id: number) => view.residentView(id),
    /** Moves the camera to `distance` metres from a cell, keeping the view angle. */
    closeUp(x: number, z: number, distance: number) {
      centreOn((x + 0.5) * CELL, (z + 0.5) * CELL);
      const d = camera.position.clone().sub(controls.target).normalize().multiplyScalar(distance);
      camera.position.copy(controls.target).add(d);
      controls.update();
    },
    /** Slides the camera focus to a cell. */
    centreOnCell: (x: number, z: number) => centreOn((x + 0.5) * CELL, (z + 0.5) * CELL),
    /** Projects a cell centre to page CSS pixels. */
    cellToScreen(x: number, z: number) {
      const v = new THREE.Vector3((x + 0.5) * CELL, 0, (z + 0.5) * CELL).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
  };
}
