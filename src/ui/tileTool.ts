// Path / Road / Erase tools: tap or drag over cells to paint. Orbit is disabled for the left mouse /
// one finger while a tool is active (two-finger pan/zoom still works). Commands go through game.apply.
import * as THREE from 'three';
import { CELL } from '../kit/index.js';
import { costOf } from '../sim/costs';
import { cellKey, isFree, isUnlocked } from '../sim/world';
import type { Game } from '../game';
import type { Cell, TileKind } from '../sim/state';

export type TileTool = TileKind | 'erase';

/** Cells on the straight segment a->b (4-connected), so a fast drag leaves no gaps. */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let [x, z] = a;
  const dx = Math.abs(b[0] - x), dz = Math.abs(b[1] - z), sx = x < b[0] ? 1 : -1, sz = z < b[1] ? 1 : -1;
  let err = dx - dz;
  for (let n = 0; n < 4096; n++) {
    out.push([x, z]);
    if (x === b[0] && z === b[1]) break;
    const e2 = 2 * err;
    if (e2 > -dz) { err -= dz; x += sx; } else { err += dx; z += sz; }
  }
  return out;
}

export interface TileToolDeps {
  canvas: HTMLCanvasElement; scene: THREE.Scene; camera: THREE.Camera; game: Game; root: HTMLElement;
  setPaintMode: (on: boolean) => void;
  /** Called when a tool starts (e.g. to clear selection). */
  onStart?: () => void;
}

export function createTileTool(d: TileToolDeps) {
  const { game } = d, sim = game.sim;
  const q = <T extends HTMLElement>(s: string) => d.root.querySelector<T>(s)!;
  const bar = q('#tile-bar'), menu = q('#build-menu'), status = q('#tile-status');
  let tool: TileTool | null = null, painting = false, last: Cell | null = null;
  const pointers = new Set<number>();

  const marker = new THREE.Mesh(new THREE.PlaneGeometry(CELL - 0.1, CELL - 0.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7fd48a', transparent: true, opacity: 0.5, depthWrite: false }));
  marker.position.y = 0.06; marker.visible = false; d.scene.add(marker);

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function pickCell(e: PointerEvent): Cell | null {
    const r = d.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, d.camera);
    const p = ray.ray.intersectPlane(ground, new THREE.Vector3());
    return p ? [Math.floor(p.x / CELL), Math.floor(p.z / CELL)] : null;
  }
  const hint = () => tool === 'erase' ? 'Tap or drag over tiles to erase them (no refund)' :
    `Tap or drag to lay ${tool} tiles · ${costOf(tool as TileKind).coins} coin${costOf(tool as TileKind).coins === 1 ? '' : 's'} each`;

  function mark(c: Cell) {
    const ok = tool === 'erase' ? sim.tiles.has(cellKey(c[0], c[1])) : isUnlocked(sim.world, c[0], c[1]) && isFree(sim.world, c[0], c[1]);
    (marker.material as THREE.MeshBasicMaterial).color.set(ok ? (tool === 'erase' ? '#e8c27a' : '#7fd48a') : '#e5766f');
    marker.position.set((c[0] + 0.5) * CELL, 0.06, (c[1] + 0.5) * CELL); marker.visible = true;
  }
  function paint(c: Cell) {
    const from = last ?? c;
    for (const cell of lineCells(from, c)) {
      if (last && cell[0] === last[0] && cell[1] === last[1]) continue;
      const res = game.apply({ type: 'setTile', cells: [cell], kind: tool === 'erase' ? null : tool });
      status.textContent = res.ok ? hint() : res.reason === 'not enough coins' ? 'Not enough coins' : 'Blocked: that cell is locked or occupied';
    }
    last = c; mark(c);
  }

  function setTool(t: TileTool | null) {
    tool = t; painting = false; last = null; pointers.clear();
    bar.hidden = !t; menu.hidden = !!t; marker.visible = false;
    d.setPaintMode(!!t);
    if (t) { d.onStart?.(); status.textContent = hint(); }
  }

  d.canvas.addEventListener('pointerdown', e => {
    if (!tool) return;
    pointers.add(e.pointerId);
    if (pointers.size > 1) { painting = false; return; } // a second finger means pan/zoom
    if (e.button !== 0) return;
    const c = pickCell(e); if (!c) return;
    painting = true; last = null; paint(c);
  });
  d.canvas.addEventListener('pointermove', e => {
    if (!tool || pointers.size > 1) return;
    const c = pickCell(e); if (!c) return;
    if (painting && e.buttons & 1) paint(c); else if (e.pointerType === 'mouse') mark(c);
  });
  const up = (e: PointerEvent) => { pointers.delete(e.pointerId); if (!pointers.size) { painting = false; last = null; } };
  d.canvas.addEventListener('pointerup', up);
  d.canvas.addEventListener('pointercancel', up);
  addEventListener('keydown', e => { if (tool && e.key === 'Escape') setTool(null); });
  d.root.querySelectorAll<HTMLElement>('.tile-btn').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool as TileTool)));
  q('#tile-done').addEventListener('click', () => setTool(null));

  return { get active() { return tool !== null; }, start: setTool, stop: () => setTool(null) };
}
