// Public API of the Pastel House Kit (same surface as the original single-file kit).
export { getActors, clearActors } from './characters.js';
export { CELL, WALL_H, T, FOUND_H, RISE, M, PLASTER, ROOF, FUR, CLOTH, PAINT, box, grp, P } from './shared.js';
export { PITCH, PORCH_RISE, PORCH_EAVE } from './pieces.js';
export { SPECIES, RES_DEFAULT, POSES, resident, setPose } from './characters.js';
export { ACTIONS, setAction, animate, board, actorScene } from './actions.js';
export { SIDES, rect, hash, rng, pick, buildPlan } from './builder.js';
export { LEVELS, LEVEL_STYLE, house } from './levels.js';
export { CROPS, produce, crop } from './pieces.js';
