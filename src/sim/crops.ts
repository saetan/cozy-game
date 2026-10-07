// Crop data helpers: the fixed crop order, prices and per-crop market stock.
import { DEFAULTS } from './config';
import type { Building } from './state';

export type CropId = keyof typeof DEFAULTS.crops;
export const CROPS = Object.keys(DEFAULTS.crops) as CropId[];
export const isCrop = (c: string): c is CropId => Object.prototype.hasOwnProperty.call(DEFAULTS.crops, c);
export const cropInfo = (c: string) => DEFAULTS.crops[(isCrop(c) ? c : DEFAULTS.defaultCrop) as CropId];
export const emptyStock = (): Record<string, number> => Object.fromEntries(CROPS.map(c => [c, 0]));
export const stockTotal = (m: Building): number => Object.values(m.stock ?? {}).reduce((a, n) => a + n, 0);
/** Crop sold next: the most valuable one in stock (ties by name), so selling order is deterministic. */
export function nextSale(m: Building): string | null {
  const have = Object.keys(m.stock ?? {}).filter(c => (m.stock![c] ?? 0) > 0);
  have.sort((a, b) => cropInfo(b).price - cropInfo(a).price || (a < b ? -1 : 1));
  return have[0] ?? null;
}
