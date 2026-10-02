# Cozy Game

A cozy house-building browser game built with three.js. All models are procedural, from the Pastel House Kit (`design/kit/`).

```sh
npm install
npm run dev
```

- `src/main.ts` — game entry: wires the sim to the renderer, UI and save
- `src/sim/`, `src/systems/`, `src/render/`, `src/ui/` — simulation, pathfinding/save, three.js views, HUD and panels
- `src/kit/index.js` — the game's single import point for the kit (+ `index.d.ts` types)
- `design/kit/` — Claude Design handoff, vendored untouched: kit modules, README with conventions & design tokens, interactive reference pages. See `design/README.md` for the version and upgrade checklist.
- `docs/GAME_DESIGN.md` — game direction, decisions and milestones

## Tests

- `npm test` runs the Vitest unit/sim tests (`tests/`).
- `npm run e2e` runs the Playwright browser tests (`e2e/`) against an e2e-mode production build (test hooks `window.__game` / `window.__e2e` exist only there and in dev). First time: `npx playwright install chromium`. Report: `npx playwright show-report`.
- CI: pull requests run typecheck + unit tests only. The e2e suite runs in CI on pushes to `main` (split across 4 parallel runners, merged into one `playwright-report` artifact), or on demand from the Actions tab (CI → Run workflow → pick a branch). Run `npm run e2e` locally before opening a PR.
