# Claude Design handoff

Kit version: 0.3

Never edit files under `design/kit/`: they are vendored from Claude Design; replace the folder to upgrade.
Game-side adaptations belong in `src/kit/index.js` or `src/render/`.

## Upgrade checklist

1. Replace the contents of `design/kit/` with the new handoff (`README.md`, `kit/`, `reference/`; no `.DS_Store`) and bump the version above.
2. Update `src/kit/index.d.ts` for added, removed or renamed exports.
3. Run `npm run typecheck`, `npm test` and `npm run e2e`.
4. Check the kit compatibility test (`tests/kit.test.ts`): if the `kit-plans.json` regression fails, review which plan items changed before updating the fixture.

## Versions

- **0.3**: adds `kit/lanes.js` (2 m asphalt and dirt lanes, joins, lane mouths onto 6 m streets, `buildLanes`) and `reference/Road Scale Options.html`. Road scale decision: **option C, mixed**: 6 m streets in the village centre, 2 m dirt lanes painted cell by cell to the farms. All other files are unchanged from 0.2.
- **0.2**: the kit split into modules (core, characters, vehicles, farm, house, roads); thirsty crops; sow / hoe / water; bike stand; road kit.
- **0.1**: the original single-file kit.
