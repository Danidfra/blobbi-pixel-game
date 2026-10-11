# Specification: Inventory (bag, chests, gathering)

## 1. Purpose
Hold what the player has: resources, materials, seeds, food, tools, furniture and special items; let the player
gather from the world and keep things in chests, without ever duplicating or losing an item.

## 2. Status
**IMPLEMENTED** (M2.1 gathering and bag; M4 crate bonus; M5 categories, chests, bag screen, storage screen).
**NOT TESTED** by a person.

## 3. Player-facing behaviour
- E picks up the nearest resource node in reach (11 px) first, before any other E action. A full stack refuses
  ("bag is full of …") and the node stays.
- The bag (I) shows stacks by category (materials, seeds, food, tools, furniture, special) as an icon grid with
  details and actions: equip or unequip a tool, feed a food, choose a seed, place furniture, read a found note.
- Chests and cabinets (E on one) open the storage screen: bag and chest side by side; move all (Enter), one (Space),
  half (H), switch side (Tab), store matching stacks (M).
- Item toasts ("+3 WOOD") appear when the bag gains something.

## 4. Controls
E pick up / open chest · I bag · in the bag: arrows, Enter (primary action), Q/E tabs · in storage: Enter, Space, H,
Tab, M · mouse and touch on slots and buttons.

## 5. Data structures
- `ItemDefinition` (`src/game/items.ts`): stable id (`blobbi-pixel:<category>:<name>`), label, plural, category,
  stack limit, description, optional `tool`, `food`, `place`, `icon`. The registry `ALL_ITEMS` (core items plus
  content items) has 120 items ([catalogue](../game-design/CONTENT-CATALOG.md)).
- `Inventory` (`src/game/inventory.ts`): item → quantity, a per-item stack limit, an advisory `revision`, `add` and
  `remove` returning what actually moved, `snapshot()` → `{ version: 1, context, revision, items }`.
- Stack limit in play: the item's limit, plus 10 per finished storage crate (at most 2) for non-tools
  (`LiveWorld.stackFor`, `CRATE_BONUS`, `MAX_CRATES`).
- `Container` (`src/game/containers.ts`): its own `Inventory` and a capacity of distinct stacks; keyed by the placed
  record (`island/<id>` or `room/<shelter>/<id>`).
- `ResourceNode` (`src/game/resources.ts`): stable id (`<kind>:<n>`, grown land `g:<region>:<kind>:<n>`), kind,
  position, sprite variant, source placement.

## 6. State transitions
node on the ground → collected (id in `collected`, time in `collectedAt`) → after its respawn time, back on the
ground if its spot is free. Bag ⇄ chest only through `transfer` (`LiveWorld.moveItems`), which moves exactly what
fits, in one call.

## 7. Persistence
Save fields `collected`, `collectedAt`, `inventory`, `equipped`, `containers` (see
[Save and persistence](../architecture/SAVE-AND-PERSISTENCE.md)). The bag belongs to the world, not to a Blobbi.

## 8. Edge cases
- Asking to move more than fits moves what fits (a partial stack); asking for 0 or a negative amount moves nothing.
- A chest holding items cannot be picked up; an empty one goes back to the bag; a moved chest keeps its contents.
- Two chests are independent.
- Tools are never multiplied by crates.
- A visitor (M7) has an empty bag of its own and cannot use chests.

## 9. Failure handling
`transfer` re-checks after moving and restores both sides if the destination unexpectedly refused (cannot happen
after the room check). A malformed saved inventory falls back to an empty one; unknown item ids in a save are kept
as stacks but have no definition (shown with their id).

## 10. Source files
`src/game/items.ts`, `src/game/inventory.ts`, `src/game/containers.ts`, `src/game/resources.ts`,
`src/content/forage.ts`, `src/ui/screens/inventory.ts`, `src/ui/screens/storage.ts`, `src/ui/hud.ts` (toasts),
`LiveWorld.collect`, `LiveWorld.moveItems`.

## 11. Automated tests
`tests/gathering.test.ts`, `tests/crafting.test.ts`, `tests/placeables.test.ts` (atomic and partial transfers,
chests across reloads, independent chests), `tests/ui.test.ts`, `tests/title.test.ts` (toasts),
`tests/visiting.test.ts` (visitor bag).

## 12. Known limitations
No sorting or splitting in the bag beyond the storage actions; no trading or giving (by design); the inventory is
local only (its shape mirrors `@nostr-games/inventory` kind 31633 but nothing is published).

## 13. Extension points
An adapter from `InventorySnapshot` to the inventory protocol's builders (item ids → `31632:<issuer>:<d>`, context →
`d`), DESIGNED ONLY in [Cross-game travel](../architecture/CROSS-GAME-TRAVEL.md); more containers are more
`capacity` placeables.
