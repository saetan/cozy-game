# Handoff: Pastel House Kit (cozy building game)

## Overview
A procedural, low-poly, pastel kit for a cozy house-building game: modular house pieces, a cell-based house builder with a fixed level-up path (cottage → longer → porch → garage → second floor → side wing → deeper), five animal residents with ten actions, three vehicles (car, bicycle, wagon), farm plots with five crops × 3 growth stages, market stall, driveway and drive-in garage.

Target: **web game on three.js** (r0.184 used here). Everything is generated from code — there are no model files to import.

## About the files
- `reference/House Kit.html` — the interactive **design reference** (kit view, random houses, growth/level-up demo, character actions panel, drive-in garage). It shows the intended look, animation feel and behaviour. It is a prototype: its UI panels, tween system and demo state are not production code.
- `kit/kit.js` — the kit extracted as a **single ES module** (pieces, characters, actions, builder, level specs, random house). This *is* intended as a starting point for the game's `/kit` folder — split it into files (pieces / characters / actions / builder / levels) as the first refactor.
- `kit/example.html` — minimal integration: import the module, build a house / the level path / a walking fox, tick animations.
- `three-d-stage.js` — viewer shell used by the reference only (renderer, lights, orbit, OBJ/GLB export). The game should own its own renderer, camera and loop.

Fidelity: **high** — colours, proportions, pitch, animation timing are final-intent. Keep them unless deliberately restyling.

## Suggested repo layout
```
/game
  /kit        pieces.js, characters.js, actions.js, builder.js, levels.js   (from kit.js)
  /systems    grid.js, placement.js, economy.js, crops.js, residents.js (AI/schedules), vehicles.js, save.js
  /ui         hud, build mode, shop, level-up modal
  /data       levels.json, crops.json, prices.json
  main.js     renderer, camera, loop
```
First milestone (vertical slice): one lot, house Lv1→3, two residents walking between door / farm / stall, one farm plot growing over time, sell produce → coins → level up.

## Core conventions (do not break — everything snaps on these)
- Units: **1 = 1 m**, +Y up. **+Z = front / outside.**
- Grid: `CELL = 2.0` m. Cell `(x, z)` spans `[x·CELL, (x+1)·CELL]` before offset. Floors: `f = 0, 1, …`.
- Heights: `FOUND_H = 0.3` (raised floor), `WALL_H = 2.5`, wall thickness `T = 0.2`. Floor `f` base = `FOUND_H + f·WALL_H`.
- Roof: constant pitch `PITCH = RISE / CELL = 0.6`. Half-span `run` (m) → `rise = run · PITCH`. Deeper houses get taller roofs, same angle.
- **Edge pieces** (walls, window/door/garage walls, gables, belt course): pivot = bottom-centre of the **outer face**, lying on the cell edge; body extends to −Z. Place by rotating Y: S `0`, N `π`, E `π/2`, W `−π/2`.
- **Cell pieces** (foundation, porch deck, garage slab, driveway, farm plot): pivot = ground centre of the cell.
- `roofSlope({ run, rise, width })`: pivot on the eave line at the outer wall face, wall-top height; rises toward −Z to the ridge at `z = −run`.
- `ridgeCap({ rise })`: pivot at wall-top height under the ridge.
- `gable({ ridgeAt, run, rise })`: one wall-edge segment; `ridgeAt` = ridge position on the segment's local X.
- Characters & vehicles: pivot = ground centre (between feet), facing +Z. Residents ≈ 1.4 m tall.
- Every mesh and material is **named** (`wall_plaster`, `roof_coral`, `fur_fox`…) — keep names stable; they become node/material names in GLB export.

## House builder (`buildPlan(spec, ox, oz)`)
```js
spec = {
  cells:   [[x, z, floor], …],        // occupied cells
  door:    [x, z],                      // front door on the S edge of that ground cell
  porch:   [[x, z], …],                 // porch cells south of the house (S only for now)
  garage:  { cells: [[x, z], …], door: [x, z] },   // ground-level slab; door on S edge
  drive:   [[x, z], …],                 // driveway tiles
  chimney: columnX | null,
  style:   { plaster, roof, shutters: bool, shutterMat },
  seed:    number                       // window/plain-wall choice = hash(seed, x, z, f, side) — stable across level-ups
}
```
Returns a flat list `{ key, make(), x, y, z, ry }`. Rules:
- Wall on every edge between an occupied and an empty cell (same floor). Door/garage edges substitute their pieces. Walls facing a porch drop the door awning/steps.
- Party wall between garage cells and living cells.
- Corner posts on convex corners only.
- Roofs: per floor, the top-most cells are split into greedy rectangles; each gets a gable roof with the ridge along its longer side. Gable ends skipped where a neighbour cell continues.
- Porches: deck, posts, lean-to roof (`PORCH_RISE = 0.6`), fence rail, steps in front of the door.
- **`key` is stable** (`wall:x,z,f,side:kind`, `roof:…:run`…). Level-up = diff old vs new plan by key: add new keys (pop-in), remove missing keys (shrink-out), keep the rest untouched.

Known limits: porches only on the S side; same-height L-shapes overlap roofs instead of forming a valley piece; no hip roofs.

## Level path (`LEVELS`, fixed)
| Lv | Name | Change |
|---|---|---|
| 1 | Cottage | 2×2, one floor, driveway |
| 2 | Longer | 3×2 |
| 3 | Porch | 2-cell covered porch |
| 4 | Garage | 1×2 attached garage at x = −1 |
| 5 | Second floor | upper storey over 3×2 + chimney |
| 6 | Side wing | 1×2 wing at x = 2, z = 2–3 (L-shape) |
| 7 | Deeper | back row z = −1 on both floors (3 deep) |

In the reference: lot `x −1…4, z −2…5`, offset `ox = oz = −3`; residents join at Lv 1/3/6 (1→2→3).

## Characters
- Species: `bunny, bear, cat, fox, frog` — `resident(species, { outfit, scarf, pose })`.
- Shared rig (all species): root `resident_<sp>` → `rig` → `leg_l`, `leg_r` (hip pivot y 0.28), `arm_l`, `arm_r` (shoulder y 0.7, x ±0.25), `head` (y 1.05). Species differ only in ears/tail/muzzle/colours on the head/body. **New species = new ears/tail/colours on the same rig → every action works.**
- Static poses: `setPose(res, 'stand'|'sit'|'ride'|'push')`.
- Actions: `setAction(res, a)` with `a ∈ stand, walk, wave, carry, work, water, sell, sit, ride, push`. Adds props (crate/hoe/watering can) and sets the base pose. Call `animate(res, t)` every frame (procedural sine-based; `userData.phase` desyncs actors).
- Vehicles expose an empty `rider` node with `userData.pose`; `board(vehicle, res)` parents the resident there and applies the pose.
- Animation timing (from `animate`): walk 7.5 rad/s leg swing ±0.6, bob 0.045; push 5.5 rad/s ±0.45; wave 9 rad/s; work (hoe) 0.9 Hz cycle, 70% raise / 30% strike; ride pedalling 6 rad/s.

**Recommended next step for scale:** convert `animate()`'s per-action code into keyframe data per joint, and build `THREE.AnimationClip`s from it (one `AnimationMixer` per character, crossfade between actions). Same data can be exported in GLB for other engines.

## Vehicles, farm, market, garage
- `car` (bench seat, roof rack), `bicycle` (basket), `wagon` (produce crate). Paints: peach `#f6b89a`, sky `#9fc3ea`, mint `#a6dcc4`, butter `#f3d98a`.
- `farmPlot({ type, stage: 0|1|2|'mixed', seed })` — 1 cell, 3 furrows × 4 plants. `crop(type, stage)`, `produce(type)`; crops: carrot, cabbage, wheat, pumpkin, tomato.
- `crate({ type })`, `marketStall({ awning, panel, goods: [3 types] })`, `scarecrow`, `hoe`, `wateringCan`.
- `driveway`, `garageSlab({ curbs: 'NEW…' })`, `wallGarage` — child `garage_door` hinges at the top; `rotation.x = π/2 · 0.97` = open (swings up and inward).
- Drive-in demo (reference): door opens 0–0.8 s, car moves 0.7–3.2 s (smoothstep) from driveway `z = lwz(3.6)` to garage centre `z = lwz(1.0)`, wheels spin by `Δz / 0.28`, door closes 3.4–4.2 s. In the game this belongs to `vehicles.js` + path-following.

## Level-up animation (reference behaviour)
- New pieces: scale 0 → 1, back-out ease (overshoot 1.7), 0.45 s, staggered bottom-up (`sort by y, then z`, step ≤ 40 ms, total ≤ 1.6 s, 0.25 s initial delay).
- Removed pieces: scale 1 → 0, smoothstep, 0.3 s.
- Next level's new ground cells shown as translucent tiles (`#fbf7f0`, opacity 0.6).

## Design tokens
Plaster: pink `#f2c4bd`, mint `#c4e3cf`, sky `#c5d8ee`, butter `#f4e2b0`, lilac `#d9cbe8`
Roof: coral `#e39a8c`, slate `#93a8c9`, sage `#9fbf98`, plum `#b79ac2`
Trim `#fbf7f0` · wood `#c79d78` · glass `#bfe3ec` · stone `#d6cfc4` · foliage `#b1d3a2` · soot `#8d8580`
Fur: bunny `#f8f3ec`, bear `#d9b28e`, cat `#bcb3c9`, fox `#f2a97c`, frog `#b6dca2` · cream `#fbf3e6` · blush `#f4b3b3` · eye `#3a3230`
Cloth: blue `#a9c4e8`, pink `#f3b3c1`, yellow `#f2d98c`, lilac `#c9b3e0`, mint `#a8d8c0`
Ground/lot: grass `#d3e8c2`, grid line `#eaf4e0`, paving `#e8e1d5`, concrete `#e4ddd2`, background `#f4f0ea`
All materials: `MeshStandardMaterial`, `flatShading: true`, roughness 0.85 default (glass 0.15, paint 0.5).

Reference UI (demo only): panels `rgba(255,253,250,0.92)`, 1px `rgba(58,54,50,0.12)`, radius 10px, Helvetica Neue 12–15px, ink `#3a3632`, active button `#3a3632` on `#fdfbf8`.

## Performance notes for the game
- Pieces are many small meshes sharing ~40 materials. For a town: merge static house geometry per lot (`BufferGeometryUtils.mergeGeometries` grouped by material) after a level-up settles, or use `InstancedMesh` per piece type.
- Keep residents/vehicles as separate hierarchies (they animate).
- Shadows: one directional light; restrict shadow camera to the visible area.

## Files
- `kit/kit.js` — the kit module (import `three` via import map or bundler)
- `kit/example.html` — integration example (open via a local web server)
- `kit/three-d-stage.js`, `reference/three-d-stage.js` — viewer shell
- `reference/House Kit.html` — full interactive design reference
