// Selection: tap/click a house or resident -> bottom contextual panel. Also the "Residents" list.
// Read-only on the sim: every change goes through game.apply. No hover-only info; every action is a button.
import * as THREE from 'three';
import { CELL, LEVELS } from '../kit/index.js';
import { levelSpec, levelUpCheck } from '../sim/levels';
import { chunkBuyReason, chunkPrice } from '../sim/commands';
import { CROPS, cropInfo, stockTotal } from '../sim/crops';
import { CHUNK, cellToChunk, inBounds, isUnlocked } from '../sim/world';
import { traitInfo } from '../sim/traits';
import type { Game } from '../game';
import type { Building, BuildingType, Resident, Role } from '../sim/state';
import balance from '../data/balance.json';
import { cap, el } from './dom';
import { ROLE_LABEL, describeActivity, roleKey } from './activity';

const FREE = '#fbf7f0', BLOCKED = '#e5766f';
const ROLES: (Role | null)[] = [null, 'farmer', 'hauler', 'seller'];
const REASON_TEXT = { 'max level': 'Max level', blocked: 'Blocked: clear the red cells', 'not enough coins': 'Not enough coins' } as const;

type Sel = { kind: 'resident' | BuildingType; id: number } | { kind: 'land'; cx: number; cz: number } | null;

export interface SelectionDeps {
  canvas: HTMLCanvasElement; camera: THREE.Camera; scene: THREE.Scene; game: Game; root: HTMLElement;
  pick: (ray: THREE.Raycaster) => { kind: 'resident' | BuildingType; id: number } | null;
  /** Called after land is bought so the ground view can add the new chunk. */
  onLandBought: () => void;
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
  const chunkGeo = new THREE.PlaneGeometry(CHUNK * CELL - 0.3, CHUNK * CELL - 0.3).rotateX(-Math.PI / 2);
  let ghostKey = '';

  function select(s: Sel) {
    sel = s; panelKey = ''; live = null;
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
  let panelKey = '', live: (() => void) | null = null;
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
    if (sel.kind === 'land') { renderLand(sel.cx, sel.cz); return; }
    const b = sim.buildings.get(sel.id);
    if (!b) { clear(); return; }
    if (b.type === 'farmPlot') renderPlot(b); else renderGrowing(b);
  }

  // ---- house / market: level, next level, shared level-up button
  function levelUpActions(b: Building, check: ReturnType<typeof levelUpCheck>) {
    const max = b.level >= levelSpec(b.type)!.max;
    const up = el('button', { id: 'levelup', class: 'primary' }, max ? 'Max level' : `Level up — ${check.cost.coins ?? 0} coins`) as HTMLButtonElement;
    up.disabled = !check.ok;
    up.addEventListener('click', () => { game.apply({ type: 'levelUp', buildingId: b.id }); });
    return el('div', { class: 'panel-actions' }, up, el('span', { id: 'levelup-reason', class: 'reason' }, check.reason ? REASON_TEXT[check.reason] : ''));
  }
  const stockText = (m: Building) => {
    const have = CROPS.filter(c => (m.stock?.[c] ?? 0) > 0).map(c => `${cap(c)} ${m.stock![c]}`);
    return `Stock: ${have.length ? have.join(' · ') : 'empty'}`;
  };
  function renderGrowing(b: Building) {
    const check = levelUpCheck(sim, b.id), spec = levelSpec(b.type)!;
    const residents = [...sim.residents.values()].filter(r => r.homeId === b.id);
    const key = `${b.type[0]}|${b.id}|${b.level}|${check.reason ?? ''}|${check.cost.coins ?? 0}|${residents.map(r => r.id).join(',')}`;
    if (key !== panelKey) {
      panelKey = key; activityEl = null; live = null;
      const max = b.level >= spec.max;
      if (b.type === 'house') {
        panel.replaceChildren(
          el('div', { class: 'panel-head' }, el('b', { class: 'panel-title' }, `Lv ${b.level} · ${LEVELS[b.level - 1].name}`), el('span', { class: 'panel-sub' }, 'House'), closeBtn()),
          el('div', { class: 'panel-line' }, residents.length ? `Lives here: ${residents.map(r => r.name).join(', ')}` : 'Nobody lives here yet'),
          max ? el('div', { class: 'panel-line' }, 'Fully grown') : el('div', { class: 'panel-line' }, `Next: ${LEVELS[b.level].name} — ${LEVELS[b.level].note}`),
          levelUpActions(b, check),
        );
      } else {
        const stock = el('div', { class: 'panel-line', id: 'market-stock' });
        live = () => { stock.textContent = stockText(b); };
        panel.replaceChildren(
          el('div', { class: 'panel-head' }, el('b', { class: 'panel-title' }, `Lv ${b.level} · ${b.level} stall${b.level > 1 ? 's' : ''}`), el('span', { class: 'panel-sub' }, 'Market'), closeBtn()),
          el('div', { class: 'panel-line', id: 'market-stalls' }, `Stalls: ${b.level} of ${spec.max} — one seller per stall`),
          stock,
          max ? el('div', { class: 'panel-line' }, 'Fully grown') : el('div', { class: 'panel-line' }, 'Next: one more stall'),
          levelUpActions(b, check),
        );
      }
    }
    live?.();
  }

  // ---- farm plot: state, crates and a crop picker (locked crops show their unlock price)
  const STATE_TEXT = { empty: 'Empty', growing: 'Growing', thirsty: 'Needs water', watered: 'Watered, growing', ripe: 'Ripe' } as const;
  function renderPlot(b: Building) {
    const key = `p|${b.id}|${b.crop}|${sim.unlockedCrops.join(',')}|${CROPS.map(c => (sim.unlockedCrops.includes(c) || sim.coins >= cropInfo(c).unlock ? 1 : 0)).join('')}`;
    if (key !== panelKey) {
      panelKey = key; activityEl = null;
      const status = el('div', { class: 'panel-line', id: 'plot-status' });
      live = () => {
        const grow = b.plotState === 'empty' ? '' : ` ${cap(b.growCrop ?? b.crop ?? '')}`;
        status.textContent = `${STATE_TEXT[b.plotState ?? 'empty']}${grow} · Crates: ${b.crates ?? 0}/${balance.maxCrates}`;
      };
      const picker = el('div', { class: 'crops', role: 'group', 'aria-label': 'Crop' });
      for (const c of CROPS) {
        const info = cropInfo(c), open = sim.unlockedCrops.includes(c);
        const btn = el('button', { class: 'crop-btn' + (open && b.crop === c ? ' active' : ''), 'data-crop': c, ...(open ? { 'aria-pressed': String(b.crop === c) } : {}) },
          open ? `${cap(c)} · ${info.price}` : `${cap(c)} — Unlock · ${info.unlock}`) as HTMLButtonElement;
        if (open) btn.addEventListener('click', () => game.apply({ type: 'setCrop', plotId: b.id, crop: c }));
        else { btn.disabled = sim.coins < info.unlock; btn.addEventListener('click', () => game.apply({ type: 'unlockCrop', crop: c })); }
        picker.append(btn);
      }
      panel.replaceChildren(
        el('div', { class: 'panel-head' }, el('b', { class: 'panel-title' }, 'Farm plot'), el('span', { class: 'panel-sub' }, `Growing ${cap(b.crop ?? '')}`), closeBtn()),
        status,
        el('div', { class: 'panel-line' }, 'Next planting:'),
        picker,
      );
    }
    live?.();
  }

  // ---- buying land
  function renderLand(cx: number, cz: number) {
    const why = chunkBuyReason(sim, cx, cz), cost = chunkPrice(sim).coins ?? 0;
    const key = `l|${cx}|${cz}|${why ?? ''}|${cost}`;
    if (key === panelKey) return;
    panelKey = key; activityEl = null; live = null;
    const buy = el('button', { id: 'buy-land', class: 'primary' }, `Buy this land · ${cost} coins`) as HTMLButtonElement;
    buy.disabled = why !== null;
    buy.addEventListener('click', () => { if (game.apply({ type: 'buyChunk', cx, cz }).ok) { d.onLandBought(); clear(); } });
    panel.replaceChildren(
      el('div', { class: 'panel-head' }, el('b', { class: 'panel-title' }, 'Meadow'), el('span', { class: 'panel-sub' }, 'Not yet yours'), closeBtn()),
      el('div', { class: 'panel-actions' }, buy, el('span', { id: 'land-reason', class: 'reason' }, why ? (why === 'not enough coins' ? 'Not enough coins' : why === 'must touch your land' ? 'Must touch your land' : why) : '')),
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
    if (sel?.kind === 'land') {
      const key = `land|${sel.cx}|${sel.cz}|${chunkBuyReason(sim, sel.cx, sel.cz) === 'must touch your land'}`;
      if (key === ghostKey) return;
      ghostKey = key; overlay.clear();
      const m = new THREE.Mesh(chunkGeo, key.endsWith('true') ? blockedMat : freeMat);
      m.position.set((sel.cx + 0.5) * CHUNK * CELL, 0.05, (sel.cz + 0.5) * CHUNK * CELL); m.name = 'land_highlight';
      overlay.add(m);
      return;
    }
    if (sel?.kind !== 'house' && sel?.kind !== 'market') return;
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
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
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
    if (hit) { select(hit); return; }
    const g = ray.ray.intersectPlane(ground, new THREE.Vector3());
    const cx = g ? Math.floor(g.x / CELL) : 0, cz = g ? Math.floor(g.z / CELL) : 0;
    if (g && inBounds(sim.world, cx, cz) && !isUnlocked(sim.world, cx, cz)) { const [chx, chz] = cellToChunk(cx, cz); select({ kind: 'land', cx: chx, cz: chz }); }
    else clear();
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
