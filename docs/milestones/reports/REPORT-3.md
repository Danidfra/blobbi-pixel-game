# Pixel Blobbi fidelity pass: technical report (phase 3)

Scope: `blobbi-pixel-lab`, 2026-10-09. The brief: the procedural pixel
characters were cute but did not resemble the actual Blobbi V3 adults.
Reproduce the EXISTING identity in pixels, fix the character's scale in the
world, make the gallery and the game draw the same thing, keep animation
faithful, and prove it with a side-by-side lab against the canonical renderer.

Everything visual below was inspected on rendered images: the comparison
sheets in `examples/fidelity/` (canonical V3 by resvg | pixel raster |
previous native sprite, per seed and pose, at 16, 24 and 32 px), the
reference PNGs there, the Blobbi sheets, the live-world frames, and the
playground's Fidelity and Play modes in Chrome.

## 1. Ground truth

The canonical Adult V3 is `renderBlobbiSvg` in `@blobbi-kit/renderer`
(`procedural` subpath, published 0.6.0, the same engine as the kit checkout
and the one blobbi-procedural draws through). Its output was studied as SVG
(groups with rig transforms, the body path under a radial gradient, pattern
and mark groups clipped to the body, eyes as white / iris / pupil / two
highlights, brows and mouth as strokes, cheeks as translucent ellipses, feet
as ellipses under the body, arms as hand-drawn paddles, tuft leaves,
antenna stalk and tip) and as rasters: `scripts/references.ts` writes it at
240 px for four seeds and six poses, `scripts/compare.ts` puts it beside the
pixel versions at the same standing height. No canonical file was modified.

## 2. Rendering strategy: B, rasterizing the canonical drawing

Two approaches were built and compared on the same seeds and poses.

- **A, native pixel geometry** (phase 2's `native-sprite.ts`): an egg
  silhouette and hand-placed features driven by the genome's genes. The
  comparison sheets show it is a different creature: a rounder body, eyes too
  high and too large, a longer antenna, feet and arms invented. Sharing the
  genome did not give the look.
- **B, controlled rasterization of the canonical geometry**
  (`svg-raster.ts` + `canonical.ts`): the kit's own SVG for the exact state
  (view, direction, expression weights, lids, gaze, motion phase), read by a
  small parser for its dialect and painted into the pixel buffer with
  pixel-art rules: a pixel is on when at least half its 3×3 sub-samples are
  inside the shape (coverage thresholded, never blended), gradients become
  four bands of their own stop colours, strokes thinner than a pixel become
  one-pixel lines, a shape too small to win a pixel still gets its best
  pixel (glints, freckles), blurred soft shadows are skipped (the world draws
  shadows), markings get an opacity floor (the kit paints stripes and spots
  at 50% over a gradient, which vanishes at 16 px; the shape and colour stay
  the kit's), and a one-pixel outline is added outside the silhouette
  (switchable). The ground anchor is read from `buildBlobbiGeometry`, so the
  sprite stands where the kit says it stands.

**B was selected.** It is deterministic, identical in Node and the browser,
costs about 4 ms per pose (SVG 1.4 ms, raster 1.2 ms, geometry 1.4 ms) and
is cached by pose key, and it carries every trait, pattern, mark, expression
and the kit's own walk cycle with no second morphology to maintain.
`buildBlobbiSprite` now delegates to it; A remains only for the lab's
"show native" toggle.

## 3. How closely the pixel Blobbi matches Adult V3

At 24 px (inspection): the silhouette (narrow crown, full base, the tuft's
lean), the face height on the body, eye spacing and the white-ring-and-iris
look with a highlight, the mouth line, cheek blush, paddle arms, the two
feet, antennae with tips, horns, ears, tails, stripes, spots, gradient
bodies and the special mark are all the kit's, pixel-snapped. Expressions
read as the kit's (happy smile, sad lids and inner brows, surprised wide
iris and open mouth, sleepy). The profile has the face at the front edge,
one arm over the body, both feet; the back has no face, the pattern across
the back, the tail. Left is the mirror of right in silhouette (lighting
stays on the viewer's left, as in the kit).

At 16 px (gameplay): still unmistakably the same individual: body shape,
colours, eyes, cheeks, antenna, markings. Fine features compress to one or
two pixels (mouth, brows, the mark's glyph), and the outline is a larger
share of the silhouette.

At 12 px: identity survives through colour and silhouette; the face is a
hint. Not recommended for play.

The sheets to look at: `examples/fidelity/compare-24px-front-expressions.png`,
`compare-24px-views-walk.png`, `compare-16px-gameplay.png`, `compare-32px.png`.

## 4. What remains difficult to reproduce

- Soft gradients and translucency: the kit's body is a smooth radial
  gradient with a shine and translucent cheeks; the pixel version bands it
  into four tones and composites the cheek once. The result reads right but
  is harder-edged than the original.
- Antenna stalks and brows thinner than a pixel: drawn as 1 px lines, which
  are relatively thicker than in the original.
- The 1 px outline is not in the canonical art. It is kept on by default so
  the character reads against the world's outlined objects; the lab can turn
  it off.
- Sub-pixel motion: the kit's walk moves feet by fractions of a pixel at
  16 px; frames are quantized to six per cycle (`WALK_FRAMES`), which reads
  as a walk at 3× zoom but is coarse at 2×.
- Nothing is hand-corrected per pixel, so the occasional one-pixel notch at
  a tangent (the crown, the foot bottoms) stays.

## 5. Logical resolution

The pixel size is the standing height (ground line to crown apex, tuft and
antennae extra), with the canonical adult's standing height of 175.7
viewBox units mapped onto it; the whole drawing is about 1.36× that. The
useful range is 16 to 32 px: 16 is the smallest at which the face and
markings survive, 24 is the inspection size where the match is close, 32
and above are portrait sizes. The playground's Fidelity lab exposes 12 to
48 px.

## 6. Character scale in the world

Phase 2 had an 18 px Blobbi beside 18–32 px trees and 20–30 px houses with
6 px doors: the Blobbi dominated. Instead of shrinking the character, the
WORLD got a scale parameter (`WorldOptions.scale`): object sizes, shore
bands, bridge and path widths, piers, cliffs, clearings and all placement
distances are stated at scale 1 and multiplied. The default world is now
704×448 at scale 1.6, with 29–51 px trees, 32–48 px houses with 10–14 px
doors, 11 px bridges and 6 px paths, and the Blobbi defaults to **16 px**.
In the frames (`examples/live-frame-scaled-world.png`, Play mode) it is a
small creature at the hub beside a house taller than it, under trees two to
three times its height, and still readable. Both knobs are independent in
the UI: world scale (1.0, 1.3, 1.6, 2.0) and Blobbi size (12 to 32), with
camera zoom a third, separate control. Placement was tightened for the
larger objects: a house reserves its whole drawn rectangle, and tree
canopies keep off the hub plaza.

## 7. Gallery versus gameplay

Causes found: the gallery drew at 24 px and the game at 18 px (resolution),
and both went through the native geometry whose features were placed by
rounding rules that behaved differently per size and view. There was never a
separate "pretty" renderer, but there were two sizes and a renderer whose
output was not stable across them. Now one function, `buildBlobbiSprite`,
serves the live world, the Blobbi gallery, the direction preview, the
Fidelity lab and the tests; a test asserts a live-world sprite equals a
direct build for the same pose. The lab's bottom strip shows the exact
gameplay size at the play zoom beside the canonical drawing at the same
screen height, so a sprite that only looks good enlarged cannot hide.

## 8. Animation fidelity

Animation frames are the kit's own: a pose maps to the kit's `BlobbiState`
(`stateForPose`) and `renderBlobbiSvg` bakes the motion phase, so walking is
the kit's stride, lift and bounce on the leg rig, breathing is the kit's
idle cycle, blinks are its half lid and closed lid, and expressions are its
key poses. Tests hold bounds stable through the walk (height within 3 px,
width within 4 px, paint within 20%), through breathing, and across turns
(front and back share a silhouette; left mirrors right; the face exists only
facing the viewer). The animator still inserts a side frame when reversing
direction, so a 180° turn passes through a profile. In the lab's animate
mode the pixel panel cycles the six baked walk frames; the canonical SVG
panel is drawn still (the kit's CSS-driven live walk did not animate inside
the lab's inline SVG), so frame-by-frame comparison is done on the
`compare-24px-views-walk.png` sheet, where resvg bakes the same phases.

## 9. Performance

Headless (`npm run perf`): render 0.33–0.42 ms per frame at 427×274 to
640×448 viewports, simulation microseconds, worst frame 3.7–4.6 ms (a
canonical sprite cache miss). In Chrome's Play mode the statistics panel
showed sim 0.04 ms, render 1.6–1.9 ms and upload 0.1 ms per frame. The FPS
figure itself could not be read reliably: the tab driven by the extension
is a background tab for Chrome, which throttles animation callbacks (frames
of 36 to 233 ms with stalls of seconds during screenshots). With about 2 ms
of work per frame the 16.7 ms budget has an order of magnitude of headroom;
a person running the page in a focused window will see the real number in
the panel.

## 10. Tests and build

70 tests pass (`npm test`), 11 of them new in `tests/fidelity.test.ts`:
determinism, standing height at every size, stable bounds through walking
and breathing, direction handling, anatomy present at 16 px (eye whites,
ink, blush, antenna tip, markings, feet), expressions touching only the
face with a blink that keeps the silhouette, gallery-equals-game, exact pose
to kit-state mapping, the native sprite kept apart, the rasterizer on a
minimal SVG and its refusal of unknown transforms, and pinned sprite hashes
for four seeds × four poses × two sizes. World snapshot hashes were re-pinned
for the scaled world. The production build passes.

## 11. Remaining limitations

- The outline and the banding are stylistic additions to the canonical art;
  whether to keep them is an art decision the lab leaves switchable.
- Walk frames are quantized to six; the kit's continuous CSS walk is smoother.
- The native sprite is dead weight now and could be removed once the
  comparison is no longer needed.
- Gameplay movement was verified headlessly and by inspection of frames;
  held-key walking in Chrome was not driven by the extension (its key events
  are taps).
