# M1: The living turtle. Implementation report

Scope: `blobbi-pixel-game`, 2026-10-09. M1 asked for the actual turtle of
the original concept, a more elaborate shell terrain, an autonomous Blobbi
with manual override, a cross-eye fix, subtle turtle animation, a playground
mode, tests, screenshots. Before M1 the three M0 closing items were done.
M1 is implemented and awaits the user's visual review; it is not marked
complete.

Screenshots: `examples/turtle/` (four turtle seeds at 2×, a nine-seed
contact sheet, two autonomy frames with the path overlay). The playground
is at http://127.0.0.1:5177 in turtle mode by default.

## M0 closing

- **Cross-eyed gaze.** Cause found by dumping eye pixels: the kit was handed
  a sub-pixel gaze and each iris was then snapped to the grid on its own, so
  one eye stepped a pixel and the other did not; a second source was the
  canonical-offset nudge measured against each eye's snapped white centre;
  a third, at 16 px, was the cheek ellipse painting over one eye's corner
  pixel. Now the kit draws the resting gaze, both irises are placed by one
  rule from their white's pixel box (ties broken right and down for both),
  the gaze is one whole-pixel shift shared by both eyes, pupils ride inside
  the iris, and cheeks never paint over eyes. `tests/gaze.test.ts` measures
  the iris offset in each eye against the kit's eye positions for ten seeds,
  three sizes and three gazes.
- Idle, walk and turn bound stability and the gallery-equals-game check
  were re-run and pass (`tests/fidelity.test.ts`).

## 1. The turtle is the island

`src/turtle/turtle.ts` generates a `TurtleGenome` from the turtle seed
(keyed streams) and an anatomy in world pixels: an oval shell (half-axes as
fractions of the map) with k=6 facet and k=4 squareness harmonics, a rim, a
round head facing the viewer below the shell on a wrinkled neck, four
rotated-ellipse flippers rooted on the rim (front pair below the centre,
rear pair above and smaller), a short tail at the back. The shell's radius
function is also the `Island` record's radius function (an `aspect` field
was added to islands), so `rasterizeTerrain`, hubs, paths, placement and
ground dressing run on the shell unchanged. `src/world/turtle-world.ts`
then rewrites the sea: beach bands become `RIM`, body parts `SKIN`, and foam
and shallows wrap the union of shell and body. The body is drawn once
(`renderTurtleBody`: banded shell dome under the terrain, rim with scute
seams and a lit lip, neck wrinkles, flippers with toe creases, head with two
eyes, a jaw, nostrils and a smile) and the painter copies rim and skin
pixels from it. One composition, not an icon under an island.

Variation: shell proportions, facets, markings style and density, head and
flipper proportions, rim, shell and skin colours from small hue lists, eye
colour, pond and meadow layout, vegetation. Ranges are narrow; the nine-seed
sheet reads as one species.

## 2. Terrain on the shell

Added classes: `POND` and `POND_EDGE` (a freshwater pond with a muddy
bank, lobed outline, placed off the hub on one level), `MEADOW` (one or two
lobed patches of lighter grass with hashed blooms), plus the existing
plateau and cliff, forest floor, clearings and paths. New paths: hub to the
prow (front edge), hub to the pond, hub to the plateau centre (the
overlook). Where a path crosses an elevation boundary it is carved twice as
wide, so the ramp fits a character.

Walkability became explicit: a `WALKABLE` set of classes drives collision,
placement, path interiors and the nav grid, so rim, skin, pond and sea are
blocked and nothing walkable is untraversable. A connectivity test floods
the nav grid from the hub with A*'s own connectivity and requires over 90%
of free cells reachable; measured 99.8–100% on the first eight seeds. Solid
objects keep a 12 px corridor between footprints so a 16 px Blobbi passes
between any two trees.

## 3. Turtle animation

The static layer holds the body without head and flippers (water lies
under them); each frame the live renderer blits the four flippers with a
slow one-pixel paddle along their axes (phased per flipper), and the head
with a breathing bob, a blink variant on a seeded schedule and left/right
glance variants. Ripple particles expand now and then by a flipper tip.
The terrain never moves, so collision and character coordinates are stable.

## 4. Blobbi autonomy

Investigation: phase 2 implemented only idle glances; there was no
wandering, so nothing autonomous could appear in the playground. `src/sim/
brain.ts` adds a `NavGrid` (4 px cells, free when a slightly inflated foot
can stand at the centre) over the existing collision map, A* with an 8-
neighbourhood, no corner cutting and string pulling verified at half-pixel
steps, and a `Brain` with idle, wander (40–120 px targets that A* can
reach), inspect (walk to a nearby decor, flower, house, tree, bush or rock,
face it, react) and rest (after a few wanders, eyes closed). Choices come
from a keyed stream; two runs are identical. The brain emits a movement
intent that goes through the same `collision.move` and animator as the
keyboard. WASD, E or P switch to manual immediately; five seconds after
the last input autonomy resumes. The statistics show the state, the note,
the destination and the manual countdown; an overlay draws free nav cells,
the path and the target. Headless, 90 simulated seconds on turtle-0:
wander 25 s, idle 41 s, rest 24 s, inspect in between, 12 destinations,
zero steps off walkable ground.

## 5. Playground

World kind (turtle / islands), turtle seed with a random button, Blobbi
seed, autonomy toggle, path overlay, world and turtle seeds in the URL
hash; the gallery renders one turtle per tile when in turtle mode. The
comparison and face galleries from M0 are untouched.

## 6. Performance

Headless (`npm run perf`, island worlds): render 0.3–0.4 ms per frame. In
Chrome on turtle-0 (322 sprites drawn, turtle overlay, path overlay) the
panel showed sim 0.8–1.4 ms and render 5–6.5 ms per frame; the FPS figure
itself is throttled by Chrome because the extension-driven tab is a
background tab, as in earlier phases. The turtle body is drawn once and
cached; the static layer is copied by rows; the head and flippers are four
small blits.

## 7. Tests

93 pass (`npm test`): 21 new in `tests/turtle.test.ts`, `tests/brain.test.ts`
and `tests/gaze.test.ts`. Covered: deterministic genome, anatomy, world and
pixels; one-species proportion ranges; valid anatomy (shell and head inside
the map, head below the shell on the neck, four flippers rooted on the rim
reaching outward, tail at the back, part classification); a recognizable
body (two symmetric eyes, blink and glance variants with the same
silhouette); walkable pixels only on the shell with rim, skin, pond blocked;
hub connectivity; objects on walkable ground; rim and skin painted in body
colours; pathfinding and path following with the real movement; autonomy
visiting several places without leaving walkable ground; determinism;
manual override and resumption timing; islands still work; coherent gaze
across seeds, sizes and glances.

## 8. What to review visually

- Whether the turtle's head and flippers have the charm you want (one head
  design; eyes, jaw, smile).
- Shell rim colour against the terrain, and the dome shading, which is
  mostly hidden by the land.
- Density on the shell (the corridor rule thinned groves).
- The Blobbi's resting pose (closed eyes only).
