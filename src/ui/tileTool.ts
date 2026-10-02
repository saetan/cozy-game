// Street / Dirt road (6 m tiles snapped to the 3x3-cell street grid), Lane / Dirt lane / Path (one cell) and Erase tools:
// tap or drag to paint. Orbit is disabled for the left mouse /
// one finger while a tool is active (two-finger pan/zoom still works). Commands go through game.apply.
import * as THREE from 'three';
import { CELL } from '../kit/index.js';
import { costOf, type CostKey } from '../sim/costs';
import { streetPlan, tileReason } from '../sim/commands';
import { STREET_CELLS, streetAt, streetTileCells, streetTileOf } from '../sim/surfaces';
import { cellKey } from '../sim/world';
import type { Game } from '../game';
import type { Cell, StreetKind, TileKind } from '../sim/state';

export type StreetTool = 'street' | 'dirtRoad';
export type TileTool = TileKind | StreetTool | 'erase';
const STREET_KIND: Record<StreetTool, StreetKind> = { street: 'road', dirtRoad: 'dirt' };
const LABEL: Record<string, string> = { street: 'street', dirtRoad: 'dirt road', lane: 'lane', dirtLane: 'dirt lane', path: 'path' };
const isStreetTool = (t: TileTool | null): t is StreetTool => t === 'street' || t === 'dirtRoad';

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
  /** The pointed cell; for the street tools, the street-grid tile (i, j) under it. */
  function pickCell(e: PointerEvent): Cell | null {
    const r = d.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, d.camera);
    const p = ray.ray.intersectPlane(ground, new THREE.Vector3());
    if (!p) return null;
    const c: Cell = [Math.floor(p.x / CELL), Math.floor(p.z / CELL)];
    return isStreetTool(tool) ? streetTileOf(c[0], c[1]) : c;
  }
  const costKey = () => tool as CostKey;
  const hint = () => tool === 'erase' ? 'Tap or drag to erase (a street or dirt road tile goes whole; no refund)' :
    `Tap or drag to lay ${LABEL[tool!]} tiles · ${costOf(costKey()).coins} coin${costOf(costKey()).coins === 1 ? '' : 's'} each`;
  const say = (reason: string | null) => { status.textContent = reason === null ? hint() : reason === 'not enough coins' ? 'Not enough coins' : reason.charAt(0).toUpperCase() + reason.slice(1); };

  /** Why the pointed cell or tile cannot take the current tool (null = ok). */
  function reasonFor(c: Cell): string | null {
    if (tool === 'erase') return streetAt(sim, c[0], c[1]) || sim.tiles.has(cellKey(c[0], c[1])) ? null : 'nothing to erase here';
    if (isStreetTool(tool)) { const p = streetPlan(sim, [c], STREET_KIND[tool]); return typeof p === 'string' ? p : null; }
    if (sim.tiles.get(cellKey(c[0], c[1])) === tool) return null;
    return tileReason(sim, [c], tool as TileKind);
  }
  function mark(c: Cell, hover = true) {
    const why = reasonFor(c), big = isStreetTool(tool) || (tool === 'erase' && !!streetAt(sim, c[0], c[1]));
    (marker.material as THREE.MeshBasicMaterial).color.set(why ? '#e5766f' : tool === 'erase' ? '#e8c27a' : '#7fd48a');
    const [i, j] = big ? (isStreetTool(tool) ? c : streetTileOf(c[0], c[1])) : [0, 0];
    marker.scale.setScalar(big ? STREET_CELLS : 1);
    if (big) marker.position.set((i * STREET_CELLS + STREET_CELLS / 2) * CELL, 0.06, (j * STREET_CELLS + STREET_CELLS / 2) * CELL);
    else marker.position.set((c[0] + 0.5) * CELL, 0.06, (c[1] + 0.5) * CELL);
    marker.visible = true;
    if (hover) say(why);
  }
  function paint(c: Cell) {
    const from = last ?? c;
    for (const cell of lineCells(from, c)) {
      if (last && cell[0] === last[0] && cell[1] === last[1]) continue;
      const res = tool === 'erase' ? game.apply({ type: 'setTile', cells: [cell], kind: null })
        : isStreetTool(tool) ? game.apply({ type: 'setStreet', tiles: [cell], kind: STREET_KIND[tool] })
        : game.apply({ type: 'setTile', cells: [cell], kind: tool as TileKind });
      say(res.ok ? null : res.reason);
    }
    last = c; mark(c, false);
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
