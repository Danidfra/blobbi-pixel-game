# Specification: Farming

## 1. Purpose
Grow food: till soil, plant seeds, water, harvest. Gentle by design: a dry crop waits, nothing wilts or dies.

## 2. Status
**IMPLEMENTED** (M4; M5 added more crops, multi-harvest crops, copper tools). **NOT TESTED** by a person.

## 3. Player-facing behaviour
- With a hoe in hand, E on open ground tills the 8 px grid cell in front of the Blobbi into a plot (a copper hoe also
  tills the two cells beside it across the row). The ground must pass the plot check (see 8).
- E on an empty plot plants the selected seed (T cycles seeds in the bag); E on a dry crop waters it (a watering can
  waters the plot and its two neighbours across the row; a copper can a 3×3 block); E on a mature crop harvests it.
- A crop grows only while its soil is wet, through five stages: seeds, sprout, young, growing, mature. One watering
  keeps it wet for the crop's `waterSeconds`; it needs `growSeconds` of wet time in total.
- Harvest gives the produce; the last picking also gives seeds back. Multi-harvest crops (`regrowSeconds`) go back to
  growing after a picking until their last one.
- The prompt says what E will do; the dev inspector shows each plot's state.

## 4. Controls
Hoe in hand (G crafts one; Q cycles tools) + E till · E plant / water / harvest · T next seed · F feed produce.

## 5. Data structures
- `CropContent` (`src/content/crops.ts`): seed item, produce item (with food effect), yield, seeds back, `growSeconds`,
  `waterSeconds`, optional `regrowSeconds` and harvests, sprite templates. 11 crops
  ([catalogue](../game-design/CONTENT-CATALOG.md)).
- `CropState` (`src/game/farming.ts`): `{ kind, plantedAt, grown, wetFrom, wetUntil, picks? }`.
- `FarmPlot`: `{ id, gx, gy, preparedAt, harvests, crop }` on an 8 px grid in island-frame cells (`PLOT_GRID`).

## 6. State transitions
```
open ground ─till─► empty plot ─plant─► seeds (dry) ─water─► wet: grows ─(wet window ends)─► dry: waits ─water─► …
                                   … mature ─harvest─► empty plot (or back to growing for multi-harvest crops)
```
Growth is a pure function of world time: `cropGrowth = grown + wet time since wetFrom` (capped at `wetUntil`).

## 7. Persistence
Save field `plots` (each plot and its crop). World time is saved, so a crop continues exactly where it was after a
reload; time passes only while the game runs.

## 8. Edge cases
- The plot check refuses: too close to the edge, an existing plot, a building's clearance, a shelter's doorway, ground
  that is not buildable (water, path, pond, the shell). Buildable ground includes the M7 biome grounds (moss, gravel,
  clover), so grown land can be farmed.
- Watering a wet or mature crop does nothing; planting without seeds says "no seeds".
- A visitor (M7) cannot till, plant, water or harvest.

## 9. Failure handling
Malformed saved plots are dropped one by one (unknown crop kinds, non-finite times); a crop's saved times are clamped
to valid values (`plotsFromSave`).

## 10. Source files
`src/game/farming.ts`, `src/content/crops.ts`, `src/game/buildings.ts` (`checkPlot`), `LiveWorld.tend`,
`LiveWorld.landTill`, `LiveWorld.plant`, `LiveWorld.water`, `LiveWorld.waterRow`, `LiveWorld.harvest`,
`src/render/live-render.ts` (plots and crops).

## 11. Automated tests
`tests/farming.test.ts`, `tests/living-island.test.ts` (the whole loop by script), `tests/tools.test.ts` (copper
tools), `tests/growth.test.ts` (farming on grown land), `tests/manta-world.test.ts` (farming on a manta world).

## 12. Known limitations
No seasons, no fertiliser, no crop quality; plots cannot be un-tilled; balancing (times, yields) not validated with
players.

## 13. Extension points
New crops are new `CROP_CONTENT` entries; seasons could gate `growSeconds` per crop (PLANNED, not designed).
