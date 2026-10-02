// Pastel House Kit — barrel module. Import everything from here, or import a single kit module directly:
//   core.js        grid constants, materials, mesh helpers, RNG, shared piece registry P
//   characters.js  residents (5 species, shared rig), poses, action registry + animate()
//   vehicles.js    car, bicycle, wagon, bike stand, board / alight / parkBike
//   farm.js        plots, crops (+ thirsty), produce, crates, market stall, tools, farming actions
//   house.js       house pieces, garage, buildPlan, LEVELS, random house
//   roads.js       roads, junctions, garden paths, lot connection, drivers (import separately)
export * from './core.js';
export * from './characters.js';
export * from './vehicles.js';
export * from './farm.js';
export * from './house.js';
import { CELL, grp, P } from './core.js';
import { CLOTH, RES_DEFAULT, resident, setAction } from './characters.js';
import { board } from './vehicles.js';

// demo scene per action: resident + the thing it interacts with
function actorScene(sp, action) {
  const res = resident(sp, { outfit: CLOTH[RES_DEFAULT[sp][0]], scarf: CLOTH[RES_DEFAULT[sp][1]] });
  const vehicle = { sit: 'car', ride: 'bicycle', push: 'wagon' }[action];
  if (vehicle) return board(P[vehicle](), res);
  const g = grp('scene_' + action, res);
  setAction(res, action);
  if (action === 'work' || action === 'hoe' || action === 'sow' || action === 'water') {
    const w = action === 'water';
    g.add(P.farmPlot({ type: w ? 'cabbage' : 'carrot', stage: w ? 1 : 0, thirsty: w, seed: 4 }));
    res.position.z = CELL / 2 + 0.6; res.rotation.y = Math.PI;
  } else if (action === 'sell') {
    g.add(P.marketStall()); res.position.z = -0.8;
  }
  return g;
}

export { actorScene };
