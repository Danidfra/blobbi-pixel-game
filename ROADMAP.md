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
facial fidelity. Reports: `docs/milestones/reports/REPORT.md` … `docs/milestones/reports/REPORT-4.md`.

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
time in. Report: `docs/milestones/reports/REPORT-M1.md`.

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

M1 shell refinement (2026-10-09, report `docs/milestones/reports/REPORT-SHELL.md`): the visible
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
break. See also [World growth](docs/specifications/WORLD-GROWTH.md) and the "World growth" section of the [archived README](docs/milestones/reports/README-BEFORE-DOCS-PASS.md).

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

## M2: Gameplay (in progress: M2.1-M2.3 complete; not complete as a whole)

### M2.1: Resource gathering (implemented, awaiting gameplay review)

Report: `docs/milestones/reports/REPORT-M2.1.md`. Images: `examples/gathering/`.
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
- [x] Gameplay review by the user (2026-10-10): approved. Committed locally
      as `89c2c10`.

### M2.2: Basic crafting and tools (complete)

Report: `docs/milestones/reports/REPORT-M2.2.md`. Images: `examples/crafting/`.
- [x] Item registry with stable ids, categories, stack limits, tool types
      and supported interactions (`src/game/items.ts`).
- [x] Recipes as data; the simple axe (3 sticks + 2 stones); atomic
      crafting with validation, no duplication; crafting block in the Play
      panel, C key, feedback (`src/game/crafting.ts`).
- [x] One equipped slot; equip and unequip the axe (Q); persisted.
- [x] Chopping: E with the axe on a tree in front, three hits with shake,
      chips, leaves and a hop; the third fells it, awards wood (new
      material), leaves a stump; no second harvest until regrown; tree
      identity, footprint and navigation untouched.
- [x] Regeneration in world time through the existing growth stages (stump
      20 s, regrow 240 s), continuing across reloads (`src/game/trees.ts`).
- [x] Save schema version 2 (equipped, tree states, world time) with
      migration from version 1; autosave every ten simulated seconds and on
      leaving the page.
- [x] Autonomy never crafts, chops, equips or touches the inventory.
- [x] Tests: 120 passing (10 new); typecheck and build pass.
- [x] Manual gameplay test by the user (2026-10-10): passed.

### M2.3: Visual equipment and interaction polish (complete)

Report: `docs/milestones/reports/REPORT-M2.3.md`. Images: `examples/equipment/`.
- [x] Procedural pixel-art axe: wooden handle, steel head, outline, hand-set
      templates per orientation, mirrored and integer-scaled; no assets, no
      randomness (`src/game/equipment.ts`).
- [x] Equipment layer: hands found on the canonical sprite (the arm drawn
      alone), the tool attached to the right or near hand, following the
      walk cycle and every view; the Blobbi sprite untouched.
- [x] Direction-aware rendering: mirrored for the left, over the shoulder
      in side views, behind the body in the back view, in front otherwise;
      strike up, down or sideways by view.
- [x] Swing: raise, strike (the hit lands inside it, with the shake and
      chips at the impact point), recover; one press per swing; the
      three-hit mechanic and wood award unchanged.
- [x] Inventory icon in the panel and beside the frame counter.
- [x] Tests: 130 passing (10 new); typecheck and build pass.
- [x] Manual gameplay test by the user (2026-10-10): passed, with one
      correction: the axe is in the Blobbi's anatomical left hand in every
      view (viewer's right from the front, viewer's left from the back, the
      near hand facing left, hidden behind the body facing right), with
      regression tests and `scripts/four-directions.ts` as the visual
      regression tool.

### M2.4 and beyond (not started)

Further tools, farming, survival needs, cozy and survival modes, Nostr
events (inventory as kind:31633 through `@nostr-games/inventory`),
multiplayer, payments, world growth (see the requirements above), combat.

## M3: Construction (in progress; not complete)

### M3.1: First building (complete)

Report: `docs/milestones/reports/REPORT-M3.1.md`. Images: `examples/building/`.
- [x] One building kind, the wooden shelter: registry entry with id, cost
      (6 wood + 3 stone), footprint and build time (`src/game/buildings.ts`).
- [x] Placement preview in front of the Blobbi (B), green or red with the
      reason; E places; collision with objects, water, cliffs, resources,
      the Blobbi and other buildings.
- [x] Atomic payment from the inventory; footprint blocked; nav rebuilt.
- [x] Procedural pixel-art shelter with construction stages (posts and a
      log pile, walls rising, roof closing) over 24 s of world time;
      sawdust while building, a bubble when done; E at the door.
- [x] Persistent in the save (schema 3) in island-frame coordinates, so
      future growth never resizes or relocates a building; migration from
      schema 2; reset.
- [x] Autonomy never builds; turtle, Blobbi, equipment, terrain unchanged.
- [x] Tests: 139 passing (9 new); typecheck and build pass.
- [x] Manual gameplay test by the user (2026-10-10): passed.

### M3.2: Pickaxe, mining, renewable resources, 32 px scale lab (complete)

Report: `docs/milestones/reports/REPORT-M3.2.md`. Images: `examples/mining/`, `examples/fidelity32/`.
- [x] Procedural pickaxe (2 wood + 2 sticks + 3 stones), same equipment
      and left-hand rules as the axe; Q cycles owned tools.
- [x] Large rocks (14 px and up) mined in four swings: 3-5 stones, rubble
      that keeps the footprint, whole again after 300 s of world time.
- [x] Renewable sticks, stones and seeds (120 / 180 / 150 s), never under
      a building or the Blobbi.
- [x] Save schema 4 (collection times, rock states) with migration from
      1-3; no coordinate changed.
- [x] Isolated 32 px rendering-scale comparison against the kit's render,
      with scores and a recommendation (6 bands), gameplay unchanged.
- [x] Tests: 151 passing (12 new); typecheck and build pass.
- [x] Manual gameplay test by the user (2026-10-10): passed except one bug,
      fixed: E on a small rock gave no feedback because presses on display
      frames with no simulation step (common at 120 Hz) were dropped; the
      press is now kept until a step consumes it, and the small rock
      answers "too small to mine" with dust and a hop. 157 tests.

### M3.3: Camera and visual LOD (complete)

Report: `docs/milestones/reports/REPORT-M3.3.md`. Images: `examples/camera/`.
- [x] Three camera modes: Overview (1×, the whole turtle, centred on it;
      0.75× with a 12 px Blobbi on screens smaller than the turtle),
      Exploration (2×, follows), Close-up (4×, follows).
- [x] Z cycles (also the wheel and a Camera selector), an in-frame
      indicator, eased transitions (0.4 s, nearest-neighbour throughout).
- [x] Resolution-aware Blobbi: the canonical V3 raster at 12 / 24 / 48 px,
      with expressions, walk frames, gaze and the tool rig at that size;
      never a magnified sprite.
- [x] World magnified by whole pixels only; terrain, objects, buildings,
      footprints and nav unchanged; presentation only (tested).
- [x] LOD: the world rendered over the visible rectangle only, the
      overview reusing the gameplay sprite cache, bounded native caches,
      text and HUD at a fixed UI scale.
- [x] Per-mode render cost measured (`scripts/camera-perf.ts`).
- [x] Tests: 168 passing (11 new); typecheck and build pass.
- [x] Initial manual review (2026-10-10): proportions and feel approved;
      three follow-ups requested before committing.
- [x] Follow-ups (docs/milestones/reports/REPORT-M3.3.md section 9): overview Blobbi drawn at 12 px
      (presentation only; proportions now differ by mode); walking jitter
      fixed at both causes (sub-pixel kit walk motion rasterized as is, now
      whole-pixel rig motion for walking poses; camera and Blobbi rounded
      separately, now one rounding and following in simulation time);
      close-up verified as a native 64 px raster. 178 tests.
- [x] Manual approval (2026-10-10): camera, walk and performance approved.
- [x] One Blobbi-to-world proportion in every mode: drawn natively at 12 /
      24 / 48 px (¾ of its world size at 1× / 2× / 4×, presentation only);
      speech bubbles rest on the drawn head. 181 tests.

### M3.4: Procedural fidelity and identity (approved, committed)

Report: `docs/milestones/reports/REPORT-M3.4.md`. Images: `examples/fidelity/`. Follows the audit
`docs/milestones/reports/REPORT-BLOBBI-PROCEDURAL-AUDIT.md`.
- [x] Gradient pattern drawn: `rect` support, `stop-opacity` composited as
      translucent bands (the belly patch now fades like the kit's, too).
- [x] Freckles drawn: paint inherited from parent groups; tiny dot clusters
      drawn one pixel per freckle once a cluster spans a pixel (24 and
      48 px; under a pixel at 12 px, not drawn).
- [x] Unsupported SVG markup is reported (`svgSupportIssues`) and refused,
      never dropped silently; the kit's output for 150 seeds is clean.
- [x] Canonical V3 identities: a 64-hex V3 seed, or owner pubkey + d tag
      through `@blobbi-kit/core` `deriveBlobbiV3Seed` (pinned 0.9.0); demo
      seeds still work; invalid input refused with a reason.
- [x] Selected Blobbi persisted per browser (survives reloads; camera
      modes never touch it). World saves are schema 5 and state their owner,
      `local-world`; schema 1-4 migrate; inventory never keyed by a Blobbi.
- [x] Tests: 211 passing (30 new); typecheck and build pass.
- [x] Manual review and approval.

### M4: Living Island (implemented, uncommitted, awaiting manual gameplay validation)

Report: `docs/milestones/reports/REPORT-M4-LIVING-ISLAND.md`. Images: `examples/living-island/`
(`npx tsx scripts/living-island.ts`).
- [x] Farming: a simple hoe (1 wood + 2 sticks + 1 stone) tills 8 px grid
      plots on flat grass (island-frame cells, walkable, never over water,
      objects, buildings, resources, a doorway or another plot); turnip,
      carrot and pumpkin with their own seeds, five growth stages, growth
      only while watered (2-3 waterings), all in persisted world time;
      harvest is atomic (all of it or none), counted once, and the plot
      replants.
- [x] Blobbi care: fed / energy / joy (0-100, 100 good), falling gently
      in sim time only; F feeds the smallest food, H pets (cooldown),
      R naps (in the shelter's doorway, twice as fast, when one is built);
      autonomy rests when tired and visits what the player made, never
      eats, harvests or touches the bag; low needs slow the walk a little
      and change the face (kit expressions), nothing harsher.
- [x] Ten objectives derived from a tally of player actions, completed in
      order, rewards (seeds, new crops, decoration plans) granted exactly
      once; a small goal box (O hides it) and a completion notice.
- [x] Decorations through the building system: fence, flower bed,
      lantern, bench, storage crate (+10 stack room, up to two); previews,
      collision, navigation, persistence; B cycles, Esc cancels.
- [x] Game feel: a prompt for what E does, needs bars, water drops on dry
      crops, a glint on ripe ones, harvests that rise, crumbs and hearts,
      sleep Zs, fireflies by lanterns; tiny-font punctuation.
- [x] Save schema 6 (plots, needs, tally, objectives); schema 1-5
      migrate (tally seeded from the record); owner stays `local-world`.
- [x] Dev-only tools (time skip, test kit, needs presets, goal reset,
      crop/needs inspector); absent from the production build.
- [x] Tests: 255 passing (44 new); typecheck and build pass.
- [ ] Manual gameplay validation; then commit.

### M5: The Living World (implemented, uncommitted, awaiting manual gameplay validation with M4)

Report: `docs/milestones/reports/REPORT-M5-LIVING-WORLD.md`. Journal: `docs/milestones/reports/M5-DEVELOPMENT-LOG.md`.
Images: `examples/living-world/` (`npx tsx scripts/living-world.ts`).
- [x] Data-driven content layer (`src/content/`): 115 items with descriptions,
      categories and icons; 11 crops (2 multi-harvest, 3 flowers); 5 forage.
- [x] In-canvas game UI: bag, crafting, cooking, storage, journal, Blobbi
      panel, settings; mouse, keyboard, touch; menus pause and capture input.
- [x] Real storage chests (atomic partial transfers, persistent, independent).
- [x] Building management: move (same id), pick up, restyle, path protection.
- [x] House interior scene (enter/exit, starter furniture, persistence).
- [x] 43 placeables (22 indoors, 26 outdoors) with uses; 66 recipes; 19 meals.
- [x] 33 quests (16 main over two chapters, 14 side, 3 discovery) + 8
      repeatable island requests; 14 lore notes; 8 discoveries; listening
      to the Carrier (its own blink and glance only).
- [x] Friendship and tastes; deeper autonomy (cosmetic only); day and night;
      rain; creatures; sound hooks; copper upgrades; fishing; tap-to-walk.
- [x] Save schema 7 (1-6 migrate); the M3.4 "no save names a Blobbi" kept.
- [x] Dev tools (test world, time, kits, unlocks, inspector); not in builds.
- [x] Tests: 300 passing; the whole story played by a script (all 16 main
      quests from real actions).
- [ ] Manual gameplay validation (M4 and M5 together); then commit.

### M6: Living Archipelago (implemented, uncommitted, awaiting manual validation with M4 and M5)

Report: `docs/milestones/reports/REPORT-M6-LIVING-ARCHIPELAGO.md`. Journal: `docs/milestones/reports/M6-DEVELOPMENT-LOG.md`.
Images: `examples/living-archipelago/` (`scripts/teleport.ts`, `scripts/living-archipelago.ts`,
`scripts/carriers.ts`); audio previews `npx tsx scripts/audio-preview.ts` (to `out/`).
- [x] IMPLEMENTED: cinematic teleportation (depart top to bottom, arrive from
      the sky bottom to top; reversal, cancel, reduced motion, every camera mode).
- [x] IMPLEMENTED: Web Audio engine, 58 synthesized effects, ambience beds and
      life, six-mood generative music; volumes, mute, softer sound.
- [x] IMPLEMENTED: title screen and world selection (never overwrites a save),
      HUD redesign, menu design system, hover, tooltips, toasts, touch stick
      and USE button, safe areas, reduced motion, large HUD text.
- [x] IMPLEMENTED: the Carrier as a companion (listen, greet, observe, offer,
      rest, breathing), non-punitive harmony; save schema 8.
- [x] IMPLEMENTED: island map (N), named places, journal places and Carrier
      observations.
- [x] PROTOTYPE: whale and manta Carriers (deterministic, animated dev preview;
      not playable).
- [x] DESIGNED ONLY: Carrier growth and expansions (data model, never
      applied), archipelago model, Nostr multiplayer, cross-game Blobbi.
- [ ] Manual validation (M4, M5 and M6 together); then commit.

### M7: Living Worlds (implemented, uncommitted, awaiting manual validation with M4-M6)

Report: `docs/milestones/reports/REPORT-M7-LIVING-WORLDS.md`. Journal: `docs/milestones/reports/M7-DEVELOPMENT-LOG.md`.
Images: `examples/living-worlds/` (`scripts/growth.ts`, `scripts/manta-world.ts`).
- [x] IMPLEMENTED: island growth in 3 stages over the carrier's free surface;
      deterministic, versioned, stable coordinates; the turtle untouched.
- [x] IMPLEMENTED: five biomes (meadow, woodland, rocky garden, shore turf,
      mushroom grove) with vegetation, resources, places and discoveries.
- [x] IMPLEMENTED: earned, non-punitive growth progression; growth panel;
      reveal with Carrier reaction, particles, camera and audio.
- [x] IMPLEMENTED: a playable manta world (the second species), with its own
      growth geometry. The whale stays a PROTOTYPE (made playable in M8 phase 0).
- [x] IMPLEMENTED (local prototype): visiting another local world by teleport,
      read-only visitor permissions, return home; WORLDS discovery screen.
- [x] Save schema 9 (growth, species, generator); migration never grows.
- [ ] Manual validation (M4-M7 together); then commit.

### M8 phase 0: the playable whale (implemented, committed `fcf8549`)

Unfinished M7 work, done first in the M8 session.

- [x] IMPLEMENTED: whale worlds (`generateWhaleWorld`, 1280x768): the whale lies
      east-west, head east; island on its back between the blowholes and the
      knuckles, a mossy fringe for a shore; fins and flukes animated, spout and
      blink; its own observations, voice (song; a blow with each spout) and map
      colour. Same systems as every world (no whale-specific engine).
- [x] IMPLEMENTED: whale growth (aft, then both flanks, then further aft;
      about +80-100 % land at stage 3); turtle and manta growth unchanged
      byte for byte (pinned in tests).
- [x] Title: NEW ISLAND offers turtle, manta and whale, each with a picture and
      a line. Saves keep their species (schema 9 already had `species`).
- [x] Tests (`tests/whale-world.test.ts`), images (`scripts/whale-world.ts`),
      docs (WORLD-CARRIERS, WORLD-GROWTH, the test plan, known issues).
- [ ] Manual validation (WHALE-01...12 in docs/testing/MANUAL-TEST-PLAN.md).

### M8 cinematic: the species-aware intro (implemented, committed `fcf8549`)

- [x] IMPLEMENTED: `src/cinematic/` — a reusable intro of about 32 s (19.5 s
      with reduced motion) for the turtle, the manta and the whale on the
      existing renderers, camera scales, teleport and audio engine: the ocean,
      a shape beneath, a species-ordered surfacing behind foam of the BARE
      animal, the island forming on its back from a first patch (soil, ground,
      then life), the Blobbi arriving by the existing teleport, a look around,
      a surprised notice and a happy hello, the message, a handoff into the
      exploration camera's exact framing. Skip by key, click or tap; reduced
      motion; safe cancel; no simulation step, no save touched. Reworked after
      the first manual review (2026-10-11); the manta wing clipping fixed
      (the reveal frames the whole animal).
- [x] IMPLEMENTED: the turtle's small start, shell Variant S for NEW turtle
      worlds (island ≈40 % of the shell, growing to ≈64 % by stage 3; Variants
      0–3 and every existing world byte-identical, pinned in
      `tests/turtle-start.test.ts`; images `scripts/turtle-start.ts`).
- [x] Dev preview (dev tools → Intro cinematic; `#mode=play&intro=whale`),
      frames (`scripts/intro-cinematic.ts` → `examples/intro-cinematic/`),
      tests (`tests/cinematic.test.ts`), docs (CINEMATIC-DIRECTION,
      INTRO-CINEMATIC, M8-CINEMATIC, the test plan, known issues).
- [x] Integrated into the first-time flow and NEW ISLAND (M8, below).
- [ ] Manual validation (INTRO-01...10 in docs/testing/MANUAL-TEST-PLAN.md).

### M8: The beginning and home progression (implemented, committed on `develop`)

Details: docs/milestones/M8.md. All **IMPLEMENTED — AWAITING MANUAL VALIDATION**.

- [x] Delete safety: every world deletion asks first, names the island, refuses a
      too-quick confirm (KI-01 fixed); MY ISLANDS can delete.
- [x] New islands start without the generated cottage (`|house=none` in the
      identity; older worlds byte-identical).
- [x] First-time flow: WELCOME → choose a Carrier (animated cards, a
      personality each) → optional island name → the island is made and its
      intro plays on it → play. Returning: CONTINUE (most recent), MY ISLANDS,
      NEW ISLAND; ABOUT replays the intro on a preview island.
- [x] Save schema 10 (name, intro state, tutorial state, house level and
      look, wall finish); every older schema migrates (tested 1-9).
- [x] Chapter 1 "The First Home": meet, explore, gather, tool, materials,
      build, step inside, first furniture (all three Carriers, tested).
- [x] Three house levels (Cozy Shelter, Cottage, Dream Home) with their own art
      and room layouts; upgrades earned through quests, harmony and finds,
      confirmed on the HOME panel; furniture never lost.
- [x] Home customisation (roof, walls, door, windows, floors, wall colours,
      finishes) with progressive unlocks and previews.
- [x] Contextual tutorial (14 short tips, skippable, saved per island).
- [x] Player guide (16 pages) and touch-first controls (full-screen phones,
      larger wrapped menu bar, mode bar, rotate hint).
- [ ] Manual validation (M8 sections of docs/testing/MANUAL-TEST-PLAN.md).

### M9: Living world and progression (implemented, committed on `develop`)

Details: docs/milestones/M9.md. All **IMPLEMENTED — AWAITING MANUAL VALIDATION**.

- [x] Rest: R goes home, in by the door, into the nearest bed; tucked in; climbs out on waking.
- [x] Turtle flippers emerge from under the shell (Variants B and S, all stages).
- [x] Home styles start small and are earned (padlocked previews, unlock notices, kept styles).
- [x] Growth: four rebalanced stages; stage 4, the Sanctuary (≈80 %+ of the suitable surface,
      anatomy kept clear), growth version 3 with stages 1–3 unchanged.
- [x] World feel: glowing windows, smoking chimneys, growth progress notices.
- [ ] Manual validation (M9 sections of docs/testing/MANUAL-TEST-PLAN.md).

### M10 phase A: The living ocean — foundation, performance, marine life (implemented, committed on `develop`)

Details: docs/milestones/M10.md. All **IMPLEMENTED — AWAITING MANUAL VALIDATION**.

- [x] The listening spot follows the island at every growth stage, on every Carrier.
- [x] Fishing: new rod art, a cast, the line from the rod's tip with correct occlusion.
- [x] A seamless open sea beyond the world's edge.
- [x] Performance: harness, baseline, pixel-identical optimisations, before/after (docs/testing/perf).
- [x] Up close: a fourth camera mode (6×) with a compact HUD; the camera indicator is tappable.
- [x] Marine life: fish, jellyfish, dolphins, a curious seal, a rare glowing ray; Sea friends quest.
- [x] Future ocean architecture written down (docs/architecture/OCEAN-FUTURE.md, DESIGNED ONLY).
- [ ] Manual validation (M10 section of docs/testing/MANUAL-TEST-PLAN.md).

### M10 later phases (not started)

Boats, free navigation, travel between Carriers, fishing regions, underwater exploration and side-view
diving — see docs/architecture/OCEAN-FUTURE.md.

### Later (not started)

Network visiting (world cards and presence, docs/architecture/NOSTR-MULTIPLAYER.md
step 2 onward, each needing approval); biome quests; a
migrated turtle shell enlargement if wanted;
furniture grid and rotation; seasons; chapter 3; shared expressions with the
Standalone; baby and egg stages; multiple Blobbis.
