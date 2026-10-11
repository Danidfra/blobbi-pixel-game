# Shell refinement and World Carrier: report

Scope: `blobbi-pixel-game`, 2026-10-09, after M1. Not a turtle redesign:
the head, face, eyes, mouth, neck, flippers, expressions and animations are
the M1 ones, pixel for pixel. What changed is the shell under the island,
offered as three comparison variants beside the unchanged M1 turtle, and a
minimal World / World Carrier separation underneath. Nothing is marked
complete: the user chooses a variant (or none) after looking at the images.

## Baseline

Git was initialised and the M1 state committed before any change:

    ccc2021d1ee6f663bb6477af3e15066c09dea6e0  M1 baseline: living turtle world, autonomous Blobbi, canonical pixel Blobbi

Nothing was pushed; there is no remote. The refinement is uncommitted in
the working tree, so `git stash` or `git checkout -- .` plus removing the
untracked files restores the baseline exactly, and `git diff` shows all of
it. Reference images of the baseline: `examples/turtle/variant0-contact-
sheet-9-turtles.png` and `examples/turtle/anatomy/turtle-N-anatomy.png`
(head, blink, both glances, four flippers for six seeds), with their pixel
hashes pinned in `tests/__snapshots__/turtle-anatomy-hashes.json`.

## The four variants

| Variant | Target | Measured (turtle-0..3) | Shell growth | Canvas | Island frame origin |
|---|---|---|---|---|---|
| 0 (M1, unchanged) | - | 91.2-91.6% | 1.000 | 704×480 | 0,0 |
| 1 / A | 60% | 60.0% | 1.244-1.245 | 704×608 | 0,64 |
| 2 / B | 70% | 70.0-70.1% | 1.148-1.150 | 704×576 | 0,48 |
| 3 / C | 80% | 80.0-80.1% | 1.071-1.073 | 704×544 | 0,32 |

Coverage is island area over shell area (both from the radius functions),
so "60%" means the shell is 1/0.6 times the island's area. The island does
not shrink; the shell grows around it, and the canvas grows (upward by the
origin, downward for the head) so the bigger shell, the head and the
flippers fit. Every seed of a variant shares one canvas.

Images (`examples/turtle/variants/`):

- `turtle-N-variants.png`: the four variants side by side with the island
  at the same place in every panel, captioned with measured coverage,
  canvas and origin. `all-variants.png` stacks the four seeds.
- `turtle-N-play.png`: the Play view (352×224 at 3×) with the same camera
  in all four, looking at the hub, the shell's south edge and the head.
- `turtle-N-variantK.png`: each world on its own.

The playground has a "Shell variant" selector under the turtle seed (also
`variant=K` in the URL hash); the statistics line shows carrier, variant,
measured coverage and origin. World, Play and Gallery all honour it.

## What the shell is made of (variants 1-3)

`src/carrier/shell-surface.ts`, drawn once into the body buffer under the
terrain, deterministic from the turtle seed, the anatomy and the island
outline. From the island outward:

- **Soil band.** Earth under the land's edge, thin on the shaded (north and
  west) sides, thicker on the sunlit south side where it becomes an earth
  face with a lit top edge and a dark foot, and a shadow band on the shell
  beyond it. The outer edge crumbles into a hash-dithered fringe, so the
  land reads as resting on the shell rather than outlined on it. No uniform
  brown ring: the earth tone is the path colour mixed with the shell's
  dark.
- **Plates.** Marginal scutes in one row (variant 3) or two brickwork rows
  (variants 1, 2): 16-32 plates per row from the genome's marking density,
  seam angles jittered, each seam leaning and wobbling along its length so
  no two are parallel, the ring seam between rows waving, junctions rounded
  by a small dark corner. Each plate: the dome's banded lighting, its own
  tint (a shade lighter or darker for about a third of them), a one-pixel
  bevel (lit wall below and right of a seam, rolled edge above and left), a
  growth ring inset from the edge for the `rings` marking style, sparse
  dark spots for `spots`, a rare freckle. The inner row uses the shell
  ramp, the outer row a lighter mix toward the rim colour.
- **Moss.** Small patches on the plates near the soil and dust in the
  seams, from a fine noise thresholded against the distance from the land;
  none on the lip. A bluish-dark moss ramp, lit on the top-left edge.
- **Lip.** The shell's lighter edge, 3 px, in the rim ramp with the dome
  lighting, then the dark outline and the sea's foam.

Variant 0 does not use any of this: `paintM1Shell` in `src/turtle/
turtle.ts` is the M1 dome code moved into a function, byte for byte.

## Preservation

- **Anatomy.** `turtleAnatomy` takes an optional shell fit. Without it the
  function is the M1 function (same expressions, same rounding). With it,
  part sizes (head radius, neck width and length, flipper length and width,
  tail) come from the reference anatomy, and positions move by whole pixels
  from the reference: the head and neck by the growth of the shell's south
  edge, the tail by the north edge, each flipper by the rounded offset of
  its new base, so every sprite keeps its sub-pixel phase and its pixels.
  `tests/turtle-anatomy.test.ts` asserts the pinned hashes for Variant 0 and
  the same hashes for the head, blink, both glances and all four flippers
  in every variant, plus equal part sizes, neck length and flipper axes.
- **Animation.** The live renderer blits the same head and flipper buffers
  at the anatomy's positions; a live-frame test checks the resting head is
  drawn exactly where the anatomy says in all four variants. Blink, glance
  and paddle schedules are untouched.
- **Gameplay coordinates.** Variants 1-3 generate the Variant 0 world (the
  same function, the same inputs) and embed it by one translation, `carrier.
  origin` (x = 0, y a multiple of the 4 px nav cell). Terrain classes,
  distance and elevation of every land pixel, every object, hub, path and
  the plateau are equal after the translation; the walkable pixel count is
  equal; no walkable pixel lies off the island; the nav grid has the same
  free-cell count; and 30 simulated seconds (autonomy plus two seconds of
  keyboard input) give the identical Blobbi trajectory, brain states and
  facing, shifted by the origin. The sea around the shell is reclassified
  (RIM for the bigger shell, SKIN, foam bands), all non-walkable.

## World / World Carrier separation

`src/carrier/`:

- `types.ts`: `ShellVariant`, `SHELL_VARIANTS` (labels and targets) and
  `WorldCarrier` {species, seed, variant, coverage {target, measured},
  origin, frame, canvas, growth, turtle anatomy}.
- `turtle-carrier.ts`: `shellGrowth` (closed form for the growth factor),
  `measureCoverage`, `variantCanvas` (sized for the largest genome of the
  species), `buildTurtleCarrier`, `onShell`, `classifyAroundCarrier` (RIM /
  SKIN / sea bands) and `embedInCarrier` (the translation).
- `shell-surface.ts`: the plate surface and its region map.

`WorldDescription` gains `carrier`; `turtle` stays as the anatomy for
existing consumers. `WorldOptions` gains `shellVariant`. The island side
(`src/world/turtle-world.ts`) is unchanged for Variant 0 and, for the
others, generates in the island frame and hands the result to the carrier.
`renderTurtleBody(anatomy, shellPainter?)` draws the species' body; the
compositor's `turtleBodyForWorld` picks the M1 shell or the carrier's
surface. No new species, no carrier registry, no interfaces beyond the
record above.

## Tests

101 pass (`npm test`; 93 before), build passes. New: `tests/turtle-anatomy.
test.ts` (2) and `tests/shell-variants.test.ts` (6): Variant 0 is the
default and byte-identical; island-frame embedding; identical simulation;
coverage within 2.5 points of target, shell contains the island, the ring is
RIM and nothing else is, monotonic ring width, parts inside the canvas;
deterministic surface with soil, plates, seams, lip and moss present in
sane shares and every RIM pixel covered; live-frame head placement in all
four variants. All earlier tests unchanged.

## Limitations

- Coverage is measured on the radius functions, not on the raster; the
  rasterised ring differs by under a pixel.
- The canvas grows per variant (up to 704×608 for A), so the World tab shows
  variants at the same zoom but a taller map; the Play camera is identical.
- The shell colour is the genome's: brown seeds (turtle-0, turtle-1) give a
  brown shell, teal seeds (turtle-2) a teal one. The earth band is tinted
  toward the shell so it never reads as a foreign ring, but the two brown
  seeds are the closest to "brown outline" of the four; judge those with
  the play views, where the plates read clearly.
- Bridges and piers are translated but a turtle world has none.
- The M1 scute seams on the rim of Variant 0 are not reused by the new
  surface; the two looks are independent by design.
