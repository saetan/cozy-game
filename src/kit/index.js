// The game's single entry point to the Pastel House Kit. The kit itself is vendored, untouched, in design/kit/
// (see design/README.md). The roads (6 m streets, garden paths) and 2 m lanes add-ons are exported by name: roads.js and
// lanes.js both define LANE_HW, so `export *` would hide it.
import { ACTIONS as KIT_ACTIONS } from '../../design/kit/kit/kit.js';

export * from '../../design/kit/kit/kit.js';

// Kit 0.2 keeps 'work' as a legacy alias of 'hoe' but leaves it out of the label list; the game still uses 'work'.
export const ACTIONS = { ...KIT_ACTIONS, work: KIT_ACTIONS.work ?? KIT_ACTIONS.hoe };

export { TILE, ROAD_CELLS, ORDER, SIDE, buildRoads, roadTile, dirtTile, pathTile } from '../../design/kit/kit/roads.js';
export { buildLanes, laneTile, dirtLaneTile, laneMouthSpill } from '../../design/kit/kit/lanes.js';
