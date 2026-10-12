# Specification: World growth

## 1. Purpose
Let the island grow, in earned stages, into new regions with their own biomes — without ever moving or changing
what the player already built, and while keeping the World Carrier exactly as it is.

## 2. Status
**IMPLEMENTED** (M7) for turtle (Variants A–C) and manta worlds, and (M8 phase 0) whale worlds. **NOT TESTED** by a
person.

## 3. Player-facing behaviour
- The growth panel (L, or ISLAND GROWTH in the Carrier panel) shows the stage (0–3), progress toward the next one with
  every requirement (DONE or a count), what it adds, the grown regions (NEW / VISITED) and the stage ladder.
- When all requirements are met a notice says "The Carrier stirs: the island is ready to grow". Nothing happens until
  the player presses LET THE ISLAND GROW and confirms (press it again, or Enter).
- Until then the button reads NOT READY YET and is muted; pressing it keeps the panel open and says how many
  requirements are left and which (for example "not ready yet: 6 still needed, e.g. island harmony 0/15"). A refusal
  (indoors, a visitor) also keeps the panel open with its reason. (Before 2026-10-11 such a press closed the panel
  silently, which read as "the growth button does nothing"; see the fixed list in the known issues.)
- Growing: the world is rebuilt from the save at the new stage; the Carrier blinks, the Blobbi is delighted, the
  camera pulls back to the whole island (not with reduced motion), the new land spreads out from the old coast over
  about 4.5 s with sparkles and leaves, new plants appear as it reaches them, a chime plays and the music turns
  special; then the new land stays lit for 3.5 s and fades back to its own colours (so a thin band of growth, as on
  a turtle, is still noticed), and a notice "The island grew: stage N" ends it.
- Each stage adds two regions: 1 shore turf + flower meadow, 2 little woodland + rocky garden, 3 mushroom grove + outer
  shore. Each region has its biome's ground and plants, resources, a named place and (for the five biomes) a
  discovery.
- Where the land goes depends on the Carrier: all round a turtle's shell; out along a manta's wings; along a whale's
  back toward its tail (stage 1 meadow aft, stage 2 woodland and rocky garden along the north and south flanks behind
  the fins, stage 3 mushroom grove furthest aft), never toward its head or past the knuckles near its tail.

## 4. Controls
L growth panel · Enter / the button to grow · dev tools (test worlds only, i.e. a seed containing "test": the dev
tools' Test world / Turtle / Manta / Whale buttons): stage 0–3 (a higher stage plays the reveal from the stage on
screen), grow with reveal, meet requirements, reset growth, inspect world. On any other world they refuse and say so
on the game view as well as under the buttons.

## 5. Data structures
- `WorldGrowth` on a grown `WorldDescription` (`src/world/growth.ts`): version, stage, regions
  (`{ id, stage, biome, bearing }`), base object count, the grown coastline, per-pixel region and stage-born maps,
  region areas, object index boundaries per stage.
- `GrowthReadiness` (`src/game/growth-progress.ts`): next stage, requirements (have / need), progress, ready,
  unlocks, blocked reason.
- Save `growth`: `{ stage, version, history: [{ stage, worldTime, version }], regions }`.

## 6. State transitions
stage s (not ready) → (requirements met) ready → (player confirms) stage s+1 saved → world rebuilt from the save →
reveal → glow → stage s+1. Never backwards except the dev "reset growth" on a test world.

The button-to-world path is `GrowthScreen` → `onGrow` → `growLiveIsland` (`src/sim/regrow.ts`: readiness, refusal
reasons, `LiveWorld.growIsland`, then `rebuildFromSave`: save, a new `LiveWorld` from the same base world and the save
exactly as a reload, the Blobbi kept where it stood, the reveal from the stage that was on screen) → the playground
swaps its renderers and pulls the camera back (`adoptRebuilt`). The same module serves the dev stage buttons and the
tests (`tests/growth-flow.test.ts`).

## 7. Persistence
Only the stage, version, history and region ids are saved; the grown world is regenerated from the base world's seeds
and the stage, exactly as at the moment of growth (tested). Buildings stay in island-frame coordinates.

## 8. Edge cases
- Variant 0 turtles cannot grow (no free shell): the panel says so.
- Indoors: "step outside first".
- A visitor cannot grow a host's island.
- Base-derived content (resources, discoveries, places, the listening spot) is computed on the stage-0 world, so it is
  identical at every stage; grown-land resources have their own ids and are kept only where reachable.
- The old shore band now inland becomes plain grass (on the manta, old beach sand; on the whale, its old mossy
  fringe); all are walkable. A creature's new shore keeps its kind: sand on the manta, moss on the whale.
- Whale only: land grows over its back only between `growRange.x0` and `x1` (`WhaleInfo`, from `whaleGrowRange`);
  its lobes are 1.6× broader, the planner's march reaches 2.8× the island radius (1.6× elsewhere), and two lobes
  share the aft bearing (the first takes half the room, the last the rest). Turtle and manta plans are unchanged
  byte for byte (pinned in `tests/whale-world.test.ts`).
- Whale only, growth version 2: its solid grown plants and rocks keep a passage of `10 × scale` px to each other and
  to the coast, so the narrow aft land is never walled off (in version 1 a row of old trees could fence off the tip
  of the stage-3 mushroom grove: about a third of it was unreachable on some seeds).

## 9. Failure handling
Versions: `GROWTH_VERSION = 2`; `GROWTH_VERSIONS = [1, 2]` can both be reproduced. Version 2 differs from 1 only for
whale worlds (the passage rule above); turtle and manta worlds are identical in both (tested). New growth records
version 2; a save grown with version 1 is regrown exactly as version 1. An unknown growth version throws in `growWorld`; `LiveWorld` then opens the world read-only (no store), so the save is
never overwritten or regrown differently. A save migrated from schema 1–8 is stage 0.

## 10. Source files
`src/world/growth.ts`, `src/game/growth-progress.ts`, `src/game/growth-content.ts`, `src/content/discoveries.ts`,
`src/content/lore.ts`, `src/carrier/shell-surface.ts` (`land`), `src/render/compose.ts`, `src/render/live-render.ts`
(reveal), `src/render/paint-terrain.ts` (MOSS, GRAVEL, CLOVER), `src/ui/screens/growth.ts`, `LiveWorld.growIsland`,
`startReveal`, `revealGlow`, `devSetGrowthStage`, `src/sim/regrow.ts` (`growLiveIsland`, `rebuildFromSave`),
`src/playground/main.ts` (`regrow`, `rebuildFromSave`, `adoptRebuilt`), `src/dev/dev-tools.ts` (`devGrowthAllowed`), `scripts/growth.ts`,
`src/carriers/whale-world.ts` (`whaleGrowRange`), `scripts/whale-world.ts`.

## 11. Automated tests
`tests/growth-flow.test.ts` (8: the real panel button pressed with the pointer for turtle, manta and whale through
all three stages — stage saved, world rebuilt, new land painted by the renderer, walkable and reachable, nothing
moved, reveal and glow, reload; the muted button and gaps keep the panel open with the reason; indoors refused;
dev multi-stage reveal; dev growth on test worlds only), `tests/growth.test.ts` (17: determinism, versions 1 and 2, three stages, Variant 0, only adds land, stable objects and the
turtle untouched, plate ring and sprites, base content identical, buildings/collected/bag preserved, walkable,
farmable and buildable grown land, readiness monotonic, earned growth saved and reloaded, migration never grows,
unknown version read-only), `tests/manta-world.test.ts` (manta geometry), `tests/whale-world.test.ts` (whale: three
stages, over its back only and within its range, lengthening aft, buildings and bag kept, grown land reachable and
farmable, several seeds; turtle and manta growth pinned).

## 12. Known limitations
Turtle growth on Variant B is modest (about +20 % land) because the shell does not grow; new turtle worlds (Variant
S since 2026-10-11, see [World Carriers](../architecture/WORLD-CARRIERS.md) §2) start with a small island and the
same plan gives about +77 % by stage 3 (36 % → 64 % of the shell top), with no change to the growth version. Variant B:
(manta about +51 %, whale
about +80–100 %); regions are coastal strips;
the Carrier "age" model in `src/game/carrier.ts` is a separate M6 design-only model.

## 13. Extension points
A new `GROWTH_VERSION` with its own branch for different geometry; more stages; biome quests (PLANNED); a migrated
shell enlargement (DESIGNED ONLY idea, not specified).
