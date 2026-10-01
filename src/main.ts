// Game entry: wires the sim (src/game.ts) to the renderer, placement UI and HUD.
import * as THREE from 'three';
import { createScene } from './render/scene';
import { createChunkView } from './render/chunkView';
import { setHousePose, stepTweens } from './render/houseView';
import { createBuildingObject } from './render/buildingView';
import { createSimView } from './render/simView';
import { createPlacementMode } from './ui/placementMode';
import { createGame, footprintOf, SPEEDS } from './game';
import { dayOf, timeOfDay } from './sim/clock';
import { CELL } from './kit/index.js';
import { advance } from './sim/sim';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const { scene, camera, onFrame } = createScene(canvas);
const game = createGame({ demo: new URLSearchParams(location.search).has('demo') });
const { sim } = game;
scene.add(createChunkView(sim.world).root);
const view = createSimView(scene, sim);

createPlacementMode({
  canvas, scene, camera, world: sim.world, root: document.body, footprintOf,
  createGhost: (t, mat) => createBuildingObject(t, mat),
  onPlace: (t, rotation, origin) => game.placeBuilding(t, rotation, origin).ok,
});

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
});

// Test hooks: only in dev and `vite build --mode e2e`. Vite folds this condition to false in a
// normal production build, so the block (and the hook names) are dropped from dist/.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
  const w = window as unknown as Record<string, unknown>;
  w.__game = game;
  w.__e2e = {
    /** Sim-only fast-forward (no rendering), for tests that must not depend on rAF pacing. */
    advance: (simSeconds: number) => advance(sim, simSeconds),
    /** Projects a cell centre to page CSS pixels. */
    cellToScreen(x: number, z: number) {
      const v = new THREE.Vector3((x + 0.5) * CELL, 0, (z + 0.5) * CELL).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
  };
}
