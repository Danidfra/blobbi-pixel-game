# Specification: Land clearing and resource regrowth

## 1. Purpose
Let the player shape the island: terrain is permanent, but the natural things standing on it are temporary. Clearing
a tree, a rock or a bush frees its ground for buildings, paths, plots and furniture; natural resources come back
over time without ever taking over what the player made, and the player never runs out of essential materials.

## 2. Status
**IMPLEMENTED** (M10 phase B). **NOT TESTED** by a person.

## 3. Player-facing behaviour
- **What can be cleared** (`src/game/clearing.ts`, `clearableKind`):
  | Thing | Tool | Gives | Comes back after |
  |---|---|---|---|
  | Tree | axe (3 hits; 2 with copper) | wood (2–4) | 600 s clear, then a seedling grows 240 s |
  | Large rock | pickaxe (4 hits; 3 with copper) | stones (3–5), copper ore after *Deeper stone* | 900 s clear |
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
- **Never short of materials**: sticks and stones lie about and come back on their own (nodes never respawn under
  buildings, paths or plots); and while fewer than 8 trees stand (`MIN_STANDING_TREES`), **driftwood** (wood) washes up
  on the shore spots, coming back 240 s after it is picked up — a bounded fallback that only appears when needed.
- **Earlier saves** keep their timelines: a tree felled before M10 phase B regrows right after its stump, a rock
  broken before stays rubble (and blocks) for 300 s, then is whole.

## 4. Controls
E with the axe facing a tree, bush, natural stump or mushroom; E with the pickaxe facing a rock (large: mine; small:
clear). The prompt and the bubble say what happened (`cleared  +1 stone`).

## 5. Data structures
- `TreeState.regrowAt` (`src/game/trees.ts`): world time the seedling came up; `null` while waiting on clear ground;
  absent for older records. Phase `'cleared'` in `treeCondition`.
- `RockState.reformAt` (`src/game/rocks.ts`): world time the rock surfaced; `null` while waiting; absent: old timeline.
  Phase `'cleared'` in `rockCondition`.
- `LiveWorld.cleared: Map<index, { at, returnedAt }>` for bushes, small rocks, natural stumps and mushrooms.
- `LiveWorld.absentObject(index)`, `absentIndices()`, `absentVersion` (bumped when the set changes).

## 6. State transitions
grown ─fell─► stump (20 s) ─► cleared ─(≥600 s, spot free)─► regrowing (240 s) ─► grown.
whole ─break─► rubble (20 s) ─► cleared ─(≥900 s, spot free)─► whole.
standing ─clear─► cleared ─(≥ its time, spot free)─► standing (the record is removed).

## 7. Persistence
Save schema 11: `trees[].regrowAt`, `rocks[].reformAt`, `cleared`
([save and persistence](../architecture/SAVE-AND-PERSISTENCE.md)). Driftwood is derived, never saved (only its
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
upgrade feedback); `tests/mining.test.ts` and `tests/crafting.test.ts` (the new rock and tree timelines).

## 12. Known limitations
A resource never relocates, so a spot built over stays clear for good (by design). Planted trees (P) are still not
saved ([known issues](../testing/KNOWN-ISSUES.md)). See KI-47 … KI-49.

## 13. Extension points
More clearable kinds are entries in `clearableKind`, `RETURN_SECONDS` and `CLEAR_YIELD`. A relocation policy could be
added as a separate record (`relocated: { index → x, y }`) without changing the world's objects.
