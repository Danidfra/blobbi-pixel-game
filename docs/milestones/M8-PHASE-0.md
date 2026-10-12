# M8 phase 0: the playable whale

**Status: IMPLEMENTED — AWAITING MANUAL VALIDATION** (uncommitted, on top of the `develop` checkpoint).

- **Scope:** finish the M7 work left open: make the whale (the Ridge Carrier, a preview since M6) a fully playable
  World Carrier, on the same systems as the turtle and the manta. Nothing else of M8 was started.
- **Implemented:** whale worlds (`src/carriers/whale-world.ts`); the whale redrawn east-west with its own anatomy,
  individual variation, animation (fins, flukes, spout, blink), observations and voice; whale growth geometry; the
  whale on the title, in WORLDS, on the map and in the dev tools. See [World Carriers](../architecture/WORLD-CARRIERS.md)
  §4 and [World growth](../specifications/WORLD-GROWTH.md).
- **Tests:** 425/425 automated tests in 41 files (16 new in `tests/whale-world.test.ts`: generation, determinism,
  navigation, resources, gathering, building, housing, farming, growth, save and load, teleport, camera modes, voice,
  the title, several seeds, and turtle and manta pinned unchanged); typecheck and build clean; a scripted browser pass
  on port 5200 with a test seed (title, play, growth to stage 1, reload). Manual: NOT TESTED.
- **Saves:** no schema change (schema 9 already stored `species`); a whale world's identity is
  `kind=whale|carrier=<seed>|1280x768|…`, so existing worlds keep their species and their saves.
- **Visual changes:** the whale (in worlds and previews), the NEW ISLAND page with species pictures, the dev tools'
  species preview now landscape. Images: `examples/whale-world/` (`npx tsx scripts/whale-world.ts`).
- **Limitations:** [known issues](../testing/KNOWN-ISSUES.md) KI-04, KI-06, KI-08, KI-14 … KI-17.
- **Follow-up fix (2026-10-11), after the first manual observation "the Growth button does nothing" on a whale:**
  the muted NOT READY YET button closed the growth panel silently (a UI hit-testing bug, every species); the dev
  growth buttons refused non-test worlds almost invisibly; dev stage changes had no reveal. Fixed, plus the post-reveal
  glow, a whale-only growth version 2 so the stage-3 grove is never walled off, and button-to-world tests
  (`tests/growth-flow.test.ts`). Details: [known issues](../testing/KNOWN-ISSUES.md), [world growth](../specifications/WORLD-GROWTH.md).
- **Remaining:** WHALE-01 … WHALE-12, TITLE-05, GROW-08, REG-06 in the [test plan](../testing/MANUAL-TEST-PLAN.md).
