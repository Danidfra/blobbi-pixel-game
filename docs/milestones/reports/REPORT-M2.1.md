# M2.1: Resource gathering. Implementation report

Scope: `blobbi-pixel-game`, 2026-10-10. The first gameplay loop: explore the
turtle, find sticks, stones and seeds, collect them with E, keep them in a
local inventory that survives a reload. M2.1 is implemented and awaits the
user's gameplay review; M2 is not marked complete.

Before M2.1, M1 was finalized: Variant B (70% island coverage) is the default
shell, the other variants stay selectable, the suite passed (101) and the
state was committed locally as `0d9e88c` on top of the baseline `ccc2021`.
Nothing was pushed. The M2.1 work is uncommitted in the working tree.

Images: `examples/gathering/turtle-0-gathering.png` (headless frames: each
resource in reach with its marker, the pickup, the counter, then a reload on
the same store with the node gone and the bag kept). The playground is at
http://127.0.0.1:5177 in Play mode.

## 1. Resources in the world

`src/game/resources.ts`. Nodes are generated from the world, not placed in
it: one keyed stream per kind, consumed in placement order, so a node's
position depends only on its own kind's stream and the placements before it.

- **Sticks** under trees: 60% of trees get one, half of those two, 6-13 px
  from the trunk.
- **Stones** by rocks (70%, sometimes two) and five to nine loose on the
  forest floor or at a cliff's foot.
- **Seeds** by bushes (45%) and flower clusters (30%).

Every node sits on a whole pixel of walkable, non-path ground where a small
foot can stand, at least 7 px from any other node. Ids are `kind:n` in
generation order, stable for a world. Three hand-set sprites per kind (5-9 px
with the lab's one-pixel outline, palette colours) draw in painter's order
with the objects; nodes have no footprint, the Blobbi walks over them.
turtle-0 has 63 nodes, turtle-1 to turtle-3 between 40 and 70.

## 2. Collecting

`LiveWorld.nearestResource()` is the node within `REACH` (11 px, measured
from the Blobbi's ground point, vertical distance weighted 1.25). The reach
is short enough that a node on the far side of a tree is out of reach
because the footprint keeps the player away; there is no collection through
anything. On E the player path calls `collect()` first; if nothing is in
reach, the M1 interaction runs as before (shaking trees, reading signs). On a
collection: the node leaves the ground, its sprite floats up for half a
second and flickers out, two sparkles, a happy hop, a bubble "+1 stick 3/50",
the counter in the frame's corner and the Inventory panel update. A full
stack refuses with "sticks full" and a sad shrug; the node stays. A reachable
node shows a small bobbing marker above it.

The brain's own interactions call the M1 `interact()` only. There is no path
from autonomy to `collect()`; the test runs two minutes of autonomy on two
seeds, confirms the Blobbi passed within reach of resources and inspected
things, and that nothing was collected and nothing was saved. Manual input
overrides at once as in M1 (tested again with sliding against blocked
ground).

## 3. Inventory

`src/game/inventory.ts`: item ids in the `game:category:name` style the
inventory protocol uses for `d` tags (`blobbi-pixel:resource:stick`),
integer quantities, a stack limit per item (sticks 50, stones 30, seeds
20), `add`/`remove` returning what actually moved (0 past the limit, nothing
for non-positive or fractional amounts), empty stacks dropped, entries sorted
by id so a snapshot is the same whatever the order of collection, an
advisory `revision` bumped only when something moved, and
`snapshot()`/`fromSnapshot()` (clamping and dropping invalid entries).

Compatibility with `@nostr-games/inventory` (read, not used): that library
holds a kind:31633 inventory as a context (`d`), item references with
positive integer quantities and a revision. The snapshot here has the same
three pieces, with item ids ready to become `31632:<issuer>:<d>` addresses
and the world identity as the context. A later adapter maps a snapshot to
the library's builders; nothing of its protocol is reimplemented here.

## 4. Persistence

`src/game/persistence.ts`: one versioned record per world identity in a
key-value store (localStorage in the playground, a Map in tests), key
`blobbi-pixel-lab:save:v1:<identity>`. The identity is the world seed, kind,
turtle seed, shell variant, canvas size, scale, palette, density and island
count: another seed, variant or size is another record; the Blobbi is not
part of it (the inventory belongs to the world). The record holds the
collected node ids (sorted) and the inventory snapshot, is written on every
collection, and is ignored whole when its version, identity or shape does
not match. "Reset resources & inventory" in the Play panel clears it. The
live world takes the store as an option; without one nothing persists
(tests, scripts).

## 5. Playground

Play panel: an Inventory block (counts over limits, nodes left on the ground,
collected this session, what is in reach, the revision) and the reset
button; the hint explains where resources lie. The frame carries the
counter in its top-left corner (a `hud` render option).

## 6. Tests

110 pass (`npm test`; 101 after M1), typecheck and build pass. New
`tests/gathering.test.ts` (9): deterministic placement on walkable non-path
ground near the right sources, unique ids, minimum spacing, different worlds
differ, sprites; collection distance (far: nothing, in reach: exactly one,
feedback, pickup ends), reach across a footprint, stack limit with feedback;
inventory operations and limits and snapshots; persistence across a reload,
version and garbage rejection, reset; world isolation by seed, variant and
kind, shared by Blobbi, no store no persistence; autonomy never collecting;
manual override, movement and collision and the ordinary interaction as
before. All earlier tests unchanged.

## 7. What to review

- Whether sticks, stones and seeds read at play zoom (5-9 px sprites).
- Reach (11 px): too strict or too loose.
- Stack limits and the "full" feedback.
- The counter in the frame corner versus the panel only.
- Whether seeds should come from bushes and flowers (as now) or from trees.

## Limitations

- Nodes do not respawn; a cleared world stays cleared until reset.
- The pickup is a float-and-flicker, not a per-resource animation.
- Resources are a live-world layer: the World tab's static picture does not
  show them.
- Planted trees do not drop sticks.
