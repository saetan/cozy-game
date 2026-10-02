// Pure sim -> kit mappings (no three.js), unit-tested.
import type { JobKind, PlotState, Task } from '../sim/state';

/** Kit crop stage for a plot, or null when nothing is planted (soil only). */
export function plotKitStage(s: PlotState | undefined): 0 | 1 | 2 | null {
  switch (s) {
    case 'growing': return 0;
    case 'thirsty': case 'watered': return 1;
    case 'ripe': return 2;
    default: return null;
  }
}

/** A plot that needs water is drawn with the kit's wilted, dry-soil variant and the water-drop marker. */
export const plotThirsty = (s: PlotState | undefined): boolean => s === 'thirsty';

export type KitAction = 'walk' | 'work' | 'water' | 'carry' | 'sell' | 'stand' | 'sow' | 'hoe';
/** Kit action for a task. Planting is `sow` for the first half of the task (by sim time), then `hoe`; every other work stays `work`. */
export function kitAction(t: Task | null, jobKind?: JobKind | null, simT?: number): KitAction {
  if (!t) return 'stand';
  if (t.action === 'work' && jobKind === 'plant' && simT !== undefined) return simT < (t.start + t.end) / 2 ? 'sow' : 'hoe';
  return t.action;
}

/** Rotation about +Y so a model facing +z looks along (dx, dz). Null when there is no direction. */
export function facingAngle(dx: number, dz: number): number | null {
  return Math.hypot(dx, dz) < 1e-6 ? null : Math.atan2(dx, dz);
}

/** Shortest-way angle lerp. */
export function lerpAngle(a: number, b: number, k: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}
