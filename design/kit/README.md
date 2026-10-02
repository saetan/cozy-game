# Handoff: Pastel House Kit (cozy building game)

## Overview
A procedural, low-poly, pastel kit for a cozy house-building game: modular house pieces, a cell-based house builder with a fixed level-up path (cottage → longer → porch → garage → second floor → side wing → deeper), five animal residents with ten actions, three vehicles (car, bicycle, wagon), farm plots with five crops × 3 growth stages, market stall, driveway and drive-in garage.

Target: **web game on three.js** (r0.184 used here). Everything is generated from code — there are no model files to import.

## About the files
The kit is split into **five kits** (ES modules in `kit/`) plus one interactive reference page per kit in `reference/`:

| Kit | Module | Reference page | What's in it |
|---|---|---|---|
| House | `house.js` | `House Kit.html` | walls, roofs, porch, chimney, fence, shrub, garage, driveway, **bike stand** placement, `buildPlan`, `LEVELS`, random house |
| Road | `roads.js` | `Road Kit.html` | road/dirt tiles, junctions, roundabouts, garden paths, `connectLot`, car drivers |
| Character | `characters.js` | `Character Kit.html` | 5 species on one rig, poses, **action registry** (`defineAction`), `setAction` / `animate`, arm IK helpers |
| Vehicle | `vehicles.js` | `Vehicle Kit.html` | car, bicycle, wagon, **bike stand**, `board` / `alight` / `parkBike` / `unparkBike` / `slotWorld`, `walkBike` action |
| Farm | `farm.js` | `Farm Kit.html` | plots, crops (+ thirsty), produce, crate, market stall, scarecrow, hoe, can, seed pouch, `carry` / `sell` / `sow` / `hoe` / `water` actions |

- `core.js` — shared by all: grid constants, materials (`M`, `PLASTER`, `ROOF`, `PAINT`, trim/wood/glass/stone/leaf), mesh helpers (`box`, `grp`, `ico`, `cone`, `bar`), RNG/hash, easing, and the shared piece registry `P` (each kit registers its pieces on it).
- `kit.js` — barrel: `import * as Kit from './kit/kit.js'` gets everything except roads (import `roads.js` separately).
- Dependency order (no cycles): `core → characters → vehicles, farm → house → roads`.
- Kits register their own actions, so the Character kit has no knowledge of hoes or bikes — add new actions in the kit that owns the prop.
- Reference pages are prototypes (UI panels, tweens, choreography are demo code). `three-d-stage.js` is the viewer shell they use — the game should own its own renderer, camera and loop.

Fidelity: **high** — colours, proportions, pitch, animation timing are final-intent. Keep them unless deliberately restyling.

## Suggested repo layout
```
/game
  /kit        core.js, characters.js, vehicles.js, farm.js, house.js, roads.js, kit.js   (copy as-is)
  /systems    grid.js, placement.js, economy.js, crops.js, residents.js (AI/schedules), traffic.js, save.js
  /ui         hud, build mode, shop, level-up modal
  /data       levels.json, crops.json, prices.json
  main.js     renderer, camera, loop
```
First milestone (vertical slice): one lot, house Lv1→3, two residents walking between door / farm / stall, one farm plot growing over time, sell produce → coins → level up.

## Bike stand (house + vehicle kits)
- `P.bikeStand({ slots = 2, paint })` — front-wheel rack, one 2 m cell, pivot at ground centre, **entry side +z**. Each slot is an empty `bike_slot_<i>` at the parked bike's pivot + heading (nose in).
- House spec: `bikeStand: [x, z]` or `[x, z, slots]` → plan item `bikeStand:x,z:n`. `LEVELS` use `[3, 1]` (east of the house, beside the front). `connectLot` treats that cell as blocked so the footpath routes around it. The random house usually gets a stand with 0–2 bikes.
- Parking: `parkBike(stand, bike, i)` parents the bike to the slot; `unparkBike(bike, parent)` keeps the world transform. `slotWorld(stand, i)` → `{ pos, ry, approach }` (approach = 1.4 m out of the entry side).
- Choreography in `Vehicle Kit.html`: ride to `approach` → `alight` → `walkBike` (resident at bike-local `WALK_BIKE_OFFSET`, one hand on the grip) into `pos` → `parkBike` → walk to door … reverse to leave.

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

## Roads & paths add-on (`kit/roads.js`)
Separate module that imports from `kit.js` (`CELL, M, box, grp, hash, P`). In a split repo, point those imports at the new modules. Reference: `reference/Road Kit.html` (Pieces / Street / Town views).

**Grids.** Roads use a coarse tile grid: `TILE = 6 m = 3×3 house cells`. Tile `(i, j)` covers cells `x 3i…3i+2, z 3j…3j+2`, centre `((i+0.5)·6 + ox, (j+0.5)·6 + oz)`, so road tiles and house lots share one origin. Garden paths stay on the 2 m cell grid.

**Road profile (per tile edge).** Asphalt half-width 2.0 (two 2 m lanes), kerb 0.15 wide × 0.16 high, sidewalk 0.85 deep × 0.15 high. Asphalt top `ASPH_H = 0.04`, dirt top `DIRT_H = 0.03`, path top 0.03. Dirt road: 3.2 m wide, two ruts at ±0.8.

**Auto-tiling.** `buildRoads(tiles, { ox, oz, cuts, seed })` with `tiles = [{ i, j, type: 'road'|'dirt', round? }]`. Each tile reads its 4 neighbours → piece:
- 0 → plaza/patch · 1 → dead end · 2 opposite → straight · 2 adjacent → **curved bend** (arc centred on the shared tile corner, centre-line radius 3 m) · 3 → **T** · 4 → **cross** · 3–4 with `round: true` → **mini-roundabout** (island r 1.1, lane ring r 2).
- Junctions get zebra crossings on road arms; sidewalk corners between two connected arms are quarter-round kerbs (r 1).
- Road ↔ dirt joins: dirt neighbours count as connections; the road arm gets a dirt spill, no crossing.
- `cuts: [[x, z], …]` = lot cells right beside a road tile → that 2 m sidewalk segment becomes a **dropped kerb** (driveways).
- Returns items `{ key, make(), x, y, z, ry, tile, conn }` like `buildPlan`; `key` encodes the neighbour signature, so editing the network re-makes only changed tiles (same diff/pop-in flow as level-ups).
- Single pieces: `roadTile({ conn, round, cuts })`, `dirtTile({ conn, seed })`, `pathTile({ conn, style: 'gravel'|'stones', flowers })`, `picket({ gateL, gateR })`, `mailbox()`.

**Lot → road.** `connectLot(spec, { lot: {x0,x1,z0,z1}, ox, oz, style, fence, mail, blocked })` — lot fronts the road on its S edge (road tiles start at row `z1 + 1`; rotate the lot group for other sides).
- Extends the driveway to the lot front and returns `cuts` to pass to `buildRoads`.
- Routes the footpath from the door (or below the porch steps) to the front row: Dijkstra on cells, cost 1/step + 0.6/turn, avoiding house, porch, garage, driveway and `blocked` (farm plots etc.). Re-run on every level-up; keys are stable so unchanged path cells don't animate.
- Ties the path into the driveway when they touch near the door; adds a picket fence with gate posts and a mailbox.
- Returns `{ items, path, drive, cuts, walk }`; `walk` = polyline (door step → path cells → sidewalk) for resident walking.

**Driving.** `laneCurve(item, inSide, outSide)` → tile-local lane polyline (right-hand traffic, lane offset 1.0; dirt 0.45). Bends/turns are cubic Béziers; roundabouts circle the island; same side in/out = U-turn. `makeDriver(items, vehicle, { speed, seed })` → `tick(dt)`: random wander, picks a new exit at every tile, spins `wheel` nodes. Reference behaviour for `systems/vehicles.js` — swap random choice for A* over tiles when cars need destinations.

**Procedural layout.** `randomNetwork(seed, w, h)`: main street + side streets (≈35 % dirt) with optional bends, at least one crossing, roundabouts on ~30 % of road junctions.

**Road tokens.** asphalt `#bcb5bb` · centre line `#f3d98a` · zebra `#fbf7f0` · kerb `#d6cfc4` · sidewalk `#ebe4d8` / joint `#d9d1c4` · dirt `#dfc7a3` / rut `#cfb38d` · gravel `#efe5d4` · stepping stone `#ddd5c9` · tuft `#b5d6a0` · mailbox `#9fc3ea`.

## Farming (`kit/farm.js`)
Reference: `reference/Farm Kit.html` (young vs thirsty crops, watered vs thirsty plot, one resident per animation, full sow → hoe → water sequence; speed buttons test cut-offs).

**Thirsty crops.** `crop(type, 1, { thirsty: true })` or `cropThirsty(type)` — same footprint as the young stage; leaves are two-segment (`*_blade` + `*_tip`) and fold over, colours `foliage_thirsty #d9cd7c` / `foliage_thirsty_tip #dcb57c`. Other stages ignore the flag.
`farmPlot({ …, thirsty: true, marker })` — dry soil (`soil_dry #e8d6bd`, `soil_furrow_dry #dcc4a6`), stage‑1 crops wilted, and a floating water drop (`marker_water`, ~0.6 m, at y 1.7; `marker` defaults to `thirsty`). Tick with `animateMarker(obj, t)` (bob ±0.08 m at 2.4 rad/s, spin 1.2 rad/s). Read: soil tint + leaf colour + drop all change together, so it holds up at iso 15–25 m.

**Props.** `P.seedPouch()` / `makePouch(cloth, tie)` — 0.13 m cloth sack, pivot at its base (sits in the palm). Hoe and watering can unchanged.

**Actions** — `setAction(res, 'sow' | 'hoe' | 'water')` then `animate(res, t)`. `'work'` is kept as an alias of `'hoe'`. All three are pure functions of `t` (no state), so they loop seamlessly and can be cut at any frame; particles live in `parts.fx` (child of the resident root) and are removed by the next `setAction`.
- `sow` — 1.2 s. Left hand holds the pouch at the chest (kept upright), right arm: grab 0–18 %, sweep out 18–55 % (smoothstep), hold, return 65–100 %. Torso twists −0.12 → +0.22 rad with the sweep (legs counter-rotate so feet stay planted). 14 seed particles leave the hand at 43 %, ballistic, settle on y 0.17 and vanish at 1.05 s.
- `hoe` — 0.9 Hz. Raise 70 % (smoothstep), strike 30 % (accelerating, `1 − u²`). Hoe is parented to the `rig`; the right hand is the grip point and both arms are IK‑aimed (`aimArm`) onto the handle (left hand 8 cm behind). Handle pitch −0.4 → +0.85 rad, body lean +0.1 → −0.04 rad, bob 0.028 m.
- `water` — 0.5 Hz sway: torso twist ±0.32 rad + arm swing ±0.12 rad, can tilted 0.7 ± 0.06 rad to pour, head follows. 18 droplets stream from the rose (re-sampled from the can each frame).
- Particle ground height is `GROUND_FX = 0.17` (furrow top, resident standing on the same ground as the plot).
- Game wiring: planting step = `sow` then `hoe`; plot needs water → `farmPlot({ thirsty: true })`; watering step = `water`, then rebuild the plot without `thirsty`.

## Performance notes for the game
- Pieces are many small meshes sharing ~40 materials. For a town: merge static house geometry per lot (`BufferGeometryUtils.mergeGeometries` grouped by material) after a level-up settles, or use `InstancedMesh` per piece type.
- Keep residents/vehicles as separate hierarchies (they animate).
- Shadows: one directional light; restrict shadow camera to the visible area.

## Files
- `kit/core.js`, `kit/characters.js`, `kit/vehicles.js`, `kit/farm.js`, `kit/house.js`, `kit/roads.js` — the kits (import `three` via import map or bundler)
- `kit/kit.js` — barrel re-export (+ `actorScene` demo helper)
- `kit/example.html` — integration example (open via a local web server)
- `reference/House Kit.html`, `Road Kit.html`, `Character Kit.html`, `Vehicle Kit.html`, `Farm Kit.html` — one interactive reference per kit
- `kit/three-d-stage.js`, `reference/three-d-stage.js` — viewer shell (reference only)
