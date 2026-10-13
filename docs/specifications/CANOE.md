# Specification: The canoe

## 1. Purpose
The first boat: a small, cozy canoe that lets the Blobbi leave the island and explore the sea round its World
Carrier — gently, safely, and always able to come home.

## 2. Status
**IMPLEMENTED** (M10 phase B; polish in phase C). Manually tested by the owner after phase B — PASS: crafting and
unlocking, launching, boarding, navigating, the camera zooming while navigating, returning to shore, going ashore,
fishing from the canoe. Still **NOT TESTED** by a person: save/reload aboard, the canoe on all three Carriers, and
everything added in phase C (headings, the edge, calling it back). No travel to other islands, no underwater scenes
([the ocean, later](../architecture/OCEAN-FUTURE.md)).

## 3. Player-facing behaviour
- **Making it**: a workbench recipe (8 wood, 4 sticks, 2 cloth), known once the side quest *Gone fishing* is done —
  the island has a fisher, so it already has shore within reach of the sea.
- **Where to launch (M10 phase C)**: every island has a **landing** from its first growth — a short tongue of shore to
  the water, marked on the map ([ocean access](OCEAN-ACCESS.md)). Before the sea is reachable, E with the canoe at a
  far sea says "the ocean is still out of reach" (and that growth opens a path).
- **Launching**: with the canoe in the bag, stand at the shore facing open water: **E  launch the canoe**. It floats
  a step or two out, pointing the way the Blobbi faced, and is moored there (the item leaves the bag).
- **Boarding**: near the moored canoe (18 px from its hull): **E  get in the canoe** — a 0.4 s hop in. The Blobbi
  sits in it (its lower body hidden by the near side), a tip says how to paddle and land.
- **Paddling**: arrows / WASD, or the touch stick: gentle acceleration, drag when let go, top speed 30 px/s (a
  little under walking, 42). The canoe turns to the stronger direction held, unless the turn would not fit (it
  keeps its heading in a narrow channel). Paddle strokes ripple; the paddle dips on alternate sides.
- **Where it can go**: open water only — never over land, the Carrier's body, or where its flippers, wings or flukes
  sweep (`movingPartsMask`) — inside **the canoe's sea**: the Carrier's bounding box plus 150 px of sea all round,
  reaching past the world's edge into the open sea. In its outer 36 px band rough water (whitecaps) shows and a
  current turns the canoe back; the first time the Blobbi says *the current pulls back toward the Carrier*. Nothing
  lies beyond: the sea there is drawn, but it is not a place yet. (M10 phase C, KI-51: the band follows a rounded
  outline that breathes in and out by up to 13 px, drawn as an ordered-dither darkening under whitecaps and rough all
  the way beyond — no straight line anywhere.)
- **Landing**: by the shore **E  go ashore** — a hop onto the nearest ground that is standable and connected on foot
  to the hub, within a step of the hull (never an islet the Blobbi could not walk back from). The canoe stays moored.
  Far from land, E says *paddle to the shore to land*.
- **Aboard** the Blobbi can fish (**E  cast the line** at open water ahead: the same `fish()`; the line still leaves
  the rod's tip), greet the seal or the glowing ray, and visit the ocean's features (a bottle adrift, the kelp garden,
  the silver shoal — see [gameplay systems](../game-design/GAMEPLAY-SYSTEMS.md#the-sea-m10)). Nothing is built or
  placed from it; R says to land first.
- **Camera**: follows the canoe in every mode (overview frames the Carrier, as on foot), within the canoe's sea, on
  whole pixels.
- **Calling it back (M10 phase C, KI-52)**: while the canoe is moored, the bag says so and offers **CALL IT BACK**:
  from anywhere ashore it returns to the bag (never while aboard, only into a bag with room). There is never more than
  one canoe on the water, and it can never be lost.
- **Looks (M10 phase C, KI-50)**: one hull profile in every heading — a fuller stern and a sharper bow, ends that rise
  (the near side sweeps up with them), planks along its length, a stem post at the bow, and a V prow when it points at
  the viewer — so each of the four headings reads as a canoe and shows which way it goes.

## 4. Controls
E (launch, board, land, cast, greet, visit) · arrows/WASD or the touch stick (paddle) · USE button on touch = E.

## 5. Data structures
`BoatState { x, y, heading, vx, vy, aboard }` (`src/game/canoe.ts`); `CANOE` (speed, accel, drag, half length 13,
half beam 5, margin 150, band 36, reach); `SeaNav` (water, `canFloat`, `edge`); `stepBoat`;
`LiveWorld.boat`, `boarding`, `seaNav()`, `launchSpot()`, `launchCanoe()`, `nearBoat()`, `boardCanoe()`,
`landingSpot()`, `goAshore()`, `recallCanoe()` (phase C), `canoeTooFar()` (phase C). `CANOE.corner` and
`CANOE.wobble` shape the edge (phase C). Drawing: `src/render/canoe-render.ts` (hull profile `beamAt`/`sheerAt`, near
side, paddle).

## 6. State transitions
in the bag ─E at the shore─► moored ─E beside─► (hop) aboard ─paddle─► aboard ─E by the shore─► (hop) moored.

## 7. Persistence
Save schema 11 `boat: { x, y, heading, aboard }` in the island frame. Reloading aboard puts the Blobbi back in the
canoe where it was. A canoe whose spot is no longer open water (the island grew there) is moved to the nearest open
water within 120 px, or, with none, goes back into the bag with the Blobbi ashore by the hub — never stranded.

## 8. Edge cases
The seal or a find in reach answers E first (as on land). A drifting canoe still lands on the spot the prompt
offered if it is within a step. Visitors cannot launch or board. Reset puts a Blobbi that was afloat back on the
island.

## 9. Failure handling
An invalid `boat` record (non-numeric position) loads as no canoe; an unknown heading as `right`.

## 10. Source files
`src/game/canoe.ts`, `src/render/canoe-render.ts`, `src/sim/live-world.ts` (canoe section, `stepCanoe`,
`settleBoat`), `src/render/live-render.ts` (drawables, `drawRoughWater`), `src/render/view-camera.ts` (offset
bounds), `src/content/tools.ts` (`CANOE_ITEM`), `src/game/crafting.ts` (recipe).

## 11. Automated tests
`tests/canoe.test.ts` (crafting, launch, the hop, paddling, open water and the region on every Carrier at stages
1–4, back to the landing and ashore every time, the current, save/load aboard and moored, a misplaced canoe, fishing
from it, the overview framing, touch); `tests/canoe-polish.test.ts` (the headings, the breathing edge, calling it
back, fish icons); `tests/ocean-access.test.ts`.

## 12. Known limitations
One canoe per island (by design). Four headings, no diagonals, no bobbing (KI-50: they now read well, but there are
still four). See [known issues](../testing/KNOWN-ISSUES.md).

## 13. Extension points
More boats: another `BoatState` kind with its own `CANOE`-like numbers and sprites. Travel: the region's edge is where
a future crossing would begin (docs/architecture/OCEAN-FUTURE.md).
