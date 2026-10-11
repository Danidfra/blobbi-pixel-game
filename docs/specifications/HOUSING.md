# Specification: Housing (the shelter's interior)

## 1. Purpose
Give the player a home to furnish: a small room behind the shelter's door where the Blobbi sleeps, with furniture,
wall items and room styles.

## 2. Status
**IMPLEMENTED** (M5). **NOT TESTED** by a person. House upgrades (`level`) are reserved, not implemented.

## 3. Player-facing behaviour
- E at a finished shelter's door goes inside; walking out through the door gap leaves, back at the door.
- A new interior comes furnished with a bed, a table, a chest, a wall lantern and a rug.
- Furniture is placed from the bag indoors (the same placing and management flow as outside): floor pieces, solids,
  rugs (walked over) and wall items (hung on the back wall, clear of the window).
- In management mode with nothing selected, T cycles the room's style (floor: honey, dark, pale; walls: warm, cream,
  sage).
- A tired Blobbi indoors walks to its bed and sleeps there, recovering energy twice as fast.
- The window shows the day and night outside; the island keeps living while the Blobbi is indoors.

## 4. Controls
E at the door · walk out of the door gap · placing and management keys as in [Building](BUILDING.md) · T room style.

## 5. Data structures
`InteriorState` (`src/game/interior.ts`): `{ shelterId, furniture: Building[] (room coordinates), style: { floor,
wall }, level }`. Room 128 × 96 px, back wall 24 px, door gap x 57–70, spawn at the door, a floor rectangle, a
door-clear zone. One interior per shelter, keyed by the shelter's stable id.

## 6. State transitions
island ─E at door─► room (scene switch: collision, nav, brain, particles, renderer) ─walk out─► island at the door.
An interior is created on first entry and kept when the shelter moves.

## 7. Persistence
Save field `interiors` (furniture in room coordinates, style, level); chests indoors in `containers` under
`room/<shelter>/<id>`. An interior whose shelter no longer exists is dropped on load.

## 8. Edge cases
`checkInterior` refuses: outdoor-only kinds, outside the floor, in front of the door, solids on solids, floor pieces
on floor pieces, wall items on each other, on the Blobbi; a solid piece may not cut the way to the bed or the door.
Growth (M7) needs the player outside; visiting (M7) starts only outside, and a visitor can walk into a host's house
but not change it.

## 9. Failure handling
Unknown furniture kinds in a save are filtered out; a missing interior is created fresh on entry.

## 10. Source files
`src/game/interior.ts`, `src/render/interior-render.ts`, `LiveWorld.enterInterior`, `exitInterior`,
`makeRoomScene`, `bedSpot`, `restyleSelected`.

## 11. Automated tests
`tests/placeables.test.ts` (entering, starter furniture, room camera bounds, leaving at the door, furniture on floor
and wall persisting and surviving a shelter move, bed sleep), `tests/camera.test.ts`, `tests/manta-world.test.ts`.

## 12. Known limitations
One room per shelter; `level` is always 1; no doors between rooms; no lighting changes from lamps indoors beyond the
sprites.

## 13. Extension points
House upgrades via `level` (PLANNED); more room layouts per level.
