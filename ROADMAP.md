# Blobbi Pixel Game: roadmap

The original concept: each player inhabits an island carried on the back of a
giant living turtle. This repository is the experimental, playable prototype
that grows toward it one milestone at a time. Nothing here is a production
release.

Note: the ROADMAP.md referenced in the M1 brief was not present in the
repository or the Developer directory when M1 started; this file was created
from the brief's milestone description and records actual progress.

## M0: Procedural pixel art foundations (done, pending visual review notes)

Phases 1–4 of the lab: deterministic islands, vegetation and structures
drawn pixel by pixel; a living world with wind, water, particles, growth;
the canonical Adult V3 Blobbi rasterized with pixel-art rules; world scale;
facial fidelity. Reports: `REPORT.md` … `REPORT-4.md`.

M0 closing items (done at the start of M1):
- [x] Cross-eyed gaze: both irises now share one placement rule and one
      whole-pixel gaze shift; cheeks never paint over eye pixels
      (`tests/gaze.test.ts`).
- [x] Idle, walking and turning preserve the appearance: bounds and anchor
      stability tests through the walk cycle, breathing and turns
      (`tests/fidelity.test.ts`).
- [x] Gallery and gameplay draw through one function
      (`buildBlobbiSprite`); the Fidelity tab shows both sizes side by side.

## M1: The living turtle (implemented, awaiting visual review and approval)

Goal: a small living world that feels peaceful, charming and worth spending
time in. Report: `REPORT-M1.md`.

- [x] The turtle is the island: shell top as terrain, rim, head, neck,
      flippers and tail as anatomy, foam around the whole animal.
- [x] Procedural turtle variation from a turtle seed: shell proportions and
      facets, markings, head and flipper proportions, colours; one species.
- [x] More elaborate terrain on the shell: plateau with cliff and ramps,
      pond with a bank, flower meadows, clearings, forest floor, paths to the
      prow, the pond and the overlook.
- [x] Turtle animation: head bob, blinks, slow glances, flipper paddling,
      ripples; terrain coordinates never move.
- [x] Blobbi autonomy: nav grid and A*, wander / idle / inspect / rest,
      obstacle, water and cliff avoidance; WASD takes over, autonomy resumes
      after 5 s; same movement, collision and animation for both.
- [x] Playground: turtle world mode, world and turtle and Blobbi seeds,
      autonomy toggle, behaviour and destination in the statistics, path
      and nav-grid overlay, turtle gallery.
- [x] Tests: 93 passing, including turtle determinism and anatomy,
      walkable-terrain connectivity, placement, collision, navigation,
      manual override and resumption, coherent gaze, stable animation
      geometry.
- [ ] Visual review and approval by the user. M1 is not marked complete
      until then.

M1 shell refinement (2026-10-09, report `REPORT-SHELL.md`): the visible
shell under the island, as four comparison variants (0 = M1 unchanged,
A/B/C = island covering ≈60/70/80% of a larger shell with procedural
plates, soil and moss), and a minimal World / World Carrier separation
(`src/carrier/`). Head, face, neck, flippers, expressions, animations,
terrain, collision, navigation and the Blobbi are identical in all four
(tested). Baseline commit `ccc2021`. Images in `examples/turtle/variants/`.
- [x] The user selected Variant B (70%) as the default (2026-10-10); the
      other variants stay selectable. M1 committed locally as `0d9e88c`.

Known gaps to review: expression range of the turtle (one head design),
flipper animation is a 1 px paddle, the Blobbi has no sit/sleep pose for
resting beyond closed eyes, the plateau is one level.

## World growth: architectural requirements (documented, not implemented)

The turtle and its playable island must grow over time. Growth is a later
milestone; these are the requirements every milestone before it must not
break. See also the "World growth" section of README.md.

Growth must:
- expand the playable terrain and the turtle's shell;
- preserve existing buildings, object dimensions and Blobbi dimensions:
  nothing is rescaled, a 16 px Blobbi stays 16 px, a house stays where it
  was and as big as it was;
- preserve previously generated terrain: every pixel the player has walked
  on keeps its class, elevation and coordinates;
- introduce new procedural regions beside the old ones;
- stay deterministic: the same seed and the same growth history give the
  same world;
- support future persistence through Nostr: the growth history, not the
  raster, is what gets published.

Design constraints:
- **Stable world coordinates.** The island frame introduced with the World
  Carrier (`carrier.origin`, a whole-cell translation of a frame that never
  changes) is the pattern: new land is added around the old frame, never by
  scaling the world. Coordinates a save file or a Nostr event refers to must
  mean the same place forever; a growth step may enlarge the canvas and
  translate the origin, and that translation is explicit and tested, as it
  is today.
- **Region-based generation.** Terrain, placement and resources are
  generated per region (the current island is region 0) from `(seed, region
  id)` keyed streams, so adding region N never re-rolls regions 0..N-1.
  Shore bands, paths and bridges between regions are resolved at region
  boundaries, the way bridges are resolved off the raster today.
- **The carrier grows with the island.** The shell's radius function is the
  union of the regions' outlines; anatomy part sizes stay fixed (the shell
  fit already separates part sizes from shell size), positions follow the
  edge by whole pixels.
- **Save and protocol state is a history, not a snapshot of pixels:**
  `[{region, seed, unlockedAt}]` plus the player's per-region state. The
  M2.1 persistence record (versioned, keyed by world identity) is the
  seed of this; growth adds a version.
- **Avoid premature complexity.** No region system is built until growth is
  scheduled. Until then: keep generation keyed by seed and feature, keep
  every coordinate in the island frame, keep sizes absolute (never relative
  to the canvas), and keep the carrier the only thing that knows the canvas.

## M2: Gameplay (in progress; not complete)

### M2.1: Resource gathering (implemented, awaiting gameplay review)

Report: `REPORT-M2.1.md`. Images: `examples/gathering/`.
- [x] Resources in the procedural world: sticks under trees, stones by rocks
      and on the forest floor, seeds by bushes and flowers; deterministic,
      on walkable ground, stable ids.
- [x] Collection with E within reach (11 px from the ground point, never
      through a footprint), with pickup animation, sparkles, bubble,
      counter and panel; stack limits with feedback.
- [x] Local inventory (`src/game/inventory.ts`): item ids, quantities, stack
      limits, add/remove, snapshots; shape compatible with
      `@nostr-games/inventory` without reimplementing its protocol.
- [x] Local persistence (`src/game/persistence.ts`): versioned record per
      world identity; collected nodes stay gone across reloads, the
      inventory survives; unrelated worlds never mix; reset button.
- [x] Autonomy never collects; manual control overrides at once.
- [x] Tests: 110 passing (9 new); typecheck and build pass.
- [ ] Gameplay review by the user.

### M2.2 and beyond (not started)

Crafting, tools, building construction, farming, survival, Nostr events
(inventory as kind:31633 through `@nostr-games/inventory`), multiplayer,
payments, world growth (see the requirements above), combat. None is touched
by M2.1.
