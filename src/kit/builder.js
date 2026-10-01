// Cell-based house builder: spec -> flat plan of { key, make, x, y, z, ry }.
import { CELL, WALL_H, FOUND_H, grp, P, rng } from './shared.js';
import { PITCH, PORCH_RISE, PORCH_EAVE } from './pieces.js';

const pick = (r, o) => { const v = Object.values(o); return v[Math.floor(r() * v.length)]; };

// ---- cell-based house builder ----
// spec = { cells: [[x,z,floor]], door: [x,z] (south edge), porch: [[x,z]] (cells south of the house),
//          chimney: column|null, style: { plaster, roof, shutters, shutterMat }, seed }
// Walls go on every edge between an occupied and an empty cell; corner posts on convex corners;
// roofs on greedy rectangles of top-most cells (ridge along the longer side). Returns a flat plan of
// { key, make, x, y, z, ry } — keys are stable, so a level-up can diff old vs new plans.
const SIDES = { S: [0, 1, 0], N: [0, -1, Math.PI], E: [1, 0, Math.PI / 2], W: [-1, 0, -Math.PI / 2] };
const rect = (x0, x1, z0, z1, f) => { const a = []; for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) a.push([x, z, f]); return a; };
function hash(...n) { let h = 2166136261; for (const ch of n.join(',')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }
function buildPlan(spec, ox = 0, oz = 0) {
  const has = new Set(spec.cells.map(c => c.join(','))), on = (x, z, f) => has.has(`${x},${z},${f}`);
  const st = spec.style, out = [], seen = new Set(), wx = x => x * CELL + ox, wz = z => z * CELL + oz;
  const add = (key, make, x, y, z, ry = 0) => { if (seen.has(key)) return; seen.add(key); out.push({ key, make, x, y, z, ry }); };
  const porch = new Set((spec.porch || []).map(p => p.join(',')));
  const gar = spec.garage, gset = new Set(gar ? gar.cells.map(c => c.join(',')) : []), isG = (x, z) => gset.has(x + ',' + z);
  const floors = [...new Set(spec.cells.map(c => c[2]))].sort(), maxF = Math.max(...floors);

  for (const [x, z, f] of spec.cells) {
    const cx = wx(x + 0.5), cz = wz(z + 0.5), y = FOUND_H + f * WALL_H;
    const gDoor = s => gar && f === 0 && gar.door[0] === x && gar.door[1] === z && s === 'S';
    if (f === 0 && isG(x, z)) {
      const curbs = Object.keys(SIDES).filter(s => !on(x + SIDES[s][0], z + SIDES[s][1], 0) && !gDoor(s)).join('');
      add(`gslab:${x},${z}:${curbs}`, () => P.garageSlab({ curbs }), cx, 0, cz);
    } else if (f === 0) add(`found:${x},${z}`, () => P.foundation(), cx, 0, cz);
    for (const s in SIDES) {
      const [dx, dz, ry] = SIDES[s];
      const ex = cx + dx * CELL / 2, ez = cz + dz * CELL / 2;
      if (on(x + dx, z + dz, f)) {
        // party wall between garage and living space
        if (f === 0 && isG(x, z) && !isG(x + dx, z + dz)) add(`iwall:${x},${z},${s}`, () => P.wall({ plaster: st.plaster }), ex, y, ez, ry);
        continue;
      }
      const isDoor = f === 0 && spec.door && spec.door[0] === x && spec.door[1] === z && s === 'S';
      const covered = f === 0 && porch.has(`${x + dx},${z + dz}`);
      const kind = gDoor(s) ? 'garage' : isDoor ? 'door' : hash(spec.seed, x, z, f, s) < (f ? 0.7 : 0.6) ? 'window' : 'wall';
      add(`wall:${x},${z},${f},${s}:${kind}${covered ? ':c' : ''}`, () =>
        kind === 'garage' ? P.wallGarage({ plaster: st.plaster })
        : kind === 'door' ? P.wallDoor({ plaster: st.plaster, covered })
        : kind === 'window' ? P.wallWindow({ plaster: st.plaster, shutters: st.shutters, shutterMat: st.shutterMat })
        : P.wall({ plaster: st.plaster }), ex, y, ez, ry);
      if (f > 0) add(`belt:${x},${z},${f},${s}`, () => P.beltCourse(), ex, y, ez, ry);
    }
  }

  for (const f of floors) {
    const verts = new Set();
    spec.cells.filter(c => c[2] === f).forEach(([x, z]) => { for (const a of [0, 1]) for (const b of [0, 1]) verts.add((x + a) + ',' + (z + b)); });
    for (const v of verts) {
      const [vx, vz] = v.split(',').map(Number);
      const q = [[vx - 1, vz - 1], [vx, vz - 1], [vx - 1, vz], [vx, vz]].filter(([x, z]) => on(x, z, f));
      if (q.length !== 1) continue;
      const [qx, qz] = q[0];
      add(`post:${v},${f}`, () => P.cornerPost(), wx(vx) + (qx < vx ? -0.1 : 0.1), FOUND_H + f * WALL_H, wz(vz) + (qz < vz ? -0.1 : 0.1));
    }
  }

  const endGable = (x, z, s, ridgeWorld, run, rise, f, yT) => {
    const [dx, dz, ry] = SIDES[s];
    if (on(x + dx, z + dz, f)) return;
    const ex = wx(x + 0.5) + dx * CELL / 2, ez = wz(z + 0.5) + dz * CELL / 2;
    // project the ridge onto the wall's local x axis (cos ry, 0, -sin ry)
    const ridgeAt = s === 'E' || s === 'W' ? (ridgeWorld - ez) * -Math.sin(ry) : (ridgeWorld - ex) * Math.cos(ry);
    add(`gable:${x},${z},${f},${s}:${run}:${ridgeAt.toFixed(2)}`, () => P.gable({ plaster: st.plaster, ridgeAt, run, rise }), ex, yT, ez, ry);
  };
  const roofBlock = (x0, x1, z0, z1, f) => {
    const yT = FOUND_H + (f + 1) * WALL_H, alongX = x1 - x0 >= z1 - z0, roof = st.roof;
    const run = (alongX ? z1 - z0 : x1 - x0) * CELL / 2, rise = run * PITCH;
    if (alongX) {
      const rz = wz((z0 + z1) / 2);
      for (let i = x0; i < x1; i++) {
        const cx = wx(i + 0.5);
        add(`roof:${i},${z1},${f},S:${run}`, () => P.roofSlope({ roof, run }), cx, yT, wz(z1), 0);
        add(`roof:${i},${z0},${f},N:${run}`, () => P.roofSlope({ roof, run }), cx, yT, wz(z0), Math.PI);
        add(`ridge:${i},${rz},${f}:${run}`, () => P.ridgeCap({ roof, rise }), cx, yT, rz, 0);
      }
      if (f === maxF && spec.chimney != null && spec.chimney >= x0 && spec.chimney < x1)
        add(`chimney:${spec.chimney},${f}:${run}`, () => P.chimney(), wx(spec.chimney + 0.7), yT + rise - 0.5 * PITCH - 0.4, rz - 0.5);
      for (let j = z0; j < z1; j++) { endGable(x0, j, 'W', rz, run, rise, f, yT); endGable(x1 - 1, j, 'E', rz, run, rise, f, yT); }
    } else {
      const rx = wx((x0 + x1) / 2);
      for (let j = z0; j < z1; j++) {
        const cz = wz(j + 0.5);
        add(`roof:${x1},${j},${f},E:${run}`, () => P.roofSlope({ roof, run }), wx(x1), yT, cz, Math.PI / 2);
        add(`roof:${x0},${j},${f},W:${run}`, () => P.roofSlope({ roof, run }), wx(x0), yT, cz, -Math.PI / 2);
        add(`ridge:${rx},${j},${f}:${run}`, () => P.ridgeCap({ roof, rise }), rx, yT, cz, Math.PI / 2);
      }
      for (let i = x0; i < x1; i++) { endGable(i, z0, 'N', rx, run, rise, f, yT); endGable(i, z1 - 1, 'S', rx, run, rise, f, yT); }
    }
  };
  for (const f of floors) {
    const tops = new Set(spec.cells.filter(c => c[2] === f && !on(c[0], c[1], f + 1)).map(c => c[0] + ',' + c[1])), used = new Set();
    const free = (x, z) => tops.has(x + ',' + z) && !used.has(x + ',' + z);
    const sorted = [...tops].map(s => s.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [sx, sz] of sorted) {
      if (!free(sx, sz)) continue;
      let x1 = sx + 1; while (free(x1, sz)) x1++;
      let z1 = sz + 1;
      const rowFree = z => { for (let x = sx; x < x1; x++) if (!free(x, z)) return false; return true; };
      while (rowFree(z1)) z1++;
      for (let x = sx; x < x1; x++) for (let z = sz; z < z1; z++) used.add(x + ',' + z);
      roofBlock(sx, x1, sz, z1, f);
    }
  }

  for (const [x, z] of spec.porch || []) {
    const cx = wx(x + 0.5), cz = wz(z + 0.5), fz = wz(z + 1);
    add(`porch:${x},${z}`, () => P.porchDeck(), cx, 0, cz);
    add(`porchRoof:${x},${z}`, () => P.roofSlope({ roof: st.roof, run: CELL, rise: PORCH_RISE, overhang: 0.25 }), cx, PORCH_EAVE, fz, 0);
    for (const vx of [x, x + 1]) add(`porchPost:${vx},${z}`, () => P.porchPost(), wx(vx) + (vx === x ? 0.1 : -0.1), FOUND_H, fz - 0.1);
    if (spec.door && spec.door[0] === x && spec.door[1] === z - 1) add(`porchSteps:${x},${z}`, () => P.porchSteps(), cx, 0, fz);
    else add(`rail:${x},${z}`, () => P.fence(), cx, FOUND_H, fz - 0.15);
  }
  for (const [x, z] of spec.drive || []) add(`drive:${x},${z}`, () => P.driveway(), wx(x + 0.5), 0, wz(z + 0.5));
  return out;
}
export { rng, SIDES, rect, hash, pick, buildPlan };
