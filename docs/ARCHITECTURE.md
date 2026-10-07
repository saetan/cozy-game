# Architecture

How the code is organised, the rules that keep it easy to change, and the known weaknesses. Game decisions are in [GAME_DESIGN.md](GAME_DESIGN.md). Work in progress is tracked in [issue #30](https://github.com/saetan/cozy-game/issues/30).

## Goal

New rules and features should be cheap to add. Values and rule options should be changeable without a rebuild, and in time live in the running game.

## Layers

Data flows one way:

```
player input ──► commands ──► SIM (rules, state) ──► render / UI (read-only)
                                   ▲
                          src/data/balance.json (numbers and options)
```

| Layer | Folder | Owns | Must not |
|---|---|---|---|
| Data | `src/data/` | Every number and rule option: `balance.json`, `houseLevels.json`, `world.json` | Contain logic |
| Sim | `src/sim/` | The game rules and the state. Deterministic and event-based: it jumps from event to event | Import three.js, the kit, `render/` or `ui/`; read `Date.now`, `performance.now` or `Math.random` (a test scans for this) |
| Systems | `src/systems/` | Pathfinding, placement, save and migrations, offline catch-up | Hold game rules that belong to a sim module |
| Render | `src/render/` | Draws the sim with the kit; pure sim → kit mappings in `mapping.ts` | Change sim state |
| UI | `src/ui/` | HUD, tools, panels | Change sim state directly: it sends commands through `game.apply` |
| Kit | `design/kit/` | Claude Design's models and animations, vendored untouched | Be edited: replace the folder to upgrade (see `design/README.md`) |
| Wiring | `src/main.ts`, `src/game.ts` | Startup, the frame loop, test hooks | Hold rules |

### Sim modules

| File | Owns |
|---|---|
| `state.ts` | The shape of a village (`SimState`). Plain data, so it can be saved |
| `commands.ts` | Everything the player can do. A command validates, charges and changes state, or fails with a reason and changes nothing |
| `jobs.ts` | The job board: which jobs exist and who picks which |
| `economy.ts` | What residents do step by step: schedule, walking legs, job steps and their effects |
| `vehicles.ts` | Which vehicle a resident takes for a leg |
| `traffic.ts` | Lane traffic: segments, capacity, waiting. The model for a rule module (see below). |
| `surfaces.ts` | Road surfaces, the 6 m street grid and the lane-join rule |
| `crops.ts`, `traits.ts`, `decor.ts`, `levels.ts`, `costs.ts`, `clock.ts` | Small lookups over `balance.json` |

## Principles

1. **The sim is the single source of truth.** Only the sim is saved. Render and UI read it.
2. **Determinism.** The same seed and commands give the same village. One big step equals many small steps, and a save round trip equals an uninterrupted run. Tests check both, and they must cover any new state.
3. **Numbers live in `balance.json`,** never in code.
4. **A rule lives in one module, behind a small interface.** Other modules ask it questions; they do not copy its logic. Adding a rule should mean changing that module and its tests.
5. **Rule variants are config options, not code edits.** When a rule has two or more sensible variants, give it a named option in `balance.json` and implement each variant. Do not add an option nobody can name a second value for.
6. **Config is read through an accessor,** one per module for now (for example `trafficConfig()`), so tests can override it and it can become live-editable ([#22](https://github.com/saetan/cozy-game/issues/22)).
7. **Changing `SimState` needs a save migration.** Bump `SAVE_VERSION`, add a `vNToVN+1` step chained after the others, and test it from every older version.
8. **The kit is vendored.** Game-side adaptations go in `src/kit/index.js` or `src/render/`. Missing or awkward kit pieces become a request for the next handoff.

### The three levels of "configurable"

| Level | Use it for | Example |
|---|---|---|
| 1. A number in `balance.json` | Tuning | A car's speed on a street; a crop's price |
| 2. A named option in `balance.json` | Choosing between rule variants | `traffic.lane.whenBusy`: `wait`, `waitOrWalk` or `ignore` |
| 3. A module behind an interface | New kinds of rule | One-way lanes: a change inside `traffic.ts` |

## Adding things

**A new number or option:** add it to `balance.json`, read it in the module that owns the rule, add a test.

**A new rule:** find the module that owns that area, or create one in `src/sim/`. Give it a small interface, put its options in `balance.json`, and unit-test each option. Include a test that the default gives today's behaviour, when the default is meant to change nothing.

**A new building, crop or vehicle:** data in `balance.json`; behaviour in the owning sim module; a kit piece in `render/`; a button or panel in `ui/`; a save migration if the state shape changes.

**A new kit handoff:** follow `design/README.md`.

## Testing

- **Unit tests** (`tests/`, Vitest): sim rules, mappings, save migrations, determinism. They run on every PR.
- **E2E tests** (`e2e/`, Playwright): the real game in a browser. Proof is **scene inspection at exact sim moments**, not pixels:
  - `__e2e.runUntil(pred)` steps the sim event by event until a condition holds;
  - inspection hooks (`plotView`, `residentView`, `roadKeys`, `housePieceKeys`, `countNamed`) report what is actually drawn;
  - screenshots and videos are evidence for the PR, not pass/fail gates;
  - specs that check timing pause the fake clock with `pauseClock` (`e2e/helpers.ts`), because it keeps flowing in real time otherwise.
- **CI:** PRs run typecheck and unit tests. The full e2e suite runs on pushes to `main`, split across 4 runners, and on demand (Actions → CI → Run workflow). Run `npm run e2e` locally before opening a PR; for PRs that change rendering or e2e tests, also trigger the on-demand run.
- Test hooks (`window.__game`, `window.__e2e`) exist only in dev and e2e builds. `grep` for them in `dist/` after a normal build must find nothing.

## Known weaknesses

Tracked in [#30](https://github.com/saetan/cozy-game/issues/30). When you find a new one, open an issue with the `architecture` or `tech-debt` label and link it there.

| Weakness | Issue |
|---|---|
| Config is imported at build time by many files, so nothing can be changed live | [#22](https://github.com/saetan/cozy-game/issues/22) |
| Rules written in code: role fallback, job priority, wagon preference | [#23](https://github.com/saetan/cozy-game/issues/23) |
| `economy.ts` mixes schedule, movement, job steps and effects | [#24](https://github.com/saetan/cozy-game/issues/24) |
| Vehicles have no position: no parking, bike stand hidden, no turn-around rule | [#26](https://github.com/saetan/cozy-game/issues/26) |
| The lane mouth on dirt roads is a game-side placeholder | [#27](https://github.com/saetan/cozy-game/issues/27) |
| E2E runs rewrite tracked evidence files; stale preview server; flaky parallel runs | [#28](https://github.com/saetan/cozy-game/issues/28) |
| Unbounded log; small performance items; crate labels on abort | [#29](https://github.com/saetan/cozy-game/issues/29) |
