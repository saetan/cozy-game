# Cozy Game

A cozy house-building browser game built with three.js. All models are procedural (see `src/kit/kit.js`).

```sh
npm install
npm run dev
```

- `src/main.js` — renderer, camera, loop (starter scene: level path Lv1→7, use ←/→)
- `src/kit/kit.js` — Pastel House Kit (pieces, characters, actions, builder, levels)
- `docs/GAME_DESIGN.md` — game direction, decisions and milestones
- `design_handoff_house_kit/` — original Claude Design handoff: README with conventions & design tokens, interactive reference (`reference/House Kit.html`)

## Tests

- `npm test` runs the Vitest unit/sim tests (`tests/`).
- `npm run e2e` runs the Playwright browser tests (`e2e/`) against an e2e-mode production build (test hooks `window.__game` / `window.__e2e` exist only there and in dev). First time: `npx playwright install chromium`. Report: `npx playwright show-report`.
