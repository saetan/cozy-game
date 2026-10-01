// Fixed level growth path and the random demo house.
import { rng, CLOTH, CELL, FOUND_H, M, PLASTER, ROOF, PAINT, wood, grp, P } from './shared.js';
import { CROPS } from './pieces.js';
import { SPECIES, RES_DEFAULT, resident } from './characters.js';
import { setAction, board } from './actions.js';
import { rect, pick, buildPlan } from './builder.js';

// ---- fixed growth path: each level is a full spec; the diff between levels is what animates ----
const LEVEL_STYLE = { plaster: PLASTER.butter, roof: ROOF.coral, shutters: true, shutterMat: ROOF.slate };
const L_MAIN32 = rect(0, 3, 0, 2, 0), L_UP = rect(0, 3, 0, 2, 1), L_WING = rect(2, 3, 2, 4, 0), L_PORCH = [[0, 2], [1, 2]];
const L_GAR = { cells: [[-1, 0], [-1, 1]], door: [-1, 1] }, L_GCELLS = rect(-1, 0, 0, 2, 0);
const LEVELS = [
  { name: 'Cottage', note: '2×2 cells, one floor, driveway', cells: rect(0, 2, 0, 2, 0) },
  { name: 'Longer', note: 'extends to 3×2 — roof grows along the ridge', cells: L_MAIN32 },
  { name: 'Porch', note: 'covered front porch with lean-to roof', cells: L_MAIN32, porch: L_PORCH },
  { name: 'Garage', note: 'attached 1×2 garage at the end of the driveway — the car can drive in', cells: [...L_GCELLS, ...L_MAIN32], porch: L_PORCH, garage: L_GAR },
  { name: 'Second floor', note: 'upper storey + chimney; garage keeps its own roof', cells: [...L_GCELLS, ...L_MAIN32, ...L_UP], porch: L_PORCH, garage: L_GAR, chimney: 1 },
  { name: 'Side wing', note: 'L-shape: 1×2 wing with its own gable roof', cells: [...L_GCELLS, ...L_MAIN32, ...L_UP, ...L_WING], porch: L_PORCH, garage: L_GAR, chimney: 1 },
  { name: 'Deeper', note: 'back row added — 3 deep, taller roof at same pitch', cells: [...L_GCELLS, ...rect(0, 3, -1, 2, 0), ...rect(0, 3, -1, 2, 1), ...L_WING], porch: L_PORCH, garage: L_GAR, chimney: 1 },
].map(L => ({ door: [0, 1], style: LEVEL_STYLE, seed: 11, porch: [], chimney: null, garage: null, drive: [[-1, 2], [-1, 3], [-1, 4]], ...L }));

function house(seed) {
  const r = rng(seed), g = grp('house_' + seed);
  const nx = 2 + Math.floor(r() * 3), nz = 2 + (r() < 0.3 ? 1 : 0), floors = 1 + (r() < 0.55 ? 1 : 0);
  const W = nx * CELL, D = nz * CELL;
  const style = { plaster: pick(r, PLASTER), roof: pick(r, ROOF), shutters: r() < 0.6 };
  style.shutterMat = r() < 0.5 ? wood : pick(r, ROOF);
  const doorCell = Math.floor(r() * nx), hasPorch = r() < 0.35;
  const place = (p, x, y, z, ry = 0) => { p.position.set(x, y, z); p.rotation.y = ry; g.add(p); return p; };
  const cells = []; for (let f = 0; f < floors; f++) cells.push(...rect(0, nx, 0, nz, f));
  const spec = { cells, door: [doorCell, nz - 1], style, seed, chimney: r() < 0.7 ? Math.floor(r() * nx) : null, porch: hasPorch ? [[doorCell, nz]] : [] };
  for (const p of buildPlan(spec, -W / 2, -D / 2)) place(p.make(), p.x, p.y, p.z, p.ry);

  // front yard
  const fz = D / 2 + 2.6;
  for (let i = 0; i < nx; i++) if (i !== doorCell) {
    place(P.fence(), -W / 2 + CELL / 2 + i * CELL, 0, fz);
    if (r() < 0.7) place(P.shrub(), -W / 2 + CELL / 2 + i * CELL + (r() - 0.5), 0, D / 2 + 0.7);
  }
  // residents by the front door
  const dx = -W / 2 + CELL / 2 + doorCell * CELL, n = 1 + (r() < 0.6 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const sp = SPECIES[Math.floor(r() * SPECIES.length)];
    const res = resident(sp, { outfit: pick(r, CLOTH), scarf: pick(r, CLOTH) });
    setAction(res, r() < 0.5 ? 'wave' : 'stand');
    place(res, dx + (n === 1 ? 0.2 : (k ? 0.55 : -0.55)), hasPorch ? FOUND_H : 0, D / 2 + (hasPorch ? 1.0 : 1.45), (r() - 0.5) * 0.8);
  }
  // vehicles: car in the side driveway (sometimes driven), bike parked on the other side
  if (r() < 0.75) {
    const car = P.car({ paint: pick(r, PAINT) });
    if (r() < 0.5) board(car, resident(SPECIES[Math.floor(r() * 5)], { outfit: pick(r, CLOTH), scarf: pick(r, CLOTH) }));
    place(car, W / 2 + 1.5, 0, D / 2 - 0.6, 0);
    for (let k = -1; k < 3; k++) place(P.driveway(), W / 2 + 1.5, 0, D / 2 - 0.6 + k * CELL);
  }
  if (r() < 0.6) place(P.bicycle({ paint: pick(r, PAINT) }), -W / 2 - 0.8, 0, D / 2 + 0.3, Math.PI / 2 + 0.2);
  else if (r() < 0.5) place(P.wagon({ paint: pick(r, PAINT) }), -W / 2 - 1.0, 0, D / 2 + 0.4, 0.4);
  // back garden farm with a worker
  const newRes = () => resident(SPECIES[Math.floor(r() * 5)], { outfit: pick(r, CLOTH), scarf: pick(r, CLOTH) });
  if (r() < 0.7) {
    const type = CROPS[Math.floor(r() * CROPS.length)], n = Math.min(nx, 1 + Math.floor(r() * 3));
    for (let k = 0; k < n; k++) place(P.farmPlot({ type, stage: 'mixed', seed: seed + k }), -W / 2 + CELL / 2 + k * (CELL + 0.2), 0, -D / 2 - 2.5);
    place(setAction(newRes(), r() < 0.6 ? 'work' : 'water'), -W / 2 + CELL / 2, 0, -D / 2 - 0.9, Math.PI);
    if (r() < 0.5) place(P.scarecrow(), -W / 2 + CELL / 2 + n * (CELL + 0.2) - 0.4, 0, -D / 2 - 2.5, 0.3);
  }
  // roadside stall
  if (r() < 0.45) {
    const goods = [0, 1, 2].map(() => CROPS[Math.floor(r() * CROPS.length)]);
    place(P.marketStall({ awning: pick(r, ROOF), panel: pick(r, PLASTER), goods }), -W / 2 - 3.4, 0, D / 2 + 1.4);
    place(setAction(newRes(), 'sell'), -W / 2 - 3.4, 0, D / 2 + 0.6);
  }
  return g;
}

export { LEVELS, LEVEL_STYLE, house };
