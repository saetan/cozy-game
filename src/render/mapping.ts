// Pure sim -> kit mappings (no three.js), unit-tested.
import type { PlotState, Task } from '../sim/state';

/** Kit crop stage for a plot, or null when nothing is planted (soil only). */
export function plotKitStage(s: PlotState | undefined): 0 | 1 | 2 | null {
  switch (s) {
    case 'growing': return 0;
    case 'thirsty': case 'watered': return 1;
    case 'ripe': return 2;
    default: return null;
  }
}

export type KitAction = 'walk' | 'work' | 'water' | 'carry' | 'sell' | 'stand';
export const kitAction = (t: Task | null): KitAction => t?.action ?? 'stand';

/** Rotation about +Y so a model facing +z looks along (dx, dz). Null when there is no direction. */
export function facingAngle(dx: number, dz: number): number | null {
  return Math.hypot(dx, dz) < 1e-6 ? null : Math.atan2(dx, dz);
}

/** Shortest-way angle lerp. */
export function lerpAngle(a: number, b: number, k: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}
