# Cozy Game — Game Design

A cozy **village sim with idle progression** for the web browser, built on three.js with the procedural Pastel House Kit (vendored from Claude Design in `design/kit/`; see `design/kit/README.md` for kit conventions and design tokens, `design/README.md` for the version and upgrade rules).

## Pitch

You are the unseen caretaker of a small animal village. You place houses, farm plots, paths and a shared market; residents move in, take on roles and run the village on their own — farming, hauling crates and selling at the market. Coins grow houses, houses bring new residents, and the village keeps living while you're away.

**Core loop**

> more residents → more roles → more produce → coins → new buildings / house levels / land → more residents

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Genre | Village sim (c) + idle/incremental (d). |
| 2 | Player | Unseen caretaker — no avatar. Top-down view, click/tap to select, give priorities. |
| 3 | Control | Player **assigns roles**; residents execute them autonomously on a daily schedule. |
| 4 | Time | **Fast in-game days** (~20 real min) while playing; **real-time catch-up** offline, capped (~8 h), with a "while you were away" summary. |
| 5 | Progression | **Grow the village**: more buildings, house levels, land. Light collection layer (species, crops, vehicles). Residents arrive via house levels (Lv 1/3/6), not purchase. |
| 6 | Economy | **Physical logistics**: farmer → crate at plot → hauler carries/wagons it → shared market → seller → coins. |
| 7 | World | Large chunked grid (chunk = 16×16 cells, cell = 2 m; world size is config, e.g. 1000×1000). Start with **3×3 chunks unlocked**; buy neighbouring chunks with coins. Locked chunks render as wild meadow/fog. Sparse storage. |
| 8 | Building growth | Buildings claim **only their current footprint**. Level-up is **blocked if next level's cells are occupied**; blocking cells shown in red (reuse the reference's next-level ghost). Placement supports **rotation in 90° steps** (plan stays in local cells; group + occupancy rotated). Level cost is a resource map `{ coins: n }` so other resources (wood…) can be added later. |
| 9 | Movement | Residents walk anywhere (A* over a grid; building cells block). **Speed depends on the surface** (grass / path / road, in `balance.json`). **Vehicles unlock with house level** (bicycle Lv2, wagon Lv3, car Lv4 = the garage), one of each per house, shared by its residents and claimed for one walk leg at a time. **Everyone rides**: for each leg a resident takes whichever of walking or a free vehicle is fastest (ties: walk, bicycle, wagon, car). The wagon is for hauling: the carry leg prefers it and it carries 3 crates (the max of trait and wagon, not the sum). **Surfaces** (road scale option C, mixed): every cell has one surface, `grass | path | street | dirtRoad | lane | dirtLane`, each with a speed per mover in `balance.json` (walking, bicycle, wagon, car; m/s). The village centre uses **6 m streets** (asphalt, 18 coins per tile) and **dirt roads** (9), laid on the street grid (tile `(i, j)` covers cells `3i..3i+2` by `3j..3j+2`; the whole block must be unlocked and free of buildings, lanes and paths inside it are replaced); the outskirts and farms use **2 m lanes** (asphalt 2, dirt 1) painted one cell at a time. The **garden path** (1 coin) is **foot only**: vehicles cross it at grass speed (this replaces the old rule that path was the dirt road for vehicles). Cars are fast on streets (8), medium on lanes (5) and dirt roads (4); the bicycle and wagon scale likewise. Buildings cannot stand on street or dirt road cells. **Lane-to-street join rule:** a lane may touch a 6 m tile (street or dirt road) only on a flat edge: not at a junction arm, not on the outer corner of a bend (the kit's auto-tiling decides, from the tile's neighbours); edits that would break an existing join are refused with the reason, and a joined street drops its kerb (lane mouth). Erase removes a whole 6 m tile from any of its cells. Lane traffic rules (one vehicle per lane segment, waiting at the mouth, turning only at junctions) come in a later PR. |
| 10 | MVP catalog | House (7 levels, existing `LEVELS`), Farm plot (1×1, choose crop), Market (2×2, one per village, 3 levels = 1–3 stalls), Roads (Street 18, Dirt road 9, Lane 2, Dirt lane 1, Path 1; Erase is free, no refund), Decor (shrub, fence, scarecrow: 1×1, rotatable, cheap, block walking). Shrub and fence are cosmetic; a **scarecrow** makes plots within 2 cells (Chebyshev) grow 10% faster, applied when the grow events are scheduled, and several scarecrows do not stack. Roles: farmer, hauler, seller, idle. No barn: each plot holds up to 3 crates, then stops producing. |
| 11 | Bootstrap | Residents without a role are **generalists** doing the most urgent job; assigned roles **specialise** (~1.5× at their job). AI = **job board**: plots/crates/market post jobs, residents pick by role preference, then anything. Start: coins for 1 house + 2 farm plots, market Lv1 pre-placed. |
| 12 | Platform | **Desktop first, touch-safe**: no hover-only info; every shortcut has a button; bottom contextual panel; placement with on-screen rotate/confirm. Mobile perf pass (merge/instancing) later. |
| 13 | Save | **Local** (IndexedDB) auto-save + export/import. Single versioned JSON `{ version, savedAt, … }` behind a small `SaveStore` interface so cloud sync can be added later. Clock-changing "time travel" is accepted. Save v4 (road kit): old `road` cells become dirt lanes, paths stay, 6 m tiles start empty. |
| 14 | Simulation | **Event-based, deterministic**: discrete tasks with durations; the sim jumps event to event. Same code runs live and offline. **Sim never reads frame time or three.js**; the renderer reads sim state and interpolates (e.g. walking along a path between t0 and t0+d). Catch-up events feed the away summary. |
| 15 | Stack | **TypeScript** for game code (`sim/`, `systems/`, `save/`, `ui/`); **kit stays JS** with a hand-written `kit.d.ts`. **Vitest** tests the sim headlessly (seed + inputs → expected village). |
| 16 | Residents | Random species/outfit, **generated name** and **one trait** (e.g. Green Thumb +15% crops, Sturdy carries 2 crates, Chatty sells faster, Sleepy starts late). "Someone moved in!" arrival card; resident list. |
| 17 | Scope | Milestones below; balance numbers in `data/*.json`. |

## Architecture sketch

```
src/
  kit/        index.js re-exporting the vendored kit in design/kit/ (core, characters, vehicles, farm, house, roads; JS) + index.d.ts
  sim/        clock, events, world (chunks, cells), buildings, jobs, residents, economy  — pure TS, no three.js
  systems/    pathfinding (A*), placement rules, catch-up, save (SaveStore)
  render/     scene, camera, chunk view, building view (diff by plan key + pop-in), actor view (interpolation)
  ui/         HUD, build menu, selection panel, arrival card, away summary
  data/       buildings.json, crops.json, prices.json, traits.json, names.json
  main.ts
```

Data flow: **input → commands → sim**; **sim state → render/ui** (read-only). The sim is the single source of truth and the only thing saved.

## Milestones

| # | Milestone | Outcome |
|---|---|---|
| M0 | Foundations | Kit split into files; TS + Vitest; chunked world (3×3 unlocked); camera; selection + placement framework with rotation. |
| M1 | Simulation core | Event clock + day cycle, A* with path costs, job board — headless and unit-tested. |
| M2 | First loop | Place house + farm plots; one generalist farms → hauls → sells at the pre-placed market; coins rise; 3D view animates it. |
| M3 | Growth | House level-up with costs, blocked-cell feedback and pop-in; resident arrivals (name, trait, card); role assignment; paths & roads. |
| M4 | Idle | Versioned auto-save, offline catch-up, "while you were away" summary. |
| M5 | Breadth (MVP+) | Market levels, wagon/bicycle hauling, 5 crops unlocking, decor, chunk purchase. |

**MVP done (end of M4):** a new player can start a village, grow to 2+ houses with 3+ residents in different roles, close the tab, return hours later and see the catch-up summary — without errors.

## Initial balance guesses (tune in `data/`)

- In-game day ≈ 20 real minutes; offline cap 8 h.
- Carrot grows in ⅓ in-game day; other crops slower and worth more.
- **Crops (M5a)**, bought with coins to unlock (carrot free): carrot 400 s / 10 coins; cabbage 600 / 16, unlock 100; wheat 800 / 24, unlock 250; tomato 1000 / 34, unlock 500; pumpkin 1400 / 52, unlock 1000. Slower crops pay more per crate and slightly more per second. A plot's crop applies at its next planting; crates keep their crop; the market stocks and sells per crop, most valuable first.
- **Market levels (M5a)**: Lv1–3 = 1–3 stalls = up to that many concurrent sellers. Footprint grows in a fixed 4×2 frame (Lv1 2×2, Lv2 3×2, Lv3 4×2), same blocked-cell rules as houses; level-up costs 300 then 800 coins. No price bonus per level.
- **Land (M5a)**: a locked chunk edge-adjacent to your land costs `300 × 1.5^(chunks bought so far)` coins (rounded): 300, 450, 675, …
- House Lv2 ≈ 2 in-game days of income; each level ≈ 1.6× the previous.
- Specialist ≈ 1.5× generalist at their job; path ≈ 1.5× walk speed.

## Later / out of scope for MVP

Cloud save & accounts · relationships/happiness · chosen arrivals (pick from applicants) · barn/storage · wood & other resources in costs · rule-based free-form house growth · mobile performance pass · possess-a-resident mode.
