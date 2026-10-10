# M3.1: First building. Implementation report

Scope: `blobbi-pixel-game`, 2026-10-10. The first construction loop: the
player places a small wooden shelter on the turtle's island, pays for it
from the bag, watches it go up, and keeps it. M3.1 passed the user's
manual gameplay test and is committed locally; M3 as a whole continues.

Images (`examples/building/`):

- `turtle-0-shelter.png`: headless frames of the loop: the placement
  preview where it fits (green), the preview on a tree (red, with the
  reason), the placement with the materials paid, construction at 30, 60
  and 85 percent, the finished shelter, E at the door, and a reload with
  the shelter still there and still blocking.
- `shelter-stages.png`: the shelter sprite from an empty plan to finished,
  two seeds.

The playground (http://127.0.0.1:5177, Play) has a Building block in the
panel with the cost, what is built, and the preview state; B toggles the
preview, E places.

## 1. The building

`src/game/buildings.ts`. One kind for now, `shelter`, as an entry in a
`BUILDINGS` registry (id `blobbi-pixel:building:shelter` in the protocol
style, label, cost, footprint, build time). A second kind is a second
entry plus a sprite.

| | |
|---|---|
| cost | 6 wood + 3 stone |
| footprint | 24 × 10 px ground rectangle (at world scale 1.6) |
| build time | 24 s of world time |

A placed building is `{id, kind, x, y, placedAt, seed}`; ids are
`shelter:n` in placement order, the seed `<worldSeed>/shelter/n`.

## 2. Placement

B enters build mode: a preview sits in front of the Blobbi (two-pixel
snapped, following its facing), drawn as a checkerboard ghost of the
finished shelter with its footprint outlined green when it fits and red
when not, and a label saying "E to build", "not enough materials", or why
it does not fit. `checkPlacement` requires every pixel of the footprint
plus a one-pixel margin to be buildable grass (grass, patches, forest
floor, meadow, the grass edge; never paths, sand, water, pond, cliff, rim)
on one elevation level, unblocked in the collision map (no tree, rock,
house or fence footprint, no water), clear of other buildings by three
pixels, of resource nodes, and of the Blobbi itself. The problems are
named: water, needs flat grass, something is in the way, too close to a
building, resources lie there, you are standing there, too close to the
edge.

E on a valid spot with enough materials places it: the cost leaves the bag
atomically (`consumeIngredients`, all or nothing, in `src/game/
crafting.ts`), the footprint is blocked in the collision map as a
rectangle, the nav grid is rebuilt around it (the autonomous Blobbi walks
around it from then on), dust flies, a bubble says what is being built,
build mode ends and the record is saved. E on an invalid spot or with too
little in the bag refuses with a bubble and consumes nothing.

## 3. Construction and the sprite

`generateShelter(seed, size, palette, progress)`: log walls lit on the
left with a shadow line under the eave, an open dark doorway with a lintel,
corner posts, a thatched gable roof with a lit slope, a dark ridge and a
fringe at the eave. The seed chooses the thatch tone and the straw
speckle; the shape is one design. Under construction the sprite is drawn
to a built line: corner posts stand from the start with a log pile beside
them that shrinks as the logs go up, the walls rise through the first 60%
of the time, the roof closes from the eaves to the ridge through the rest.
Progress is quantized to twelve steps so sprites are cached.

Progress is world time since placement over the build time, so it
continues across reloads and never depends on frames. While a site is
building, sawdust puffs every half second; on completion sparkles, a heart
and a "wooden shelter finished!" bubble. E at a finished shelter gives
hearts and "home sweet home"; at a site, the seconds left.

The live renderer draws buildings as drawables in painter's order with
their ground shadows, like objects. The World tab's static picture does
not show them (they are live state, like resources).

## 4. Stable world coordinates

Buildings are saved in the ISLAND FRAME: canvas coordinates minus the
carrier's origin (`src/carrier/`), the frame every gameplay coordinate is
defined in and that the growth requirements in `ROADMAP.md` keep fixed. A
later canvas (a bigger shell, a grown world) translates the frame by its
own origin and the building lands on the same island pixel. A test loads a
Variant 0 record into a Variant B world (origin 0,48) and checks the
building appears exactly 48 px lower on the canvas, on the same island
spot. Nothing resizes: the sprite is generated at the world scale, the
footprint is in pixels.

## 5. Persistence

Save schema version 3 adds `buildings` (id, kind, island-frame x and y,
placedAt, seed). Version 1 and 2 records migrate with no buildings;
malformed entries and unknown kinds are dropped. Reset clears buildings
and rebuilds the collision map. Autosave and save-on-leave are as before.

## 6. Preserved

The turtle, terrain, resources, crafting recipes, the axe and chopping,
regrowth, equipment rendering, autonomy and navigation are unchanged; the
only shared code touched is the save schema (additive) and the E dispatch
(build mode first, then collect, chop, interact). Autonomy never builds:
build mode and placement exist only on the player's input path, and a
test runs ninety seconds of autonomy beside a placed shelter with
materials in the bag.

## 7. Tests

139 pass (`npm test`; 130 after M2.3), typecheck and build pass. New
`tests/building.test.ts` (9): the sprite (deterministic, wood and thatch,
growing through posts, walls and roof); placement (edge, water, a tree's
footprint, the Blobbi, a resource, another building, a valid spot; the
preview following the facing); the loop (no materials, short by one stone,
paid atomically, footprint blocked, nav cells lost, the Blobbi kept out,
progress to completion with the bubble, a second placement refused on top
of the first); atomic consumption; the frame (green and red previews, the
sprite rising); persistence (island-frame record, reload mid-construction,
footprint re-blocked, schema 2 migration, bad entries dropped, reset) and
the cross-variant island-frame check; autonomy never building and walking
around the shelter.

## 8. What to review

- The shelter's look and size (24 × 10 footprint, about 34 px tall).
- Cost (6 wood + 3 stone) and the 24 s build time.
- Preview distance in front of the Blobbi and the two-pixel snap.
- Whether placing should keep build mode on for a second building.
- Interaction at the door ("home sweet home").

## Limitations

- One building kind; no removal or moving of a placed building.
- Buildings have no interior and no function yet.
- The static World picture does not show buildings.
- Building on a path is refused; a path to the door is not carved.
