// Where a resident is at time t, in world metres (cell centres). Pure; the renderer calls this.
import { CELL } from '../systems/pathfinding';
import type { Resident } from './state';

export const cellCentre = (c: readonly [number, number]) => ({ x: (c[0] + 0.5) * CELL, z: (c[1] + 0.5) * CELL });

export function residentPositionAt(r: Resident, t: number): { x: number; z: number } {
  const task = r.task;
  if (!task?.path || task.path.length === 0) return cellCentre(r.cell);
  const path = task.path, last = path.length - 1;
  const f = task.end > task.start ? (t - task.start) / (task.end - task.start) : 1;
  if (f <= 0) return cellCentre(path[0]);
  if (f >= 1) return cellCentre(path[last]);
  const cum = task.cum ?? path.map((_, i) => i / Math.max(1, last));
  let i = 1;
  while (i < last && cum[i] < f) i++;
  const span = cum[i] - cum[i - 1], u = span > 0 ? (f - cum[i - 1]) / span : 1;
  const a = cellCentre(path[i - 1]), b = cellCentre(path[i]);
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
}
