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
import { createGame, footprintOf, frameOf, SPEEDS } from './game';
import { dayOf, timeOfDay } from './sim/clock';
import { CELL } from './kit/index.js';
import { advance } from './sim/sim';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const { scene, camera, controls, setPaintMode, onFrame } = createScene(canvas);
const game = createGame({ demo: new URLSearchParams(location.search).has('demo') });
const { sim } = game;
scene.add(createChunkView(sim.world).root);
const view = createSimView(scene, sim);

const placement = createPlacementMode({
  canvas, scene, camera, world: sim.world, root: document.body, footprintOf, frameOf,
  createGhost: (t, mat) => createBuildingObject(t, mat),
  onPlace: (t, rotation, origin) => game.placeBuilding(t, rotation, origin).ok,
});
const tiles = createTileTool({ canvas, scene, camera, game, root: document.body, setPaintMode, onStart: () => selection.clear() });
const selection = createSelection({
  canvas, camera, scene, game, root: document.body,
  pick: ray => view.pick(ray), residentPosition: id => view.residentPosition(id),
  centreOn(x, z) { // slide the camera so the focus lands on (x, z), keeping the view angle
    const dx = x - controls.target.x, dz = z - controls.target.z;
    controls.target.x += dx; controls.target.z += dz; camera.position.x += dx; camera.position.z += dz;
  },
  busy: () => placement.active || tiles.active,
});
document.querySelectorAll('.build-btn').forEach(b => b.addEventListener('click', () => selection.clear()));
const notes = createNotifications(sim, document.body);
const buildMenu = createBuildMenu(sim, document.body);

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

// Test hooks: only in dev and `vite build --mode e2e`. Vite folds this condition to false in a
// normal production build, so the block (and the hook names) are dropped from dist/.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
  const w = window as unknown as Record<string, unknown>;
  w.__game = game;
  w.__e2e = {
    /** Sim-only fast-forward (no rendering), for tests that must not depend on rAF pacing. */
    advance: (simSeconds: number) => advance(sim, simSeconds),
    /** Test-only coin grant (the sim has no such command, on purpose). */
    giveCoins: (n: number) => { sim.coins += n; },
    /** Plan-piece keys currently rendered for a house. */
    housePieceKeys: (id: number) => view.housePieceKeys(id),
    /** Number of scene objects with this name (e.g. selection ghost cells). */
    countNamed(name: string) { let n = 0; scene.traverse(o => { if (o.name === name) n++; }); return n; },
    /** Projects a cell centre to page CSS pixels. */
    cellToScreen(x: number, z: number) {
      const v = new THREE.Vector3((x + 0.5) * CELL, 0, (z + 0.5) * CELL).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
  };
}
