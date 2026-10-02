// House level data along the kit's fixed 7 levels. Cells come from data/houseLevels.json, expressed in ONE
// fixed frame (bbox of the union of all levels), so a house never shifts when it levels up.
import data from '../data/houseLevels.json';
import type { Footprint, Frame } from '../systems/placement';

export const HOUSE_FRAME: Frame = data.frame as unknown as Frame;
/** Local offset of the kit's level coordinates inside the frame (kit cell (0,0) is at this cell). */
export const HOUSE_OFFSET: readonly [number, number] = data.offset as unknown as [number, number];
export const HOUSE_MAX_LEVEL: number = data.levels.length;
export const houseCells = (level: number): Footprint => data.levels[level - 1] as unknown as Footprint;
