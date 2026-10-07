# Cozy Game: notes for agents

A cozy village sim with idle progression, in the browser (three.js + the procedural Pastel House Kit).

Read before changing code:
- `docs/ARCHITECTURE.md`: layers, principles, how to add things, known weaknesses.
- `docs/GAME_DESIGN.md`: the game decisions. Update it when a decision changes.
- `design/README.md`: the kit version and how to upgrade it.

## Commands

- `npm run dev`: dev server (has a dev-only "+1000 coins" button).
- `npm run typecheck`, `npm test`, `npm run build`.
- `npm run e2e` (rebuilds, 2 local workers). The port is `E2E_PORT` (default 4173); a run never reuses a server, so a busy port fails with instructions. Running from two worktrees at once: `E2E_PORT=4174 npm run e2e`.

## Rules that must hold

1. **Layers:** input → commands → sim → render/UI (read-only). `src/sim/` never imports three.js, the kit, `render/` or `ui/`, and never reads the clock or `Math.random`.
2. **Numbers and rule options live in `src/data/balance.json`,** read through the owning module's accessor.
3. **One rule, one module, a small interface.** Do not spread a rule across files. `src/sim/traffic.ts` is the model.
4. **Rule variants are named config options** when at least two variants make sense.
5. **Determinism:** one big step equals many small steps; a save round trip equals an uninterrupted run. Cover new state in those tests.
6. **A change to `SimState` needs a save migration** and tests from every older version.
7. **Never edit `design/kit/`.** Adapt in `src/kit/index.js` or `src/render/`.
8. **Test hooks never ship:** after `npm run build`, `grep -rE "__game|__e2e" dist/` finds nothing.

## Testing approach

- Unit-test rules in `tests/`.
- E2E proof is scene inspection at exact sim moments (`__e2e.runUntil`, `plotView`, `residentView`, `roadKeys`), not pixel comparison. Screenshots and videos are evidence only. Use `pauseClock` when timing matters.
- Evidence (screenshots, the farming video) goes to `test-results/` and leaves the tree clean. `UPDATE_EVIDENCE=1 npm run e2e` rewrites `docs/screenshots/`; specs get paths from `evidencePath` in `e2e/helpers.ts`, never name that folder.

## Workflow

- Stop only processes you started yourself in this session, by the PID you recorded. Never kill by port or by name (`lsof -ti :N | xargs kill`, `pkill`): other worktrees and sessions share this machine.
- Work on a feature branch. Never push to `main`; the user merges, or asks for a merge.
- PRs use `.github/pull_request_template.md`. Tick only what you verified, with evidence.
- CI on PRs runs typecheck and unit tests only. Run e2e locally; for rendering or e2e changes, also run the on-demand e2e workflow (`gh workflow run CI --ref <branch>`).
- Found a weakness you are not fixing now? Open an issue labelled `architecture` or `tech-debt` and link it in the tracking issue (#30).
