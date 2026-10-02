// Renders sim state. Read-only: never mutates the sim. Objects keyed by id; created on first
// sight, updated in place, removed when gone.
import * as THREE from 'three';
import { CELL, P, animate, grp, resident, setAction, type Species } from '../kit/index.js';
import type { SimState, Building, BuildingType, Resident } from '../sim/state';
import { residentPositionAt, cellCentre } from '../sim/position';
import { createBuildingObject, crateRow, footprintSize, setMarketLevel } from './buildingView';
import { poseFootprint, setHouseLevel, setHousePose } from './houseView';
import { createTileObject } from './tileView';
import { facingAngle, kitAction, lerpAngle, plotKitStage } from './mapping';

const MAX_STOCK_CRATES = 6;

interface BView { obj: THREE.Group; stage: string; crates: string; mesh?: THREE.Object3D; crateObj?: THREE.Object3D }
interface RView { obj: THREE.Group; action: string; phase: number; x: number; z: number; yaw: number }

export function createSimView(scene: THREE.Scene, sim: SimState) {
  const bviews = new Map<number, BView>();
  const rviews = new Map<number, RView>();
  const tviews = new Map<string, { kind: string; obj: THREE.Group }>();

  const buildingCentre = (b: Building) => {
    const [w, h] = footprintSize(b.type);
    // centre of the rotated footprint in world metres
    const rot = b.placement.rotation % 2 === 1 ? [h, w] : [w, h];
    return { x: b.placement.origin[0] * CELL + rot[0] * CELL / 2, z: b.placement.origin[1] * CELL + rot[1] * CELL / 2 };
  };

  function syncBuilding(b: Building, now: number) {
    let v = bviews.get(b.id);
    if (!v) {
      // farm plots get their stage mesh below; the generic object would add a second, fully grown plot
      const obj = b.type === 'farmPlot' ? grp('farmPlot') : createBuildingObject(b.type, undefined, true, now, b.level);
      const p = b.placement;
      setHousePose(obj, poseFootprint(p), p.rotation, p.origin[0], p.origin[1]);
      obj.userData.simKind = 'building'; obj.userData.simId = b.id;
      scene.add(obj);
      v = { obj, stage: '', crates: '' };
      bviews.set(b.id, v);
    }
    if (b.type === 'house') setHouseLevel(v.obj, b.level, now);
    if (b.type === 'farmPlot') {
      const crop = (b.plotState === 'empty' ? b.crop : b.growCrop ?? b.crop) ?? 'carrot';
      const st = plotKitStage(b.plotState), key = `${st}|${crop}`;
      if (key !== v.stage) {
        v.stage = key;
        if (v.mesh) v.obj.remove(v.mesh);
        // soil-only plot when empty: the kit has no empty stage, so hide the crops by using a bare plot
        const plot = P.farmPlot({ type: crop, stage: st ?? 0, seed: b.id });
        if (st === null) plot.traverse(o => { if (o.name.startsWith('crop')) o.visible = false; });
        plot.position.set(CELL / 2, 0, CELL / 2);
        plot.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true; });
        v.mesh = plot; v.obj.add(plot);
      }
      const n = b.crates ?? 0, ck = b.crateCrop ?? b.crop ?? 'carrot', key2 = `${n}|${ck}`;
      if (key2 !== v.crates) {
        v.crates = key2;
        if (v.crateObj) v.obj.remove(v.crateObj);
        v.crateObj = crateRow(n, CELL + 0.35, 0.4, 0.55, ck); v.obj.add(v.crateObj);
      }
    } else if (b.type === 'market') {
      setMarketLevel(v.obj, b.level, now);
      const crates = Object.entries(b.stock ?? {}).flatMap(([c, n]) => Array<string>(n).fill(c)).slice(0, MAX_STOCK_CRATES);
      const key = crates.join(',');
      if (key !== v.crates) {
        v.crates = key;
        if (v.crateObj) v.obj.remove(v.crateObj);
        const row = grp('stock');
        crates.forEach((c, i) => {
          const o = crateRow(1, 0, 0, 0, c);
          o.position.set(0.8 + (i % 3) * 0.8, (i >= 3 ? 0.22 : 0), CELL * 1.5 + 0.6);
          row.add(o);
        });
        v.crateObj = row; v.obj.add(row);
      }
    }
  }

  function syncResident(r: Resident, t: number, now: number) {
    let v = rviews.get(r.id);
    const pos = residentPositionAt(r, t);
    if (!v) {
      const obj = resident(r.species as Species);
      obj.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
      obj.position.set(pos.x, 0, pos.z);
      obj.userData.simKind = 'resident'; obj.userData.simId = r.id;
      scene.add(obj);
      v = { obj, action: '', phase: r.id * 1.7, x: pos.x, z: pos.z, yaw: 0 };
      rviews.set(r.id, v);
    }
    const act = kitAction(r.task);
    if (act !== v.action) { setAction(v.obj, act); v.action = act; }
    let target = facingAngle(pos.x - v.x, pos.z - v.z);
    if (target === null && r.task && r.task.action !== 'stand' && r.task.action !== 'walk' && r.jobId !== null) {
      const job = sim.jobs.get(r.jobId), tb = job && sim.buildings.get(job.targetId);
      if (tb) { const c = buildingCentre(tb); target = facingAngle(c.x - pos.x, c.z - pos.z); }
    }
    if (target !== null) { v.yaw = lerpAngle(v.yaw, target, 0.25); v.obj.rotation.y = v.yaw; }
    v.x = pos.x; v.z = pos.z;
    v.obj.position.set(pos.x, 0, pos.z);
    animate(v.obj, now + v.phase);
  }

  function syncTiles() {
    for (const [k, kind] of sim.tiles) {
      const v = tviews.get(k);
      if (v?.kind === kind) continue;
      if (v) scene.remove(v.obj);
      const [x, z] = k.split(',').map(Number), obj = createTileObject(kind);
      obj.position.set((x + 0.5) * CELL, 0, (z + 0.5) * CELL);
      scene.add(obj); tviews.set(k, { kind, obj });
    }
    for (const [k, v] of tviews) if (!sim.tiles.has(k)) { scene.remove(v.obj); tviews.delete(k); }
  }

  /** What is under a pointer ray: a resident (also when tapped near, for touch) or a building. Read-only. */
  function pick(ray: THREE.Raycaster): { kind: 'resident' | BuildingType; id: number } | null {
    const roots = [...rviews.values(), ...bviews.values()].map(v => v.obj);
    const hit = ray.intersectObjects(roots, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.simId === undefined) o = o.parent;
    if (o?.userData.simKind === 'resident') return { kind: 'resident', id: o.userData.simId };
    const g = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (g) {
      let best: number | null = null, bestD = 0.8 * 0.8;
      for (const [id, v] of rviews) { const d = (v.x - g.x) ** 2 + (v.z - g.z) ** 2; if (d < bestD) { bestD = d; best = id; } }
      if (best !== null) return { kind: 'resident', id: best };
    }
    const hitB = o?.userData.simKind === 'building' ? sim.buildings.get(o.userData.simId) : undefined;
    if (hitB) return { kind: hitB.type, id: hitB.id };
    return null;
  }
  const residentPosition = (id: number) => { const v = rviews.get(id); return v ? { x: v.x, z: v.z } : null; };

  function sync(now: number) {
    syncTiles();
    for (const b of sim.buildings.values()) syncBuilding(b, now);
    for (const [id, v] of bviews) if (!sim.buildings.has(id)) { scene.remove(v.obj); bviews.delete(id); }
    for (const r of sim.residents.values()) syncResident(r, sim.t, now);
    for (const [id, v] of rviews) if (!sim.residents.has(id)) { scene.remove(v.obj); rviews.delete(id); }
  }
  /** Rendered plan-piece keys of a house (tests). */
  const housePieceKeys = (id: number): string[] => (bviews.get(id)?.obj.children ?? []).map(o => String(o.userData.key));
  return { sync, cellCentre, pick, residentPosition, housePieceKeys };
}
