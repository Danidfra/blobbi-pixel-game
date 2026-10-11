# Pixel Blobbi facial fidelity refinement (phase 4)

Scope: `blobbi-pixel-lab`, 2026-10-09. The canonical rasterizer from phase 3
kept the body silhouette but some faces and horns came out wrong. Positive
references were blobbi-9 and blobbi-19; regression cases blobbi-0 and
blobbi-1. The renderer was refined, not replaced.

Every claim below was checked on the sheets in `examples/fidelity/`
(`before/` and `after/` for the named seeds; `faces-gallery-1.png` and
`faces-gallery-2.png` for 24 seeds; expression and resolution sheets) and in
the playground's Fidelity tab, including its new 24-seed face gallery, in
Chrome. Each sheet row shows canonical V3 | pixel 24 px | face ×12 | crown
×12 | pixel 16 px | canonical 16 px, with the crops framed on the kit's own
eye line and crown so every row shows the same anatomy.

## 1. What caused the facial distortions

Three separate causes, found by dumping the kit's markup and the pixel
neighbourhoods of single eyes:

- **Highlights promoted to full pixels.** The kit's two eye highlights are
  ellipses of 0.3–0.5 px radius at 24 px. The phase 3 rule "a shape too
  small to win a pixel keeps its best pixel" turned both into full white
  pixels inside a 2–3 px iris, so irises read as mostly white and eyes as
  broken. The rule was right for glints on a large sprite and wrong here.
- **Sub-pixel brows drawn as solid bars.** Brow strokes are thinner than a
  pixel; drawn as 1 px lines at their nominal 72% opacity they became heavy
  dark bars just above the eyes and made neutral faces look stern.
- **Mouths rasterized point by point.** The mouth is a cubic stroke 0.3–0.5
  px thick and 2–4 px wide. Flattening it to 24 points and drawing 1 px
  segments between floored coordinates produced a different jagged pattern
  per seed depending on sub-pixel position, and my first arc pattern rounded
  every inner pixel onto the same row, flattening smiles.

The iris was also slightly small (about 50% of the white against the
drawing's 70%), because a 1.34 px radius ellipse sampled at pixel centres
lands on 2 or 3 pixels depending on where its centre falls.

A fourth cause surfaced while dumping 16 px eyes pixel by pixel: the lab's
own integer ellipse rasterizer (`core/pixel.ts`, used for the reconstructed
eye whites) started its row loop at `ceil(cy - ry)`, which skips a top row
whose centre is inside the ellipse whenever `cy - ry` falls just past that
row. At 16 px that was the eye white's top row, so a 2×3 white became 2×2
and the iris covered it entirely. Fixed to iterate every row whose centre
can be inside; the same fix slightly improves every ellipse in the world
(tree canopies, rocks), which is why the world snapshot hashes were re-pinned.

## 2. What caused the horn distortions

One cause: the kit writes horn bodies (and other rounded tips) with SVG arc
commands (`A rx ry rot large sweep x y`). The phase 3 path flattener parsed
only M, L, C, Q, Z, H and V. The regex that split commands did not know `A`,
so the arc's seven numbers were appended to the previous curve's number list
and read as extra cubic control points, which threw a huge cream shape
across the crown. That is the blob on blobbi-0 and blobbi-1 in
`before/compare-24px-named.png`. The canonical forehead horn is a small
plump cone a few pixels tall.

## 3. Rasterization improvements

- **Arcs**: the flattener implements elliptical arcs (the standard
  centre-parameterization conversion); unknown commands now throw instead of
  silently corrupting a shape.
- **Feature-aware eyes** (`svg-raster.ts`, `paintFeature`): the eye white is
  rasterized as a pixel ellipse from the canonical centre and radii (never
  thinner than 2 px or flatter than 3), the iris is sized to the drawing's
  share of the white in whole pixels (at least 2 px when the white is 3 px,
  never the whole white) with its centre snapped to the grid, the pupil only
  exists when it can be its own pixel, the primary highlight is one block
  the size of the canonical ellipse anchored at its canonical place inside
  the iris once the iris is 2 px wide, the secondary glint needs a 5 px iris
  and half a pixel of its own radius, and in eyes of four rows or fewer the
  white's top row stays white (the canonical iris sits low in the white;
  the white brow line is what keeps a 3-row eye reading as an eye).
- **Feature-aware mouths**: a closed front mouth is measured from the
  canonical curve (width between the corners, sag at the middle, direction)
  and redrawn as a symmetric pixel arc: two corner pixels on the corner row
  and the inner pixels bulging by the rounded sag. A curve needs three
  pixels, a flat mouth may be two. Open mouths (surprised) and profile
  mouths keep the generic rasterization.
- **Hairline strokes**: a stroke thinner than a pixel is drawn 1 px wide at
  an opacity proportional to its width (floor 40%), as its coverage would
  be. Brows become hints; the mouth is unaffected because it is
  reconstructed.
- **Ellipse rows**: the integer ellipse rasterizer no longer drops a top
  row (see §1).
- Everything else (body, feet, arms, tuft, antennae, patterns, marks,
  cheeks, lids) is unchanged from phase 3.

## 4. Which resolutions work best

| Size | Eyes | Mouth | Horns, antennae | Verdict |
| --- | --- | --- | --- | --- |
| 16 px | 2×2 iris under a white top row, one highlight | 3 px smile or 2 px line | 2–4 px, readable | floor for gameplay |
| 20 px | 2–3 px iris, ring on two sides | 3 px with curve | clear | good gameplay size |
| 24 px | 2–3 px iris, white ring, highlight | 3–4 px curve, open mouth as a block | clear | best match; inspection |
| 32 px | 4–6 px iris, 1×2 highlight, glint | 4–5 px curve | clear | portraits |

The game keeps 16 px (not increased): at 16 the face is readable and the
scaled world proportions from phase 3 hold. A 24 px sprite scaled down to
16 on screen was not pursued: nearest-neighbour downscaling drops rows and
columns and the eye highlight or mouth pixels vanish unpredictably, which
is worse than a sprite built for 16 px.

## 5. blobbi-0 and blobbi-1

Both improved. Before: a cream blob across the crown, eyes mostly white
with a dark fringe, a flat mouth. After: a small forehead horn where the
canonical has it, two antennae with coloured tips, dark irises with a white
ring and one highlight, a 3 px smile, pink cheeks. See
`examples/fidelity/before/compare-24px-named.png` against
`examples/fidelity/after/compare-24px-named.png`, and
`after/faces-named-neutral-24-16.png`.

## 6. blobbi-9 and blobbi-19

Both remain good and are slightly better: the brows no longer read as a
frown on blobbi-9, and blobbi-19's eyes keep their ring and highlight at
16 px. The 24-seed gallery (`faces-gallery-1.png`, `faces-gallery-2.png`)
shows the same construction holding across colours, eye sizes, mouth widths,
all three horn kinds, both ear kinds and the antenna counts.

## 7. Remaining limitations

- Happy and neutral are nearly the same pixels at 16–24 px, because the
  kit's happy smile is only slightly deeper than its resting smile and its
  raised brows move by under half a pixel; the canonical drawing shows the
  same at that size. Excited, sad, surprised and sleepy are distinct.
- Profile mouths are not reconstructed; they are a 1–2 px generic stroke.
- The iris sits where the kit puts it (low and a little to the viewer's
  right), so in small eyes the white ring is often one-sided.
- The pixel outline and four-band shading remain stylistic choices over the
  canonical art, switchable in the lab.
- Brows at 40% are hints; an artist may want them stronger for some
  expressions.

## Tests

78 tests pass (`npm test`); the 8 new ones in `tests/faces.test.ts` measure
against the kit's own geometry per seed: eye whites, dark iris and a
highlight within the canonical highlight's reach at 16, 24 and 32 px; mouth
ink count, width and centring against the canonical mouth endpoints;
expressions as different ink patterns with the surprised mouth a solid 2×2
block and lids reducing white; horns small, cream, attached to the body and
stable through walk frames for forehead, top and side horns; antenna tips
at their canonical positions at 16 and 24 px; determinism and bounds across
expressions. The pinned sprite hashes were re-pinned after inspection.
