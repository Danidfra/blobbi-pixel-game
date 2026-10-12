# Specification: Building (shelter, decorations, placing, management)

## 1. Purpose
Let the player shape the island: build a shelter, place decorations and furniture, and move, restyle or pick up what
they placed — always with clear feedback about where something fits.

## 2. Status
**IMPLEMENTED** (M3.1 shelter; M4 decorations; M5 placeables catalogue, placing from the bag, management mode).
**NOT TESTED** by a person.

## 3. Player-facing behaviour
- **Build mode** (B, or the crafting menu's Build tab): a ghost of the building follows the spot in front of the
  Blobbi, green when it fits, red with the reason when not; E pays the cost from the bag and places it. B cycles the
  unlocked kinds; Esc leaves.
- **Construction:** a placed building rises over its build time in world time (the shelter: 6 wood + 3 stones, 24 s);
  it blocks walking and navigation from the moment it is placed.
- **Placing from the bag:** furniture and decorations are crafted into the bag, then placed (bag → Place, or E in
  placing mode); T cycles their style (colourway).
- **Management mode** (M): select a placed piece in front; E picks it up to move (E again places it, Esc puts it
  back), T restyles it, X/Delete puts it back in the bag (not the shelter, not a chest with items).
- Using placed things: chests open storage, the stove cooks, the workbench crafts, benches and cushions are sat on,
  musical pieces play, the bird bath and others delight the Blobbi.

## 4. Controls
B build · E place / pick up / put down · T style · M manage · X/Delete to bag · Esc cancel · mouse on the menu.

## 5. Data structures
- `BuildingDefinition` (`src/game/buildings.ts` `BUILDINGS`): kind, label, category (building, decoration,
  furniture), bag item (none for the shelter), where (indoor, outdoor, both), layer (`solid`, `floor`, `open`,
  `wall`), use, capacity, variants, cost, footprint half-sizes, build seconds, clearance gap. 44 kinds
  ([catalogue](../game-design/CONTENT-CATALOG.md)); placeables come from `src/content/placeables.ts`.
- `Building` record: `{ id, kind, x, y, placedAt, seed, variant?, level?, look?, upgradedAt? }` (the last three: the home, M8) (canvas coordinates in play; island-frame in the
  save).

## 6. State transitions
```
bag item ─place─► under construction (progress = (worldTime − placedAt) / buildSeconds) ─► finished ─(manage)─► moving ─► placed
                                                                                          └─(X)─► back in the bag
```

## 7. Persistence
Save field `buildings` (island-frame coordinates, so a different carrier canvas or growth never moves them); chest
contents in `containers`; interiors in `interiors`.

## 8. Edge cases
Placement problems (`checkPlacement`, `PROBLEM_TEXT`): `edge` (too close to the world's edge), `building` (too close
to another, by its clearance gap), `doorway` (would block a shelter's door, or a shelter without walkable ground in
front of its door), `plot`, `ground` (not flat buildable ground), `water`, `blocked`, `resource` (resources lie
there), `path` (would cut the way), `blobbi` (on the Blobbi), and indoors `outdoor` / `door`. Unlocks: decorations
wait for the quest that teaches them. A visitor (M7) cannot build, place, move, restyle or pick up.

## 9. Failure handling
The cost is taken only when the placement succeeds; a cancelled move puts the piece back where it was; malformed
saved buildings (unknown kinds, bad numbers) are dropped one by one.

## 10. Source files
`src/game/buildings.ts`, `src/game/decorations.ts`, `src/game/furniture-art.ts`, `src/content/placeables.ts`,
`src/render/placement-overlay.ts`, `LiveWorld.setBuildMode`, `placeBuilding`, `startPlacing`, `placeFromBag`,
`toggleManage`, `pickUpToMove`, `placeMoved`, `restyleSelected`, `removeSelected`, `visitBuilding`.

## 11. Automated tests
`tests/building.test.ts`, `tests/placeables.test.ts`, `tests/living-island.test.ts`, `tests/growth.test.ts`
(buildings preserved by growth), `tests/manta-world.test.ts`, `tests/visiting.test.ts` (refused for a visitor).

## 12. Known limitations
No rotation or grid snapping beyond 2 px. House levels, upgrades and looks: see [Housing](HOUSING.md) (M8).

## 13. Extension points
New placeables are catalogue entries with an `art` generator; furniture grid and rotation are PLANNED.
