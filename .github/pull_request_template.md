## Why

<!-- What problem does this solve? Describe the problem, not the solution.
     Keep "Closes #<number>" with the issue number, or delete that line if there's no issue. -->

Closes #

## What Changed

<!-- Replace each "-" with real bullets. Write "None" rather than leaving a list empty. -->

**Smallest useful change:**

-

**Intentionally left unchanged:**

<!-- Out of scope, deferred to another issue, or deliberately not touched. -->

-

## Validation and proof

<!-- Tick an item only if you verified it, and add evidence under it: commands run, test counts, screenshots, reviewer name.
     Say which commit each piece of evidence was measured on. E2E evidence is the link to a CI run whose e2e jobs ran (not one where they were skipped), not a local count.
     If an item doesn't apply, leave it unticked and write "N/A: <reason>" under it. Never delete an item. -->

- [ ] **Focused tests pass**: tests for the new or changed behaviour
- [ ] **Existing control behaviour is covered**: existing tests still pass, and behaviour that must not change is protected by a test. For each "never", "always" or "unchanged" claim under What Changed, name the test and the one-line code change that makes it fail; you must have run it.
- [ ] **UI proof is attached when relevant**: screenshot or recording for any visible change
- [ ] **A fresh reviewer or agent reviewed the diff**: someone other than the author (name the reviewer)

<!-- Always fill in the next two lines. They are statements, not boxes to tick. -->

**Not verified:** <!-- what was not run or could not be checked, including other ways to start the tool. "Nothing" only if true. -->

**How to see it:** <!-- the steps or scenario that show the change working in the running game. "N/A: <reason>" if there is nothing to see. -->

## Architecture check

<!-- See docs/ARCHITECTURE.md. Tick what holds; for anything that doesn't, fix it here or link a new issue labelled `architecture` or `tech-debt`. Write "N/A: <reason>" for docs-only or CI-only PRs. -->

- [ ] **Numbers and rule options are in `balance.json`**, not in code
- [ ] **Each rule lives in one module** behind a small interface; nothing reaches around it
- [ ] **Layers hold**: the sim imports no rendering or clock; render and UI don't change sim state
- [ ] **State changes have a save migration**, and determinism tests cover the new state
- [ ] **Follow-ups are tracked**: every weakness under "Intentionally left unchanged" has an issue number next to it, linked from #30
