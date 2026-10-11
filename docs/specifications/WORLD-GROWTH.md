# Specification: World growth

## 1. Purpose
Let the island grow, in earned stages, into new regions with their own biomes — without ever moving or changing
what the player already built, and while keeping the World Carrier exactly as it is.

## 2. Status
**IMPLEMENTED** (M7) for turtle (Variants A–C) and manta worlds. **NOT TESTED** by a person.

## 3. Player-facing behaviour
- The growth panel (L, or ISLAND GROWTH in the Carrier panel) shows the stage (0–3), progress toward the next one with
  every requirement (DONE or a count), what it adds, the grown regions (NEW / VISITED) and the stage ladder.
- When all requirements are met a notice says "The Carrier stirs: the island is ready to grow". Nothing happens until
  the player presses LET THE ISLAND GROW and confirms (Enter again).
- Growing: the world is rebuilt from the save at the new stage; the Carrier blinks, the Blobbi is delighted, the
  camera pulls back to the whole island (not with reduced motion), the new land spreads out from the old coast over
  about 4.5 s with sparkles and leaves, new plants appear as it reaches them, a chime plays and the music turns
  special; a notice ends it.
- Each stage adds two regions: 1 shore turf + flower meadow, 2 little woodland + rocky garden, 3 mushroom grove + outer
  shore. Each region has its biome's ground and plants, resources, a named place and (for the five biomes) a
  discovery.

## 4. Controls
L growth panel · Enter / the button to grow · dev tools (test worlds only): stage 0–3, grow with reveal, meet
requirements, reset growth, inspect world.

## 5. Data structures
- `WorldGrowth` on a grown `WorldDescription` (`src/world/growth.ts`): version, stage, regions
  (`{ id, stage, biome, bearing }`), base object count, the grown coastline, per-pixel region and stage-born maps,
  region areas, object index boundaries per stage.
- `GrowthReadiness` (`src/game/growth-progress.ts`): next stage, requirements (have / need), progress, ready,
  unlocks, blocked reason.
- Save `growth`: `{ stage, version, history: [{ stage, worldTime, version }], regions }`.

## 6. State transitions
stage s (not ready) → (requirements met) ready → (player confirms) stage s+1 saved → world rebuilt from the save →
reveal → stage s+1. Never backwards except the dev "reset growth" on a test world.

## 7. Persistence
Only the stage, version, history and region ids are saved; the grown world is regenerated from the base world's seeds
and the stage, exactly as at the moment of growth (tested). Buildings stay in island-frame coordinates.

## 8. Edge cases
- Variant 0 turtles cannot grow (no free shell): the panel says so.
- Indoors: "step outside first".
- A visitor cannot grow a host's island.
- Base-derived content (resources, discoveries, places, the listening spot) is computed on the stage-0 world, so it is
  identical at every stage; grown-land resources have their own ids and are kept only where reachable.
- The old shore band now inland becomes plain grass (on the manta, old beach sand too); both are walkable.

## 9. Failure handling
An unknown growth version throws in `growWorld`; `LiveWorld` then opens the world read-only (no store), so the save is
never overwritten or regrown differently. A save migrated from schema 1–8 is stage 0.

## 10. Source files
`src/world/growth.ts`, `src/game/growth-progress.ts`, `src/game/growth-content.ts`, `src/content/discoveries.ts`,
`src/content/lore.ts`, `src/carrier/shell-surface.ts` (`land`), `src/render/compose.ts`, `src/render/live-render.ts`
(reveal), `src/render/paint-terrain.ts` (MOSS, GRAVEL, CLOVER), `src/ui/screens/growth.ts`, `LiveWorld.growIsland`,
`startReveal`, `devSetGrowthStage`, `src/playground/main.ts` (`regrow`, `rebuildFromSave`), `scripts/growth.ts`.

## 11. Automated tests
`tests/growth.test.ts` (15: determinism, version, three stages, Variant 0, only adds land, stable objects and the
turtle untouched, plate ring and sprites, base content identical, buildings/collected/bag preserved, walkable,
farmable and buildable grown land, readiness monotonic, earned growth saved and reloaded, migration never grows,
unknown version read-only), `tests/manta-world.test.ts` (manta geometry).

## 12. Known limitations
Turtle growth is modest (about +20 % land on Variant B) because the shell does not grow; regions are coastal strips;
the Carrier "age" model in `src/game/carrier.ts` is a separate M6 design-only model.

## 13. Extension points
A new `GROWTH_VERSION` with its own branch for different geometry; more stages; biome quests (PLANNED); a migrated
shell enlargement (DESIGNED ONLY idea, not specified).
