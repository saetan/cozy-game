# Claude Design handoff

Kit version: 0.2

Never edit files under `design/kit/`: they are vendored from Claude Design; replace the folder to upgrade.
Game-side adaptations belong in `src/kit/index.js` or `src/render/`.

## Upgrade checklist

1. Replace the contents of `design/kit/` with the new handoff (`README.md`, `kit/`, `reference/`; no `.DS_Store`) and bump the version above.
2. Update `src/kit/index.d.ts` for added, removed or renamed exports.
3. Run `npm run typecheck`, `npm test` and `npm run e2e`.
4. Check the kit compatibility test (`tests/kit.test.ts`): if the `kit-plans.json` regression fails, review which plan items changed before updating the fixture.
