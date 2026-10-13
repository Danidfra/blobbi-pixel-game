# Specification: Land clearing and resource regrowth

## 1. Purpose
Let the player shape the island: terrain is permanent, but the natural things standing on it are temporary. Clearing
a tree, a rock or a bush frees its ground for buildings, paths, plots and furniture; natural resources come back
over time without ever taking over what the player made, and the player never runs out of essential materials.

## 2. Status
**IMPLEMENTED** (M10 phase B; stages, prepared land and planted trees in M10 phase C). Manually tested by the owner
(M10 phase B): clearing a tree and building a house on the cleared land — PASS. Everything added in phase C:
**NOT TESTED** by a person.

## 3. Player-facing behaviour
- **What can be cleared** (`src/game/clearing.ts`, `clearableKind`):
  | Thing | Tool | Gives | Comes back after |
  |---|---|---|---|
  | Tree | axe (3 hits; 2 with copper) | wood (2–4) | 600 s clear, then a seedling grows 240 s |
  | Stump (a felled tree's, phase C) | axe (one swing) | nothing | the tree's own timeline |
  | Seedling (first third of regrowth, phase C) | axe (one swing) | nothing | 600 s clear again |
  | Young tree (rest of regrowth, phase C) | axe (one swing) | one log | 600 s clear again |
  | Large rock | pickaxe (4 hits; 3 with copper) | stones (3–5), copper ore after *Deeper stone* | 900 s clear, then it forms 360 s |
  | Rubble (phase C) | pickaxe (one swing) | nothing | the rock's own timeline |
  | Forming rock: deposit / growing (phase C) | pickaxe (one swing) | 1 / 2 stones | 900 s clear again |
  | A tree the player planted (phase C) | axe (one swing) | nothing (planting is free) | never (it is gone) |
  | Small rock | pickaxe (one swing) | a stone | 900 s |
  | Bush | axe (one swing) | a stick and fibre | 480 s |
  | Natural mushroom | axe (one swing) | a mushroom | 600 s |
  | Natural stump (decor) | axe (one swing) | a piece of wood | never |
  The island's keeper pieces (signs, wells, lanterns, barrels, crates) cannot be cleared.
- **Cleared ground**: a felled tree is a stump for 20 s (it still blocks), broken rock is rubble for 20 s; then the
  spot is clear — nothing is drawn there (nor its shadow), the Blobbi walks over it, and buildings, paths, rugs,
  plots and furniture may be placed on it. A world day is 1200 s of world time.
- **Coming back — the policy: wait in place.** When its time comes, a resource returns on its very own spot (a tree
  as a seedling first, through the existing growth stages) only if that spot is free: no building, path, rug or
  furniture outdoors, no doorway, no farm plot or crop, no planted tree, not the Blobbi, not the canoe, and not where
  it would cut the hub or a door off from the rest of the island. Otherwise it waits and looks again every 5 s of
  world time; it never moves, and nothing of the player's ever moves. Build on a spot and it stays clear; clear the
  building away and the resource returns.
  - *Why waiting and not relocating*: every world object has a fixed index, position and seed that saves, quests,
    places, discoveries and the island's look rely on; a relocated tree would be a new kind of record and could
    surprise the player. Waiting is deterministic and readable.
- **Every stage can be removed (M10 phase C).** Nothing natural is ever an indestructible obstacle: a stump is dug
  out, a seedling pulled up, a young tree cleared, rubble cleared away, a forming rock broken up early — one swing
  each. Clearing early gives less than the grown thing (a seedling nothing, a young tree one log, a deposit one stone,
  a growing rock two) and restarts the full wait, so it never out-earns waiting. Quests count only real fellings and
  breakings. The footprint follows the stage: a seedling and a deposit are small (a seedling is stepped over), a young
  tree and a growing rock block more. Nothing is built, laid or tilled on a seedling or a forming rock ("something is
  growing there (clear it first)"), so nothing ever grows up through a building.
- **Prepared land (M10 phase C).** Harvested wilderness comes back; ground the player keeps clear does not. A
  **clearing flag** (2 sticks + 1 fibre, made by hand, known from the start; walked under, never in the way) keeps
  every wild thing — trees, rocks, bushes, natural stumps and mushrooms, sticks, stones and forage — from returning
  within its circle (`KEEP_CLEAR_RADIUS`, 30 px). The circle is drawn as dots on the ground when the Blobbi is near,
  while a flag is being placed and while arranging. It is a placeable like any other: saved in the island frame (it
  survives growth), moved with M, picked up into the bag — and then nature may return (each thing when its own time
  has come, if its spot is free). Its circle is small: a flag can never empty the island by accident.
- **Planted trees (M10 phase C, KI-49).** Trees the player plants (P) are saved (island frame, world time, seed and
  size), keep growing in world time across reloads, growth and migration, take root (block) at a third grown, keep
  resources from coming back on their spot, and can be dug up with the axe (no wood).
- **Never short of materials**: sticks and stones lie about and come back on their own (nodes never respawn under
  buildings, paths or plots); and while fewer than 8 trees stand (`MIN_STANDING_TREES`), **driftwood** (wood) washes up
  on the shore spots, coming back 240 s after it is picked up — a bounded fallback that only appears when needed.
- **Earlier saves** keep their timelines: a tree felled before M10 phase B regrows right after its stump, a rock
  broken before stays rubble (and blocks) for 300 s, then is whole.

## 3b. Regeneration audit (M10 phase C)
The owner noticed resources "regrowing about every 15 minutes". What actually happens (verified in code and tests):
- **What returns after ~15 minutes.** A felled tree is a stump for 20 s; its ground is clear for 600 s; then, if its
  spot is free, a **seedling** comes up and grows through the tree's growth stages to the **grown** tree in 240 s —
  a seedling at about 10 min 20 s, a grown tree at about 14 min 20 s. A broken large rock: rubble for 20 s, clear for
  900 s, then (phase C) it forms for 360 s — a small deposit at about 15 min 20 s, whole at about 21 min. Bushes return
  whole after 480 s, mushrooms after 600 s, small rocks after 900 s; natural stumps never. Sticks, stones and seeds lie
  again after 120–180 s, forage after its own time.
- **Game time, not real time.** Every timer runs in *world time*: simulated seconds that pass only while the game is
  played (the clock never runs while it is closed), saved with the island, so nothing changes while away and nothing
  is lost by being away.
- **Independent and saved.** Each resource has its own record (`trees`, `rocks`, `cleared`, `collectedAt`): when it was
  taken, when it came back; restored exactly on reload.
- **Buildings, paths, furniture.** A resource returns only to a free spot: never under a building, path, rug or
  outdoor furniture, a doorway, a farm plot or crop, a planted tree, the Blobbi or the canoe, never cutting the way to
  the hub or a door, and (phase C) never inside a clearing flag's circle. Otherwise it waits on its spot (rechecked
  every 5 s); nothing ever moves.
- **What changed in phase C, and what did not.** The timings stay as they were (they keep wood and stone generous, and
  driftwood keeps wood within reach); what was annoying was having to clear the same ground again and having young
  growth be untouchable. So: every stage can now be removed, the rock forms in visible stages instead of appearing
  whole, building over regrowth is refused with a reason, and land the player wants to keep clear stays clear with a
  flag.

## 4. Controls
E with the axe facing a tree, bush, natural stump or mushroom; E with the pickaxe facing a rock (large: mine; small:
clear). The prompt says what E will do at each stage ("E  dig out the stump", "E  pull up the seedling", "E  clear
the young tree", "E  clear the rubble", "E  clear the small deposit", "E  clear the young rock", "E  dig up the tree
you planted") and the bubble what happened (`young tree cleared  +1 wood`). A clearing flag is crafted (K) and placed
from the bag; M arranges or picks it up.

## 5. Data structures
- `TreeState.regrowAt` (`src/game/trees.ts`): world time the seedling came up; `null` while waiting on clear ground;
  absent for older records. Phase `'cleared'` in `treeCondition`.
- `RockState.reformAt` (`src/game/rocks.ts`): world time the rock surfaced; `null` while waiting; absent: old timeline.
  Phase `'cleared'` in `rockCondition`.
- `LiveWorld.cleared: Map<index, { at, returnedAt }>` for bushes, small rocks, natural stumps and mushrooms.
- `LiveWorld.absentObject(index)`, `absentIndices()`, `absentVersion` (bumped when the set changes).
- Phase C: `treeStage(growth)` (`seedling` < 1/3, `young`, `grown`), `EARLY_WOOD`; `RockState` gains the `forming`
  phase (`rockStage`: `deposit`, `growing`, `whole`; `ROCK_FORM_SECONDS` 360; `ROCK_STAGE_SIZE`), `EARLY_STONES`;
  `KEEP_CLEAR_KIND` (`clearing-flag`), `KEEP_CLEAR_RADIUS`, `keptClear()`; `LiveWorld.growingIn(rect)`,
  `keepClearRings()`, `PlantedTree` saved as `PlantedSave` (schema 12).

## 6. State transitions
grown ─fell─► stump (20 s) ─► cleared ─(≥600 s, spot free)─► regrowing (seedling, young; 240 s) ─► grown;
stump / seedling / young ─clear─► cleared (the 600 s wait again).
whole ─break─► rubble (20 s) ─► cleared ─(≥900 s, spot free)─► forming (deposit, growing; 360 s) ─► whole;
rubble / deposit / growing ─clear─► cleared (the 900 s wait again).
standing ─clear─► cleared ─(≥ its time, spot free)─► standing (the record is removed).

## 7. Persistence
Save schema 11: `trees[].regrowAt`, `rocks[].reformAt`, `cleared`; schema 12: `planted`, `plantedSerial`
([save and persistence](../architecture/SAVE-AND-PERSISTENCE.md)). Clearing flags are buildings (`buildings`). Driftwood is derived, never saved (only its
pick-up time, as a collected id `drift:<n>`).

## 8. Edge cases
A resource due while the Blobbi stands on its spot waits. A bench placed on a cleared spot keeps it clear for as long
as it stands. Growth never moves an absent object (indices are stable). Indoors, clearing does not step.

## 9. Failure handling
An unknown index in `cleared` is ignored on load. A cleared spot is checked against the live collision map each time
before a resource returns.

## 10. Source files
`src/game/clearing.ts`, `src/game/trees.ts`, `src/game/rocks.ts`, `src/sim/collision.ts` (`absent`),
`src/sim/live-world.ts` (`absentObject`, `startClear`, `landClear`, `spotFreeFor`, `stepClearing`, `stepDriftwood`,
`rebuildIsland`), `src/render/live-render.ts` (`refreshGround`), `src/content/forage.ts` (driftwood).

## 11. Automated tests
`tests/clearing.test.ts` (free ground, building and a path on it, coming back only when free, waiting under a
building, the Blobbi, determinism, save/load and the old timeline, bushes and small rocks, keeper pieces, driftwood,
upgrade feedback); `tests/mining.test.ts` and `tests/crafting.test.ts` (the tree and rock timelines);
`tests/regrowth-stages.test.ts` (phase C: every stage cleared with its yield, never built over, the clearing flag and
its persistence, planted trees saved, growing, surviving growth and dug up).

## 12. Known limitations
A resource never relocates, so a spot built over stays clear for good (by design). A clearing flag's circle is drawn
only near it (or while arranging). See [known issues](../testing/KNOWN-ISSUES.md) KI-47, KI-48 (KI-49 is fixed).

## 13. Extension points
More clearable kinds are entries in `clearableKind`, `RETURN_SECONDS` and `CLEAR_YIELD`. A relocation policy could be
added as a separate record (`relocated: { index → x, y }`) without changing the world's objects.
