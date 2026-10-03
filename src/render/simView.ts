// Renders sim state. Read-only: never mutates the sim. Objects keyed by id; created on first
// sight, updated in place, removed when gone.
import * as THREE from 'three';
import { CELL, P, animate, animateMarker, board, grp, resident, setAction, type Species } from '../kit/index.js';
import type { SimState, Building, BuildingType, Resident, VehicleKind } from '../sim/state';
import { accessCell } from '../systems/pathfinding';
import { VEHICLES, isUnlocked } from '../sim/vehicles';
import { residentPositionAt, cellCentre } from '../sim/position';
import { createBuildingObject, crateRow, footprintSize, setMarketLevel } from './buildingView';
import { poseFootprint, setHouseLevel, setHousePose } from './houseView';
import { createRoadView } from './roadView';
import { facingAngle, kitAction, lerpAngle, plotKitStage, plotThirsty } from './mapping';

const MAX_STOCK_CRATES = 6;

interface BView { obj: THREE.Group; stage: string; crates: string; mesh?: THREE.Object3D; crateObj?: THREE.Object3D }
interface RView { obj: THREE.Group; action: string; phase: number; x: number; z: number; yaw: number; ride: THREE.Object3D | null }

/** Kit pose while riding, and where each parked vehicle sits relative to its house's access cell: [dx, dz, yaw] in metres / radians. */
const RIDE_POSE: Record<VehicleKind, string> = { bicycle: 'ride', wagon: 'push', car: 'sit' };
/** Pose of a rider waiting at a lane entrance. */
const WAIT_POSE: Record<VehicleKind, string> = { bicycle: 'stand', wagon: 'stand', car: 'sit' };
const PARK: Record<VehicleKind, [number, number, number]> = { bicycle: [-0.55, -0.5, 1.2], wagon: [0.6, -0.5, -0.3], car: [0, 0.75, Math.PI / 2] };

export function createSimView(scene: THREE.Scene, sim: SimState) {
  const bviews = new Map<number, BView>();
  const rviews = new Map<number, RView>();
  const roads = createRoadView(scene, sim);
  const vviews = new Map<string, THREE.Object3D>(); // `${houseId}:${kind}`: one per unlocked vehicle, parked or ridden

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
      const st = plotKitStage(b.plotState), thirsty = plotThirsty(b.plotState), key = `${st}|${crop}|${thirsty}`;
      if (key !== v.stage) {
        v.stage = key;
        if (v.mesh) v.obj.remove(v.mesh);
        // soil-only plot when empty: the kit has no empty stage, so hide the crops by using a bare plot
        const plot = P.farmPlot({ type: crop, stage: st ?? 0, thirsty, seed: b.id });
        if (st === null) plot.traverse(o => { if (o.name.startsWith('crop')) o.visible = false; });
        plot.position.set(CELL / 2, 0, CELL / 2);
        plot.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true; });
        v.mesh = plot; v.obj.add(plot);
      }
      if (thirsty && v.mesh) animateMarker(v.mesh, now);
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
      v = { obj, action: '', phase: r.id * 1.7, x: pos.x, z: pos.z, yaw: 0, ride: null };
      rviews.set(r.id, v);
    }
    const ride = r.vehicle ? vviews.get(`${r.homeId}:${r.vehicle}`) ?? null : null;
    if (ride !== v.ride) {
      if (v.ride) unboard(v, pos);
      if (ride) { board(ride as THREE.Group, v.obj); v.obj.position.set(0, 0, 0); v.obj.rotation.y = 0; v.action = RIDE_POSE[r.vehicle!]; }
      v.ride = ride;
    }
    const jobKind = r.jobId !== null ? sim.jobs.get(r.jobId)?.kind : undefined;
    const act = r.vehicle && ride ? (r.task?.action === 'wait' ? WAIT_POSE : RIDE_POSE)[r.vehicle] : kitAction(r.task, jobKind, t);
    if (act !== v.action) { setAction(v.obj, act); v.action = act; }
    let target = facingAngle(pos.x - v.x, pos.z - v.z);
    if (target === null && r.task && r.task.action !== 'stand' && r.task.action !== 'wait' && r.task.action !== 'walk' && r.jobId !== null) {
      const job = sim.jobs.get(r.jobId), tb = job && sim.buildings.get(job.targetId);
      if (tb) { const c = buildingCentre(tb); target = facingAngle(c.x - pos.x, c.z - pos.z); }
    }
    const body = v.ride ?? v.obj; // while riding, the vehicle moves and the resident rides along in it
    if (target !== null) { v.yaw = lerpAngle(v.yaw, target, 0.25); body.rotation.y = v.yaw; }
    v.x = pos.x; v.z = pos.z;
    body.position.set(pos.x, 0, pos.z);
    animate(v.obj, now + v.phase);
  }

  /** Puts the rider back in the scene on their own and the vehicle back in its parking spot. */
  function unboard(v: RView, pos: { x: number; z: number }) {
    scene.add(v.obj); v.obj.position.set(pos.x, 0, pos.z); v.obj.rotation.y = v.yaw;
    v.ride = null; v.action = '';
  }
  /** Creates the vehicles a house has unlocked and parks the ones nobody is riding next to its access cell. */
  function syncVehicles() {
    const riding = new Set<THREE.Object3D>([...rviews.values()].flatMap(v => (v.ride ? [v.ride] : [])));
    for (const b of sim.buildings.values()) {
      if (b.type !== 'house') continue;
      const acc = accessCell(sim.world, b.placement), c = acc && cellCentre(acc);
      for (const k of VEHICLES) {
        if (!isUnlocked(b.level, k)) continue;
        const key = `${b.id}:${k}`;
        let o = vviews.get(key);
        if (!o) {
          o = P[k]();
          o.traverse(m => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = (m as THREE.Mesh).receiveShadow = true; });
          scene.add(o); vviews.set(key, o);
        }
        if (c && !riding.has(o)) { o.position.set(c.x + PARK[k][0], 0, c.z + PARK[k][1]); o.rotation.y = PARK[k][2]; }
      }
    }
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
    roads.sync(now);
    for (const b of sim.buildings.values()) syncBuilding(b, now);
    for (const [id, v] of bviews) if (!sim.buildings.has(id)) { scene.remove(v.obj); bviews.delete(id); }
    syncVehicles();
    for (const r of sim.residents.values()) syncResident(r, sim.t, now);
    for (const [id, v] of rviews) if (!sim.residents.has(id)) { if (v.ride) unboard(v, v); scene.remove(v.obj); rviews.delete(id); }
  }
  /** Rendered plan-piece keys of a house (tests). */
  const housePieceKeys = (id: number): string[] => (bviews.get(id)?.obj.children ?? []).map(o => String(o.userData.key));
  /** What the scene draws for a plot, read back from the Object3D tree (tests). */
  function plotView(id: number) {
    const m = bviews.get(id)?.mesh;
    if (!m) return null;
    let marker = false, stage: number | null = null, crop: string | null = null;
    m.traverse(o => {
      if (o.name === 'marker_water') marker = true;
      const c = /^crop_(\w+?)_s(\d)/.exec(o.name);
      if (c && o.visible) { stage = Number(c[2]); crop = c[1]; }
    });
    return { thirsty: m.name.endsWith('_thirsty'), marker, stage, crop };
  }
  /** The kit action, hand props and visible particle count of a resident (tests). */
  function residentView(id: number) {
    const v = rviews.get(id);
    if (!v) return null;
    const parts = v.obj.userData.parts as { prop?: THREE.Object3D | null; fx?: THREE.Object3D | null };
    let fxVisible = 0;
    parts.fx?.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) fxVisible++; });
    return { action: v.obj.userData.action as string, props: parts.prop ? [parts.prop.name] : [], fxVisible };
  }
  return { sync, roadPieces: roads.keys, plotView, residentView, cellCentre, pick, residentPosition, housePieceKeys };
}
