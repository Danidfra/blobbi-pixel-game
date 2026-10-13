# Known issues

Issues known at the end of M7 and M8 phase 0, the playable whale (2026-10-11), found in the code, in automated runs or while writing these docs. None
of them comes from a person's playtest, because none has happened yet ([manual test plan](MANUAL-TEST-PLAN.md)).

Severity: **High** (can lose player data) · **Medium** (wrong or confusing in play) · **Low** (cosmetic or a missing
nicety).

| ID | Severity | Area | Issue | Where | Suggested fix |
|---|---|---|---|---|---|
| KI-03 | Medium | Saves (disclosure) | During M6 development the pre-existing `seed=blobbi` world on the dev server at port 5199 was opened in Play mode, so its save was most likely migrated to schema 8 (the Carrier bond started fresh; nothing else changes in that migration). It has since loaded under schema 9 too if played again. | browser localStorage on `localhost:5199` | Check that world by hand; there is no backup. |
| KI-04 | Medium | Content | Several lore notes (carriers, keepers, carrier-stone, where-to, restoring, treasure, carving) speak of the turtle, also on manta and whale worlds; two of the Carrier's hum lines mention its shell (`HUM_LINES`). | `src/content/lore.ts`, `src/game/carrier.ts` | Species-aware note and hum text. |
| KI-05 | Low | Quests | The "Collector" quest asks for 8 finds; it was written before the 5 grown-land discoveries, which also count, so it can complete before all 8 base finds. | `src/content/quests.ts` (`discover-all`) | Count base discoveries only, or reword. |
| KI-06 | Medium | Fishing | On manta and whale worlds the sea is out of the cast's reach (the line only carries over the rim and the shore band, and the creature's skin lies between the shore and the sea), so only ponds can be fished. | `LiveWorld.fishTarget` | Let the line carry over `SKIN` (and the whale's moss), or add fishing spots on the creature. |
| KI-07 | Medium | Visiting | A visitor walks with the host world's companion state; the visitor's own needs and care are not carried over (and nothing is saved). | `src/playground/main.ts` (`startVisit`), `LiveWorld` | Carry the visitor's needs into the host world. |
| KI-08 | Low | Map | On creature worlds the map draws the island and the still body only: not the manta's wing tips, nor the whale's fins and flukes. | `src/ui/screens/map.ts` | Draw the creature outline. |
| KI-09 | Low | Growth | Turtle growth is modest (about +20 % land on Variant B), because the shell is never changed. | `src/world/growth.ts` | A versioned shell enlargement with a migration (not designed yet). |
| KI-10 | Low | Visiting | The first preview of each world in WORLDS takes up to about a second to generate. | `src/ui/screens/worlds.ts` | Generate previews in idle time or cache them. |
| KI-11 | Medium | Audio | Audio has never been heard by a person; levels were measured offline and the engine was checked in Chrome only. | `src/audio/*`, `scripts/audio-preview.ts` | Tune by ear (AUDIO-01…06). |
| KI-12 | Medium | Touch | Touch controls were checked in headless Chrome's phone emulation only (844×390, 667×375, 568×320 landscape; portrait shows a rotate hint), never on a phone or tablet. | `src/ui/touch.ts`, `src/ui/game-ui.ts` | TOUCH-01 … TOUCH-06 on real devices. |
| KI-13 | Low | Carrier | `src/game/carrier.ts` still holds the M6 Carrier "age" model; it is labelled design-only and no longer shown, but it is a second, unused notion of growth. | `src/game/carrier.ts` | Remove or merge with real growth. |
| KI-14 | Low | Whale | A whale's young island holds 5–8 discoveries depending on the seed (turtle 8, manta 7–8): on a seed with fewer than 8, the "Collector" quest needs the grown-land finds of later stages. | `src/game/discoveries.ts` (spacing rules) | Allow a whale's finds a little closer together, or count base finds only (KI-05). |
| KI-15 | Low | Whale | Named places: a whale has no tail place (only the turtle has one) and no place for its knuckle ridge or spout; the map and journal list the island's own places and the grown regions. | `src/game/places.ts` | Species places (the spout, the knuckles). |
| KI-16 | Low | Whale | The whale was checked on rendered frames and in a scripted browser pass on a test seed, never played by a person: its look (shading, fins, spout), its scale against the Blobbi and its sounds are unreviewed. | `src/carriers/whale.ts` | WHALE-01 … WHALE-12. |
| KI-17 | Low | Title | The species pictures on NEW ISLAND loop every 12 s; the whale's (6.5 s beat) and manta's (3.6 s) animations jump once per loop. | `src/playground/main.ts` (`preview`) | Loop each species on a multiple of its own beat. |
| KI-20 | Low | Intro cinematic | The whale's spout is on its existing 11 s breath cycle, so during the intro it is seen somewhere in the Carrier and island scenes rather than at a directed beat; the turtle and manta moments are directed. | `src/cinematic/intro.ts` (`watchSpout`), `src/carriers/whale.ts` (`whalePose`) | Accept, or flex the ocean scene's length to the next breath. |
| KI-21 | Medium | Intro cinematic | Never watched or heard by a person at real speed: the formation's pace, the soil front's density, the shadow's tone, the arrival's timing, the message's legibility and the sound mix are tuned on rendered frames and headless-Chrome passes only. | `src/cinematic/*`, `examples/intro-cinematic/` | INTRO-01 … INTRO-12. |
| KI-22 | Low | Intro cinematic | The Blobbi's look-around is a turn of the body each way with the gaze following (the animator has no head-only turn); the message is English capitals (the tiny font has no lower case). | `src/cinematic/intro.ts` (`plan`) | A richer idle when the onboarding defines one. |
| KI-23 | Low | Manta | The manta's tail whip is generated to about 130 px above the top of its 1024×768 world canvas (`mantaBody`: `cy − 0.34·C − tail`), so the canvas truncates it: in play's overview and in the cinematic the whip ends in a straight cut at the world's top edge. World geometry: not changed by the cinematic session. | `src/carriers/manta.ts` (`mantaBody`, whip), `src/carriers/manta-world.ts` (`cy = 0.47·h`) | A taller canvas or a shorter whip for new manta worlds, as a versioned generation change (existing manta identities keep their canvas). |
| KI-24 | Low | Intro cinematic | The turtle's bare shell is painted with its seeded seams as if the land were a seed-sized patch: the plates radiate from the shell's centre, and the ring just outside the real island differs a little from the final shell (its outer row sits further out) until the land's edge forms over it. | `src/cinematic/layers.ts` (`bareCarrierUnderlay`) | A dedicated bare-shell plate layout if the radiating centre reads wrong at real speed. |
| KI-25 | Low | Turtle | The lab's default world (a link without `variant`, seed `blobbi`) and the dev tools' test worlds stay on Variant B; only NEW ISLAND and the intro preview make Variant S turtles, by design (existing dev saves keep working). A player who starts from the bare lab link therefore gets the old, larger island. | `src/carrier/types.ts` (`DEFAULT_SHELL_VARIANT`, `NEW_WORLD_SHELL_VARIANT`), `src/playground/main.ts` | Switch the lab default to Variant S once the M4–M7 validation on Variant B worlds is done. |
| KI-26 | Low | Manta | When a wing is raised (wing phase above about 0.5) its tip is drawn with a flat vertical face up to about 27 world px tall instead of a point: the tip vertex moves toward the viewer between its two neighbouring outline points and the outline is a Catmull-Rom spline through the tip with only four straight pieces per segment, so one straight piece stands vertical at the tip. The body is complete (no pixel is clipped: the whole animated extent, x 41–983 of the 1024 px canvas, is drawn and framed), and the face is the same in play as in the cinematic. Not changed by the cinematic session: the same outline at rest defines the still disc, the terrain's skin and the sea's bands, so a change would alter every manta world's terrain. | `src/carriers/manta.ts` (`outline`, `smoothClosed(pts, 4)`) | A sharp vertex at the tip, or finer subdivision there, as a versioned generation change (or applied only beyond the still disc, keeping the rest outline byte-identical). |
| KI-27 | Medium | M8 (all) | Nothing of M8 has been played by a person: the first-time flow, the intro in play, the first-home chapter's pace, house art, upgrade costs, customisation unlocks, tips and touch layouts are tuned on tests, rendered frames and headless-Chrome passes only. | M8 | The M8 sections of the manual test plan. |
| KI-28 | Low | Housing | A house often cannot grow where it was first built (trees, a fence, a slope next to it): the upgrade says what is in the way and the player must move the house (M) first. The build preview does not show the room a house needs to grow. | `LiveWorld.upgradeFit` | Show the Dream Home's footprint faintly while placing the first shelter, or offer to move it. |
| KI-29 | Low | Housing | Customisation covers the home (the first shelter) only; further shelters keep the default look. Wall items hang on the back wall only, not on partitions. | `src/ui/screens/home-style.ts` | Per-house selection. |
| KI-31 | Low | Onboarding | Typing an island name uses the tiny font's characters only (letters, digits, space, `.`, `!`, `-`); other characters are dropped as typed. | `src/game/island-name.ts` | Accept more glyphs if the font grows. |
| KI-32 | Low | Touch | Portrait phones are not supported (a hint asks for landscape); the canvas is drawn at CSS pixels (not the device pixel ratio), so text is 2–3 device pixels per font pixel on phones. | `src/playground/styles.css`, `src/playground/main.ts` | A portrait HUD layout; render at a device-pixel scale. |
| KI-33 | Low | Lab | A plain link now opens Play (the game) instead of the lab's World tab; lab users click World. The URL names an island only once it is played or saved. | `src/playground/main.ts` | — (by design) |
| KI-35 | Low | Rest | Rest is not saved: a reload while asleep in bed starts awake outside (needs are kept). Autonomy alone still naps in the doorway when tired outside (by design: no surprise scene change). | `LiveWorld.stepRestPlan` | Save the rest, or let autonomy go home when the player has been idle a long time. |
| KI-36 | Low | Rest | The in-bed pose is the canonical Blobbi with closed eyes, tucked under the blanket; there is no lying-down pose (the kit animator has none). | `src/render/interior-render.ts` | A lying pose if the kit gains one. |
| KI-37 | Medium | Growth | The new pacing has never been played: stage 4 asks for about 12 days on the island (about 4 hours of play) and large lifetime counts; it may feel too long or too short. | `src/game/growth-progress.ts` | Tune after GROW4-01. |
| KI-38 | Low | Growth | Stage 4 coverage on the test seeds is 85–92 % of the suitable surface (target "about 80 %"); the suitable surface itself keeps margins from the Carrier's edges, so the share of the whole back is lower (whale and manta). | `src/world/growth.ts` (`SANCTUARY_INSET`, `suitableSurface`) | Tune by eye after GROW4-03 … 05. |
| KI-39 | Low | Growth | Stage 4's Sanctuary objects are dense (orchards and flowers) and it adds one region, one place and one discovery; a whale has 8 named places by stage 3, so stage 4 asks to explore 8. | `src/world/growth.ts`, `src/game/growth-content.ts` | More Sanctuary features (a spring, a Keeper's bench). |
| KI-40 | Low | Housing | A home's chimney smoke and lit windows show only for the player's houses at level 2–3 (smoke) and all levels (windows); generated cottages keep their M1 smoke only. | `src/game/buildings.ts` (`houseChimney`) | — |
| KI-41 | Low | Fishing | (By design.) Before its first growth an island may not reach the sea (no island of the 90 scanned does at stage 0): sea fishing, the seal and the canoe come with growth, and a cast or a launch at a sea in sight but too far says so. Since M10 phase C every island reaches the sea from stage 1 (the landing: [ocean access](../specifications/OCEAN-ACCESS.md)), and everything at sea opens after "Help your island grow". | `LiveWorld.fishTarget`, `seaTooFar` | — (a reward of growth). |
| KI-42 | Low | Ocean | Where the turtle's front-flipper water band touches the world's top edge (about 10 px on some seeds) it ends in a short straight line against the open sea beyond. | `src/render/open-sea.ts`, turtle world framing | Frame turtle worlds with a margin of deep water, or fade bands at the edge. |
| KI-43 | Low | Performance | A Blobbi pose seen for the first time is rasterized from the kit's SVG on that frame (about 2 ms headless; more on slow CPUs): a small hitch the first time each walk frame or expression appears at a camera scale. Cached after (512 per size). | `NativeBlobbi.sprite`, `src/blobbi/svg-raster.ts` | Pre-warm the walk cycle in idle time after a mode change. |
| KI-44 | Low | Performance | Performance was measured headless and in Chrome on one development machine, with CPU throttling as the only stand-in for slower hardware. No real low-end device was measured. | `docs/testing/perf/` | PERF-01, PERF-02. |
| KI-45 | Low | Ocean | On foot, close-in camera modes never show beyond the world (the camera clamps to it); aboard the canoe the camera follows past the world's edge within the canoe's sea (M10 phase B). | `ViewCamera.view` | — |
| KI-46 | Low | Wildlife | Marine creatures are drawn in world pixels (a seal's head is 6 px, a dolphin 11 px): small but proportionate to the 16 px Blobbi; they are not lit by night lighting differently from the water. | `src/render/marine-render.ts` | Tune after SEA-01. |
| KI-47 | Low | Land | A spot built over stays clear for as long as the building stands: resources wait in place and never relocate (by design, src/game/clearing.ts). An island built all over can run short of trees; driftwood is the wood fallback. | `LiveWorld.stepClearing` | — |
| KI-48 | Low | Land | Small rocks, once "too small to mine" (M3.2), are now cleared with the pickaxe for a stone (M10 phase B); players used to the old answer will see a swing. | `LiveWorld.mine` | Confirm by playing (CLEAR-03). |
| KI-50 | Low | Canoe | Four headings only (no diagonals), no bobbing on the swell. (M10 phase C: each heading now reads as a canoe — bow and stern, rising ends, planks along it, a prow toward the viewer — but side-on it is wide, like a rowboat.) | `src/render/canoe-render.ts` | Diagonal sprites, a gentle bob. |
| KI-54 | Low | Ocean access | The landing is a straight strip in one of four directions (the canoe launches straight ahead): readable, but simpler than the rest of the coast; on a turtle whose land already nearly reaches the lip it is only a few pixels. | `src/world/landing.ts` | A gently curved tongue, if it reads as artificial in play. |
| KI-55 | Low | Ocean access | An island grown before M10 phase C gains its landing on load (growth version 3 → 4), announced once, without the player choosing it. Only carrying-surface pixels become land and no object changes, so nothing the player made moves. | `LiveWorld.upgradedGrowth` | — (by design: the sea must be reachable). |
| KI-56 | Low | Quests | "Listen to the Carrier" now requires "Help your island grow" (the island's first growth). A save that had found the Carrier stone but not yet listened must grow the island first (its requirements are the stage-1 ones). | `src/content/quests.ts` | — (by design). |
| KI-57 | Low | Crafting | A recipe whose teaching quest is open is shown LOCKED with its hint: on a new island the Tools tab already shows the four copper upgrades ("Deeper stone" is open from the start). | `LiveWorld.recipeLockHint` | Tease only recipes of quests the player has pinned or that are close, if it feels busy. |
| KI-58 | Low | Onboarding | One active island: NEW ISLAND is hidden (it shows with `#islands=many`). A player who wants to start over deletes the island in ISLANDS (it asks first), after which BEGIN appears. | `src/ui/title.ts` (`allowNewIsland`) | A gentle "start a new island" in a later release, when several islands are a feature. |
| KI-59 | Low | Ocean access | Before the island has its landing, `seaReachable()` runs the general access analysis once per island change (about 20–150 ms, the first time E is pressed at a far sea or the canoe recipe is viewed). | `LiveWorld.seaReachable`, `findOceanAccess` | Compute it in idle time. |
| KI-60 | Medium | M10 phase C (all) | Nothing added in M10 phase C has been played by a person: onboarding menus, the growth quest's pacing, the landings on real islands, clearing stages, the clearing flag, pinning, locked hints, the canoe's new look, the sea's edge, calling the canoe back. | M10 phase C | The M10 phase C section of the manual test plan. |
| KI-61 | Low | Tests | On the development machine, with another process holding a core, a full parallel `npm run check` hits 60-second timeouts in the generation-heavy files (`cinematic`, `shell-variants`, `world`, `turtle`) and the KI-34 CPU budget (1.5 s) can read 1.8–1.9 s; each file passes on its own. Growth version 4 (the landing) adds 10–25 ms per growth, which adds a little to files that grow many worlds. | `tests/*.test.ts` | Run with `--maxWorkers=3` on a loaded machine; or split the heaviest files. Not by raising timeouts. |
| KI-18 | Low | Growth | A whale world grown to stage 3 before 2026-10-11 keeps growth version 1, so its mushroom grove may stay partly walled off by trees (only new growth uses version 2). | `src/world/growth.ts` (`GROWTH_VERSIONS`) | Reset growth on that test world, or add an opt-in upgrade of a save's growth version. |

## Fixed in M8 (2026-10-11): the intro is part of making an island

- **KI-19**: the intro cinematic was a dev preview only. NEW ISLAND (and a first-time player's BEGIN) now chooses a
  Carrier and a name, makes the island, saves it with its intro pending and plays the intro on the real world; the
  intro ends in play (no return to the title). ABOUT → WATCH THE … INTRO replays it on a preview island.

## Fixed in M8 (2026-10-11): deleting a world asks first

- **KI-01** (High): the sidebar's progress-reset button deleted the world's save immediately. It is now "Delete this
  island's progress…": it opens a confirmation that names the island and its Carrier, starts with Cancel focused, and
  keeps Delete disabled for 0.6 s (`ConfirmGate`, `src/game/world-delete.ts`), so a double click cannot confirm.
  MY ISLANDS on the title can now delete a world too, through the same gate on a page of its own (KEEP IT is the
  default answer). Tests: `tests/world-delete.test.ts`. Manual: SAVE-DEL-01 … 03 (NOT TESTED).

## Fixed in M8 phase 0 (the playable whale)

- The whale was a preview only (`status: 'prototype'`); it is a playable World Carrier.
- The example images of the manta in `examples/living-archipelago/` were older than the M7 manta (they were made in
  M6); regenerated with `scripts/carriers.ts`.

## Fixed 2026-10-11: "the Growth button does nothing" (found in manual play on a whale world)

- **Root cause:** a press inside any in-game panel that missed every live control — including the muted NOT READY
  YET growth button — fell through to "a press outside the panel closes it". On a world not yet ready to grow, the
  growth button therefore closed the panel silently: no message, no growth, nothing on screen changed. Fixed in
  `GameUI` (the panel's own background takes such presses) and `Gfx.button` (`whyNot`: a muted button may explain
  itself); the growth panel now says how many requirements are left and keeps refusals on screen.
- **Also unclear:** the dev growth buttons refuse on any world whose seed lacks "test" (a world from NEW ISLAND), and
  said so only in small text under the buttons; the test plan sent whale testers there from NEW ISLAND. The refusal
  now also shows on the game view, and the plan says to use the dev tools' Whale test world. The dev stage buttons
  rebuilt the world with no reveal, no notice and no camera change; a higher stage now plays the reveal. After every
  reveal the new land stays lit for 3.5 s (thin turtle growth was easy to miss at overview).
- **Found while testing it:** the whale's stage-3 mushroom grove could be partly walled off by its old trees (about
  a third unreachable on seed `flow-test-whale`). Fixed for new growth in growth version 2 (whale only; version-1 saves
  regrow unchanged). The growth panel's GROWN LAND text overlapped its STAGES list.
- The growth flow itself (stage saved, world rebuilt, renderer, walkability, persistence) worked for all three
  species; it is now tested from the button press (`tests/growth-flow.test.ts`).

## Fixed during the documentation pass

- The Carrier panel showed the M6 design-only growth model; it now shows the real island growth.
- `src/carriers/species.ts` described the manta as a prototype; it is playable since M7.
- `docs/game-design/GAMEPLAY-SYSTEMS.md` began with a second-level heading.

## Fixed in M10 phase C

- KI-02 (High): a save from a newer version of the game (or one that cannot be read) was ignored and then overwritten
  by the next autosave. Now it is never written over: it is copied aside (`blobbi-pixel-lab:backup:v1:<identity>`),
  the world plays without saving, and the player is told (`tests/save-reliability.test.ts`).
- KI-49 (Medium): trees the player plants are saved (island frame, world time, seed), keep growing across reloads and
  growth, and can be dug up with the axe (`tests/regrowth-stages.test.ts`).
- KI-51 (Low): the rough-water edge is rounded and breathes; no straight line (`tests/canoe-polish.test.ts`).
- KI-52 (Low): a moored canoe can be called back into the bag from anywhere ashore (CALL IT BACK in the bag); still
  one canoe.
- KI-53 (Low): every fish has its own icon silhouette and markings.
- Found during phase C: a regrowing seedling (now stepped over) could have had a bench built on it and grown through
  it; placement and tilling now refuse ground where something is growing back. The growth panel said "stage 0 of 3"
  since stage 4 was added (M9); it counts four.

## Fixed in M10 phase B

- **KI-34** (2026-10-12): the "generates a default world quickly" budget timed one run by the wall clock, so nine
  other test processes on the same cores could push it from 0.5 s to 3.3 s. It now measures the test process's own
  CPU time (vitest runs each file in its own process) and keeps the fastest of three runs; the 1.5 s budget is
  unchanged, so a real slowdown still fails. The marine-life cost test uses CPU time the same way.

## Reporting a new issue

Add a row with the next ID, a severity, the code location and, if found by a manual test, the test ID (for example
"found in GROW-04"). When an issue is fixed, move it to a "Fixed" list with the date and remove it from the table.
