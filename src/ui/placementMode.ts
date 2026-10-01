// Placement mode: ghost preview snapped to cells, tinted by validity; rotate / confirm / cancel
// via keyboard AND on-screen buttons. Mouse click confirms; on touch a tap moves the ghost and the
// Place button confirms (no hover-only info anywhere).
import * as THREE from 'three';
import { CELL, M } from '../kit/index.js';
import { canPlace, rotateFootprint, type Footprint, type Rotation } from '../systems/placement';
import type { World } from '../sim/world';
import { setHousePose } from '../render/houseView';
import type { BuildingType } from '../sim/state';

const OK = '#7fd48a', BAD = '#e5766f';

export interface PlacementDeps {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.Camera;
  world: World;
  footprintOf: (t: BuildingType) => Footprint;
  createGhost: (t: BuildingType, mat: THREE.Material) => THREE.Object3D;
  /** Sends the command to the sim; returns true when it was accepted. */
  onPlace: (t: BuildingType, rotation: Rotation, origin: [number, number]) => boolean;
  root: HTMLElement; // contains .build-btn[data-type], #build-menu, #place-bar, #rotate, #confirm, #cancel
}

export function createPlacementMode(d: PlacementDeps) {
  const ghostMat = M('ghost', OK, 0.9) as THREE.MeshStandardMaterial;
  ghostMat.transparent = true; ghostMat.opacity = 0.6; ghostMat.depthWrite = false;
  const ghosts = new Map<BuildingType, THREE.Object3D>();
  let type: BuildingType = 'house';
  const ghostFor = (t: BuildingType) => {
    let g = ghosts.get(t);
    if (!g) { g = d.createGhost(t, ghostMat); g.visible = false; d.scene.add(g); ghosts.set(t, g); }
    return g;
  };

  const q = (id: string) => d.root.querySelector<HTMLElement>(id)!;
  const bar = q('#place-bar'), menu = q('#build-menu'), status = q('#place-status');
  let active = false, rotation: Rotation = 0, cell: [number, number] = [0, 0], valid = false, hasCell = false;

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function pickCell(e: PointerEvent): [number, number] | null {
    const r = d.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, d.camera);
    const p = ray.ray.intersectPlane(ground, new THREE.Vector3());
    return p ? [Math.floor(p.x / CELL), Math.floor(p.z / CELL)] : null;
  }

  function refresh() {
    for (const [t, g] of ghosts) if (t !== type || !active || !hasCell) g.visible = false;
    if (!active || !hasCell) return;
    const ghost = ghostFor(type), footprint = d.footprintOf(type);
    // anchor so the pointer cell sits near the centre of the rotated footprint
    const cells = rotateFootprint(footprint, rotation);
    const w = Math.max(...cells.map(c => c[0])) + 1, h = Math.max(...cells.map(c => c[1])) + 1;
    const ox = cell[0] - Math.floor(w / 2), oz = cell[1] - Math.floor(h / 2);
    anchor = [ox, oz];
    valid = canPlace(d.world, footprint, rotation, ox, oz);
    ghostMat.color.set(valid ? OK : BAD);
    setHousePose(ghost, footprint, rotation, ox, oz);
    ghost.visible = true;
    status.textContent = valid ? 'Tap Place to build here' : 'Blocked: cells are locked or occupied';
    (q('#confirm') as HTMLButtonElement).disabled = !valid;
  }
  let anchor: [number, number] = [0, 0];

  function setActive(on: boolean, t: BuildingType = type) {
    active = on; hasCell = false; rotation = 0; type = t;
    bar.hidden = !on; menu.hidden = on;
    if (on) { status.textContent = `Move over the ground to position the ${t === 'farmPlot' ? 'farm plot' : t}`; (q('#confirm') as HTMLButtonElement).disabled = true; }
    refresh();
  }
  const rotate = () => { rotation = ((rotation + 1) % 4) as Rotation; refresh(); };
  function confirm(): boolean {
    if (!active || !hasCell || !valid) return false;
    if (!d.onPlace(type, rotation, [anchor[0], anchor[1]])) return false;
    setActive(false);
    return true;
  }

  // pointer handling: tap = pointerdown/up with little movement (drags belong to the orbit camera)
  let down: { x: number; y: number } | null = null;
  d.canvas.addEventListener('pointermove', e => {
    if (!active || e.buttons > 1) return;
    const c = pickCell(e); if (c) { cell = c; hasCell = true; refresh(); }
  });
  d.canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  d.canvas.addEventListener('pointerup', e => {
    if (!active || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
    down = null;
    if (moved || e.button !== 0) return;
    const c = pickCell(e); if (!c) return;
    cell = c; hasCell = true; refresh();
    if (e.pointerType === 'mouse') confirm();
  });
  addEventListener('keydown', e => {
    if (!active) return;
    if (e.key === 'r' || e.key === 'R') rotate();
    else if (e.key === 'Escape') setActive(false);
    else if (e.key === 'Enter') confirm();
  });
  d.root.querySelectorAll<HTMLElement>('.build-btn').forEach(b =>
    b.addEventListener('click', () => setActive(true, b.dataset.type as BuildingType)));
  q('#rotate').addEventListener('click', rotate);
  q('#confirm').addEventListener('click', confirm);
  q('#cancel').addEventListener('click', () => setActive(false));

  return { get active() { return active; }, start: (t: BuildingType = 'house') => setActive(true, t), cancel: () => setActive(false), rotate, confirm };
}
