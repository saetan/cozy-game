// Selection: tap/click a house or resident -> bottom contextual panel. Also the "Residents" list.
// Read-only on the sim: every change goes through game.apply. No hover-only info; every action is a button.
import * as THREE from 'three';
import { CELL, LEVELS } from '../kit/index.js';
import { levelUpCheck, HOUSE_MAX_LEVEL } from '../sim/houses';
import { traitInfo } from '../sim/traits';
import type { Game } from '../game';
import type { Resident, Role } from '../sim/state';
import { cap, el } from './dom';
import { ROLE_LABEL, describeActivity, roleKey } from './activity';

const FREE = '#fbf7f0', BLOCKED = '#e5766f';
const ROLES: (Role | null)[] = [null, 'farmer', 'hauler', 'seller'];
const REASON_TEXT = { 'max level': 'Max level', blocked: 'Blocked: clear the red cells', 'not enough coins': 'Not enough coins' } as const;

type Sel = { kind: 'house' | 'resident'; id: number } | null;

export interface SelectionDeps {
  canvas: HTMLCanvasElement; camera: THREE.Camera; scene: THREE.Scene; game: Game; root: HTMLElement;
  pick: (ray: THREE.Raycaster) => { kind: 'house' | 'resident'; id: number } | null;
  residentPosition: (id: number) => { x: number; z: number } | null;
  centreOn: (x: number, z: number) => void;
  /** True while placement / tile tools own the pointer. */
  busy: () => boolean;
}

export function createSelection(d: SelectionDeps) {
  const { game } = d, sim = game.sim;
  const panel = d.root.querySelector<HTMLElement>('#panel')!;
  const listPanel = d.root.querySelector<HTMLElement>('#residents-panel')!;
  const listBtn = d.root.querySelector<HTMLButtonElement>('#residents-btn')!;
  let sel: Sel = null;

  // ---- in-world overlay: next-level cells (house) and a ring under the selected resident
  const overlay = new THREE.Group(); overlay.name = 'selection_overlay'; d.scene.add(overlay);
  const cellGeo = new THREE.PlaneGeometry(CELL - 0.12, CELL - 0.12).rotateX(-Math.PI / 2);
  const freeMat = new THREE.MeshBasicMaterial({ color: FREE, transparent: true, opacity: 0.6, depthWrite: false });
  const blockedMat = new THREE.MeshBasicMaterial({ color: BLOCKED, transparent: true, opacity: 0.75, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7fb8e8', transparent: true, opacity: 0.9, depthWrite: false }));
  ring.position.y = 0.06; ring.visible = false; d.scene.add(ring);
  let ghostKey = '';

  function select(s: Sel) {
    sel = s; panelKey = '';
    panel.hidden = !s;
    if (!s) { overlay.clear(); ghostKey = ''; ring.visible = false; panel.replaceChildren(); }
  }
  const clear = () => select(null);

  // ---- role picker (shared by the panel and the list)
  function rolePicker(r: Resident): HTMLElement {
    const box = el('div', { class: 'roles', role: 'group', 'aria-label': 'Role' });
    for (const role of ROLES) {
      const key = role ?? 'generalist';
      const b = el('button', { class: 'role-btn' + (roleKey(r) === key ? ' active' : ''), 'data-role': key, 'aria-pressed': String(roleKey(r) === key) }, ROLE_LABEL[key]);
      b.addEventListener('click', () => game.apply({ type: 'setRole', residentId: r.id, role }));
      box.append(b);
    }
    return box;
  }
  const traitLine = (r: Resident) => { const t = traitInfo(r); return `${t.name} — ${t.desc}`; };

  // ---- bottom panel
  let panelKey = '';
  let activityEl: HTMLElement | null = null, activityOf: Resident | null = null;
  function renderPanel() {
    if (!sel) return;
    if (sel.kind === 'resident') {
      const r = sim.residents.get(sel.id);
      if (!r) { clear(); return; }
      const key = `r|${r.id}|${r.role}`;
      if (key !== panelKey) {
        panelKey = key;
        activityEl = el('span', { class: 'activity' }); activityOf = r;
        panel.replaceChildren(
          el('div', { class: 'panel-head' }, el('b', { class: 'panel-title' }, r.name), el('span', { class: 'panel-sub' }, `${cap(r.species)} · ${traitInfo(r).name}`), closeBtn()),
          el('div', { class: 'panel-line trait' }, traitLine(r)),
          el('div', { class: 'panel-line' }, 'Doing: ', activityEl),
          rolePicker(r),
        );
      }
      activityEl!.textContent = describeActivity(sim, activityOf!);
      return;
    }
    const b = sim.buildings.get(sel.id);
    if (!b) { clear(); return; }
    const check = levelUpCheck(sim, b.id);
    const residents = [...sim.residents.values()].filter(r => r.homeId === b.id);
    const key = `h|${b.id}|${b.level}|${check.reason ?? ''}|${check.cost.coins ?? 0}|${residents.map(r => r.id).join(',')}`;
    if (key === panelKey) return;
    panelKey = key; activityEl = null;
    const max = b.level >= HOUSE_MAX_LEVEL;
    const up = el('button', { id: 'levelup', class: 'primary' }, max ? 'Max level' : `Level up — ${check.cost.coins ?? 0} coins`) as HTMLButtonElement;
    up.disabled = !check.ok;
    up.addEventListener('click', () => { game.apply({ type: 'levelUpHouse', houseId: b.id }); });
    panel.replaceChildren(
      el('div', { class: 'panel-head' }, el('b', { class: 'panel-title' }, `Lv ${b.level} · ${LEVELS[b.level - 1].name}`), el('span', { class: 'panel-sub' }, 'House'), closeBtn()),
      el('div', { class: 'panel-line' }, residents.length ? `Lives here: ${residents.map(r => r.name).join(', ')}` : 'Nobody lives here yet'),
      max ? el('div', { class: 'panel-line' }, 'Fully grown') : el('div', { class: 'panel-line' }, `Next: ${LEVELS[b.level].name} — ${LEVELS[b.level].note}`),
      el('div', { class: 'panel-actions' }, up, el('span', { id: 'levelup-reason', class: 'reason' }, check.reason ? REASON_TEXT[check.reason] : '')),
    );
  }
  function closeBtn() {
    const b = el('button', { class: 'close', 'aria-label': 'Close', title: 'Close (Esc)' }, '×');
    b.addEventListener('click', clear);
    return b;
  }

  function syncOverlay() {
    if (sel?.kind === 'resident') {
      const p = d.residentPosition(sel.id);
      ring.visible = !!p; if (p) ring.position.set(p.x, 0.06, p.z);
    } else ring.visible = false;
    if (sel?.kind !== 'house') return;
    const check = levelUpCheck(sim, sel.id);
    const blocked = new Set(check.blockedCells.map(c => c.join(',')));
    const key = `${sel.id}|${sim.buildings.get(sel.id)?.level}|${check.newCells.map(c => c.join(':') + (blocked.has(c.join(',')) ? '!' : '')).join(';')}`;
    if (key === ghostKey) return;
    ghostKey = key; overlay.clear();
    for (const [x, z] of check.newCells) {
      const m = new THREE.Mesh(cellGeo, blocked.has(`${x},${z}`) ? blockedMat : freeMat);
      m.position.set((x + 0.5) * CELL, 0.05, (z + 0.5) * CELL); m.name = blocked.has(`${x},${z}`) ? 'ghost_blocked' : 'ghost_free';
      overlay.add(m);
    }
  }

  // ---- residents list
  let listKey = '';
  const activityCells = new Map<number, { el: HTMLElement; r: Resident }>();
  function renderList() {
    if (listPanel.hidden) return;
    const rs = [...sim.residents.values()];
    const key = rs.map(r => `${r.id}|${r.role}`).join(',');
    if (key !== listKey) {
      listKey = key; activityCells.clear();
      const rows = rs.map(r => {
        const act = el('span', { class: 'activity' });
        activityCells.set(r.id, { el: act, r });
        const name = el('button', { class: 'r-name', 'data-id': String(r.id) }, r.name);
        name.addEventListener('click', () => { select({ kind: 'resident', id: r.id }); const p = d.residentPosition(r.id); if (p) d.centreOn(p.x, p.z); });
        return el('li', { class: 'r-row' }, name, el('span', { class: 'r-meta' }, `${cap(r.species)} · ${traitInfo(r).name}`), rolePicker(r), act);
      });
      listPanel.replaceChildren(el('div', { class: 'panel-head' }, el('b', { class: 'panel-title' }, `Residents (${rs.length})`), listClose()),
        rs.length ? el('ul', { class: 'r-list' }, ...rows) : el('div', { class: 'panel-line' }, 'No residents yet — build a house.'));
    }
    for (const { el: e, r } of activityCells.values()) e.textContent = describeActivity(sim, r);
  }
  function listClose() { const b = el('button', { class: 'close', 'aria-label': 'Close residents list' }, '×'); b.addEventListener('click', () => toggleList(false)); return b; }
  function toggleList(on = listPanel.hidden) { listPanel.hidden = !on; listKey = ''; listBtn.setAttribute('aria-expanded', String(on)); renderList(); }
  listBtn.addEventListener('click', () => toggleList());

  // ---- picking: a tap (little movement) selects; a tap on empty ground deselects
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down: { x: number; y: number; id: number } | null = null;
  d.canvas.addEventListener('pointerdown', e => { down = e.isPrimary ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null; });
  d.canvas.addEventListener('pointerup', e => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
    down = null;
    if (moved || e.button !== 0 || d.busy()) return;
    const r = d.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, d.camera);
    const hit = d.pick(ray);
    if (hit) select(hit); else clear();
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !d.busy()) { clear(); if (!listPanel.hidden) toggleList(false); } });

  panel.hidden = true; listPanel.hidden = true;
  return {
    select, clear, toggleList,
    get selected() { return sel; },
    /** Call every frame. */
    update() { renderPanel(); syncOverlay(); renderList(); },
  };
}
