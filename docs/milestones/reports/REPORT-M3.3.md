# M3.3: Camera and visual LOD

Scope: `blobbi-pixel-game`, 2026-10-10. M3.2 passed the user's gameplay test
apart from one bug: E on a small rock did nothing. That is fixed (see
`REPORT-M3.2.md` section 9), and M3.2 is committed locally as `8e589d0`.
M3.3 passed the initial manual review (proportions and feel approved). Three
follow-ups were asked for before committing: a 12 px overview Blobbi,
walking jitter at small sizes, and proof that the close-up Blobbi is a
native 64 px raster. They are in section 9. The player then approved the
camera, the walk and the performance, and asked for one last change: the
same Blobbi-to-world proportion in every mode (12 / 24 / 48 px). That is
section 10, and M3.3 is committed locally with it. Nothing was pushed or
deployed. No farming, no turtle growth, no
other repository touched.

Images (`examples/camera/`, all from `npx tsx scripts/camera-modes.ts`; same
world `turtle-0`, Blobbi `blobbi-9`, finished shelter, pickaxe in hand,
viewport 960×540 for every shot):

- `turtle-0-overview.png`, `turtle-0-exploration.png`, `turtle-0-closeup.png`:
  one image per mode.
- `turtle-0-camera-modes.png`: the three stacked and labelled.
- `turtle-0-blobbi-crops.png`: the same 160×160 screen region around the
  Blobbi in each mode, 1:1. This is the image for judging the native
  12/24/48 px rasters.
- `turtle-0-transition.png`: exploration → close-up every 0.1 s.
- `walk/` (from `npx tsx scripts/walk-compare.ts`): the section 9
  comparisons, including animated GIFs of the walk cycle before and after.

## 1. The modes

| Mode | Scale | Blobbi on screen | Camera |
|---|---|---|---|
| Overview | 1× (0.75× when the screen is smaller than the turtle) | 12 px, native | centred on the turtle; the whole animal and its foam in view |
| Exploration (default) | 2× | 24 px, native | follows the Blobbi |
| Close-up | 4× | 48 px, native | follows the Blobbi |

The Blobbi is drawn at three quarters of its 16 px world size in every
mode (presentation only; section 10), so it keeps one proportion to the
world.

The overview frames the turtle, not the whole canvas. The Variant B canvas
is 704×576, but the animal with its foam is about 480×530, so at 960×540
the overview stays at 1× with the whole turtle visible. If the screen is
smaller (the browser panel here was 620×413), it steps down to 0.75×. The
sampling is still nearest-neighbour, and the Blobbi stays a native 12 px
raster (its true size at 0.75×). It never goes below 0.75×.

## 2. Controls

- **Z** cycles Overview → Exploration → Close-up. The mouse wheel steps
  closer (up) or farther (down). A **Camera** selector in the Play panel
  replaces the old Zoom selector.
- **Indicator**: bottom-left of the frame, three pips with the active one
  lit, plus `Z CAMERA  EXPLORATION 2X`.
- **Transition**: 0.4 s, eased in log-scale (so 1→2 and 2→4 feel like the
  same step). The focus catches up faster during the zoom so it lands on
  its subject. Every in-between frame is nearest-neighbour. At rest the
  scale is a whole number and the origin a whole world pixel, so the
  resting frame is pixel-exact.
- The mode is remembered in browser storage (`blobbi-pixel:camera-mode`),
  a viewer preference. It is **not** in the save.

## 3. How it renders

`src/render/view-camera.ts` (modes, easing, framing) and
`src/render/view-renderer.ts` (composition), on top of the existing
`LiveRenderer`, which gained one optional parameter.

1. **World behind the Blobbi.** `LiveRenderer.render` runs in world pixels,
   as always, over the visible rectangle only. In "split" mode it leaves the
   Blobbi and its tool out and sends whatever sorts after the Blobbi in
   painter's order to an overlay buffer. That covers objects in front,
   pickups, the reach marker, the build ghost, front particles and the
   debug overlays.
2. **Magnify.** Each screen pixel samples the world pixel under its centre:
   whole blocks at rest, repeated rows copied. At 1× it is a plain row
   copy. There is no smoothing anywhere.
3. **Blobbi at native resolution.** `buildBlobbiSprite(identity, pose,
   16 × scale)` is the same canonical V3 raster of the kit's drawing, with
   the same pose → state mapping, genome, expression, walk phase, blink,
   breath and whole-pixel gaze rule (`gazeShiftFor` steps 2 px from 40 px).
   It is never a magnified sprite. Its ground anchor sits in the world
   ground pixel's block (centre column, bottom row), so it stands exactly
   where the gameplay Blobbi stands. The hop scales with the view.
4. **Equipment.** An `EquipmentRig` at the native size finds the hand on
   the native raster (the same "draw the arm alone" method). The tool
   template is integer-scaled to match, and the left-hand, behind/in-front,
   visibility and swing rules are unchanged. One detail had to be carried
   over explicitly: the classic renderer has always drawn a tool in front
   one world pixel right of the hand (its painter's-order +0.5 rounds up).
   The view keeps that offset as one world pixel at every scale, so the
   approved M2.3 look is the same in all modes.
5. **Front overlay**, magnified the same way, then **text and HUD at a
   fixed UI scale (2×)**: speech bubbles, build labels, the resource
   counter with the tool icon, and the camera indicator. Bubbles stay
   readable and do not grow to 4× in close-up.

The 1× overview is pixel-identical to the classic single-frame render
(tested, bubble and HUD aside). Margins beyond the world's edge on wide
screens are filled with the sea's dominant border colour instead of black.

## 4. What the camera does not touch

The camera reads the Blobbi's position and nothing else. The simulation
never sees it. Terrain, trees, rocks, resources, buildings, footprints,
collision, the nav grid, reach, facing and placement are computed exactly
as before, and their world sizes are unchanged: a shelter is 4× its world
size on screen in close-up because every world pixel is, and the Blobbi
beside it is 48 px because it is drawn at 12 × 4. Relative proportions hold
in all modes (section 10). The save schema stays 4 with the same keys.

## 5. LOD rules

Kept deliberately small:

- The world is rendered only over the visible rectangle. A 4× view of a
  960×540 screen renders 32,776 world pixels, against 519,901 at 1×.
- Each native size (12, 24, 48 px) has its own cache, bounded at 512
  poses, least recently used first, plus a hand rig at that size. The
  gameplay 16 px sprite keeps the live world's own cache.
- World art has a single level of detail. Magnifying it is the camera's
  job, and redrawing terrain at a "higher resolution" would change its
  shapes, which the brief forbids. Only the Blobbi, the character the
  modes exist to show, gets a resolution per mode.
- Text and HUD are cached per content and scale.

## 6. Performance

`npx tsx scripts/camera-perf.ts`: the same 600-frame walking session
(moving, turning, pickaxe swings), Node on this Mac, after a 180-frame cold
start. Times are in ms per frame for the view only (the simulation is not
included).

| Screen | Mode | Scale | Blobbi | World px | Mean | Worst | World | Magnify | Blobbi | UI | Cold mean / worst |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 960×540 | overview | 1× | 12 px | 519,901 | 2.32 | 11.94 | 0.83 | 1.03 | 0.43 | 0.03 | 3.63 / 22.0 |
| 960×540 | exploration | 2× | 24 px | 130,351 | 1.65 | 12.51 | 0.49 | 0.74 | 0.40 | 0.03 | 2.77 / 18.5 |
| 960×540 | close-up | 4× | 48 px | 32,776 | 1.34 | 9.95 | 0.33 | 0.47 | 0.51 | 0.02 | 2.37 / 10.6 |
| 1280×720 | overview | 1× | 12 px | 923,601 | 2.30 | 9.27 | 0.69 | 1.26 | 0.33 | 0.02 | 3.13 / 9.1 |
| 1280×720 | exploration | 2× | 24 px | 231,401 | 1.94 | 9.24 | 0.50 | 1.04 | 0.37 | 0.03 | 2.78 / 10.0 |
| 1280×720 | close-up | 4× | 48 px | 58,101 | 1.69 | 10.10 | 0.37 | 0.79 | 0.51 | 0.02 | 2.81 / 10.3 |
| 1920×1080 | overview | 1× | 12 px | 2,076,601 | 4.46 | 12.76 | 1.00 | 3.04 | 0.39 | 0.03 | 6.02 / 14.8 |
| 1920×1080 | exploration | 2× | 24 px | 519,901 | 3.38 | 12.14 | 0.75 | 2.17 | 0.44 | 0.03 | 4.39 / 12.5 |
| 1920×1080 | close-up | 4× | 48 px | 130,351 | 2.69 | 13.69 | 0.52 | 1.55 | 0.60 | 0.03 | 3.85 / 12.2 |

(Re-measured after section 10. The first full run of that session had
two outlier frames of 115 and 143 ms in the 1920×1080 exploration and
close-up rows, with means of 9.3 and 7.5 ms; two immediate re-runs gave the
1920×1080 rows above, worst 12–15 ms. I attribute the outliers to the
machine being busy at that moment but have not proven it.)

What the numbers show:

- **Every mode is far inside a 16.7 ms frame on average.** Means run from
  1.3 to 4.5 ms and warm worst frames stay under 14 ms in the table (see
  the note above about one noisy run).
- Closer modes are cheaper: fewer world pixels. The overview's cost is the
  magnify-and-overlay pass over the whole screen, which grows with screen
  area.
- The native Blobbi costs about 0.4 ms at 12 and 24 px and 0.5–0.6 ms at
  48 px when warm. A first-time pose costs one raster of about 2–3.5 ms (whole-pixel
  rig motion adds up to 0.4 ms to a walking pose) (plus two for the
  hand rig when a tool is held). That is where the cold-start worst frames
  of 11–18 ms come from. About 39 poses cover this session.
- **Browser upload.** The frame is now screen-sized, so the browser uploads
  more pixels per frame than the old world-sized frame (which the GPU
  scaled up). The page's statistics show upload time and per-mode render
  time live. I could not read them in the automation tab, which Chrome
  throttles in the background, so check those numbers during your session.

## 7. Tests

181 pass (`npm test`; 157 after the M3.2 fix, 168 at the first M3.3
review, 178 after section 9), typecheck and build pass.
`tests/camera.test.ts` (14) and `tests/walk-stability.test.ts` (10,
sections 9.4 and 10):

- **Mode switching:** cycle order and default, monotonic eased scale,
  exact rest scale on whole world pixels.
- **Tracking:** exploration and close-up keep the Blobbi centred while it
  walks; the overview contains the turtle's whole bounding box, ignores the
  Blobbi, and steps down to 0.75× on a 620×413 screen.
- **Rendering determinism:** identical frames for the same world per mode,
  three distinct frames across modes.
- **Classic equivalence:** the 1× overview equals the classic render pixel
  for pixel everywhere except the Blobbi's box (12 px instead of 16).
- **Overview 12 px is presentation only:** world size, footprint, facing,
  nearest resource, placement and collision unchanged.
- **Blobbi per mode:** native 12/24/48 px rasters equal to
  `buildBlobbiSprite` at that size, not block-magnified, colour detail
  non-decreasing with size.
- **One proportion and one anchor (section 10):** drawn size ÷ world scale
  is 12 world px in every mode; the anchor is the bottom-centre screen pixel
  of the Blobbi's ground world pixel in every mode; a speech bubble's tail
  sits 1–3.5 world px above the drawn crown in every mode.
- **Expressions and walk frames** in close-up.
- **Equipment attachment:** the tool is visible near the hand in all three
  modes, scaled with the mode; native hand points agree with the gameplay
  rig × scale × ¾.
- **World coordinate stability:** in exploration and close-up, every
  screen pixel away from the Blobbi is the classic world pixel under it
  (over 90% of the screen compared), so nothing in the world was resized.
- **Interaction distances, building placement, persistence:** one scripted
  session (walking, collecting, mining, building) run with and without a
  camera cycling modes every 45 frames ends in an identical state: position,
  inventory, rocks, trees, buildings, facing, nearest resource, placement
  spot and check, collision and nav. It also produces a byte-identical
  schema-4 save with no camera key. A save made in one mode loads to the
  same world in every mode.
- **Small rock** feedback in close-up at a 120 Hz frame cadence.

## 8. What to review

- Do the three scales feel right in play (1×/2×/4×), and is Exploration the
  right default?
- The Blobbi at 12, 24 and 48 px in `turtle-0-blobbi-crops.png`: face
  readability, outline weight.
- The walk at 12, 14 and 16 px in play, and in
  `walk/walk-front-before-after.gif` and `walk/walk-side-before-after.gif`.
- The tool at 4× is the hand-made template scaled 4×, chunky like the
  world around it, while the Blobbi is drawn at native detail. Keep it, or
  draw tool templates per size later?
- The 0.75× overview on small windows (crisp but lossy). The alternative is
  to keep 1× and let the turtle be cropped.
- The UI scale (2×) of bubbles and HUD.

## 9. Follow-up after the first review

### 9.1 Overview Blobbi at 12 px

**Done, presentation only.** `CAMERA_MODES.overview.blobbiScale = 0.75`
and `blobbiScreenSize()` (`src/render/view-camera.ts:47`) choose the native
raster size: world size × rest scale × `blobbiScale`. It never goes under
12 px and never over the Blobbi's true size at that scale, so the 0.75×
small-window overview also gets 12 px. The Blobbi's world size (16), foot
ellipse, collision, reach, navigation, buildings, coordinates and the
camera's 1× world scale are untouched (tested). The gameplay 16 px sprite
still exists and is what the classic renderer and the Fidelity tab use.

**The conflict, stated plainly.** The shelter's doorway is 7×10 px. The
Blobbi is 16 px wide and 19 tall at 16 px (outline and tuft included), and
12×15 at 12 px. A 12 px overview Blobbi is 1.5× the door's height instead
of 1.9×, which is the improvement the player saw
(`walk/overview-door-before-after.png`). But the world still treats the
Blobbi as 16 px, and Exploration and Close-up still draw it at that size
(32 and 64 px). Switching from Overview to Exploration therefore makes the
Blobbi grow by a third relative to the shelter: proportions are now
mode-dependent, by design. Smaller effects:
- The foot ellipse (collision) is the 16 px one, so in the overview the
  Blobbi stops about a pixel short of obstacles.
- The speech bubble is anchored 4 px higher than the 12 px head.
- The tool template stays 7 px, so the pickaxe looks relatively larger.

I implemented only the requested change, with no further workaround. If
the door proportion should hold in every mode, that is a world-scale
decision for later (a smaller world Blobbi, or a larger door), and both
are outside this brief.

### 9.2 Walking jitter: two independent causes, both fixed

**Cause A: sub-pixel walk motion rasterized as is (size-dependent,
everywhere).** The kit's walk moves the body by fractions of a pixel at
gameplay sizes:
- a 3–7 unit bounce (0.07–0.17 px at 16 px);
- a 0.95° sway around the feet (0.20 px at the crown at 12 px, 0.27 at
  16 px);
- arm swings and the tuft.

The rasterizer applied those transforms exactly, and every feature
(outline, gradient bands, the feature-aware eyes) then snapped to whole
pixels independently, so a fifth-of-a-pixel sway flipped an eye or an edge
by a whole pixel while its neighbours stayed. The anchor, buffer size and
head top never moved; the problem was churn inside the silhouette.

`scripts/walk-metrics.ts` counts pixels above the legs that change between
consecutive walk frames, over one cycle, for blobbi-9 / abc123 / blobbi-3:

| View | 12 px | 14 px | 16 px | 32 px | 64 px |
|---|---|---|---|---|---|
| front, raw raster | 76 / 64 / 92 | 104 / 109 / 121 | 147 / 110 / 139 | 465 / 509 / 463 | 1623 / 1740 / 1552 |
| front, whole-pixel rig | **0 / 0 / 0** | **0 / 0 / 0** | **0 / 0 / 0** | **0 / 0 / 0** | 1690 / 1897 / 1594 (real sway kept) |
| side, raw raster | 92 / 80 / 68 | 80 / 96 / 84 | 125 / 117 / 87 | 367 / 395 / 409 | 1393 / 1508 / 1319 |
| side, whole-pixel rig | 20 / 24 / 20 (arm) | 28 / 40 / 24 | 20 / 20 / 20 | 62 / 96 / 56 | 1358 / 1456 / 1266 |

A 12 px Blobbi has about 125 opaque pixels, so 76–92 churning pixels per
cycle is most of its face and body: that is the shaking the player saw. The
same churn exists at 16 px, but against more pixels, which is why it read
as "less noticeable" there.

**Fix A** (`src/blobbi/svg-raster.ts:764`, `snapRig`; on for walking poses
in `src/blobbi/canonical.ts:106`). For each kit rig group (`data-rig`) whose
transform moves its part by less than one output pixel everywhere:
- a pure translation (leg lift and stride, bounce) becomes the nearest
  whole-pixel step, at least 1 px once it reaches ¼ px, so the 0.41 px leg
  lift at 12 px still lifts a foot;
- a limb's rotation (arm, tuft) becomes a rigid translation by the rounded
  displacement of its farthest point, so a hand still swings a pixel;
- the body (the root rig that carries the face) moves by its rounded mean
  displacement, so its lean never shifts the whole face sideways.

Transforms that move a part by a pixel or more are drawn as before, so the
64 px close-up keeps the kit's real sway. Not changed: the kit's
transforms, the walk cycle (6 phases, 0.62 s), anchors, standing,
breathing, expressions, blinking and gaze. Pinned hashes changed only for
the 8 walking sprites in the snapshot (re-pinned after inspection).

**Cause B: camera and Blobbi rounded separately (Exploration and Close-up,
any size).** The follow camera eased smoothly and rounded its origin to a
world pixel, and the Blobbi was drawn at its own rounded position. The two
crossed rounding boundaries on different frames, so while walking right
the Blobbi stepped back a whole world pixel (2 or 4 screen px) on 18 of 60
frames. Above 60 Hz there was a second effect: the camera eased on every
display frame, but the Blobbi only moves on frames with a simulation step,
so the camera crept ahead and the Blobbi slipped back on screen.

**Fix B** (`src/render/view-camera.ts`):
- At rest, the follow origin is the rounded Blobbi position minus its
  once-rounded offset from the eased camera.
- A direction rule stops the origin ever moving against the camera's
  motion.
- Following eases in simulation time: `update(..., followDt)` receives
  `steps × 1/60` from the page.

Measured walking in four directions at 60, 120 and 144 Hz, in both follow
modes: from 18 backward steps per second (before) to 0. The world never
scrolls backwards, and after stopping the Blobbi glides to the centre
monotonically.

**Overview at 0.75× (small windows only):** each world pixel is 0.75 screen
px, so the Blobbi advances in an uneven 1-1-1-0 screen-pixel rhythm. This
is inherent to a non-integer scale; it never goes backwards. At 1× it does
not occur.

### 9.3 Is the close-up a true 64 px raster? Yes. The pipeline was already correct and is unchanged

Trace, per frame:
1. `src/playground/main.ts:442`: `viewRenderer.render(view, restScale, …)`.
2. `src/render/view-renderer.ts:193`:
   `size = nativeSize(restScale, view.mode)` → `blobbiScreenSize(16,
   'closeup', 4)` = **64** (`view-camera.ts:47`).
3. `view-renderer.ts:195`: `native(64)` returns a `NativeBlobbi` keyed
   `seed|64` (`:134`), rebuilt if the identity changes (`:136`); only the
   world size (16) uses the live world's cache (`:133`).
4. `view-renderer.ts:61`: `buildBlobbiSprite(identity, pose, 64)`; the
   pose is the animator's pose this frame (`:196`); its cache key is the
   pose key (`:53`) inside the per-size instance, so sizes never share a
   sprite.
5. `src/blobbi/sprite.ts:19` → `canonical.ts:85-93`: the genome goes to the
   kit, `stateForPose(pose)` maps view, facing, expression, lids and walk
   phase, `renderBlobbiSvg(genome, state)` draws the canonical V3 SVG, and
   `rasterizeSvg` runs at `scale = 64 / 175.74 = 0.3642` px per viewBox
   unit (`svg-raster.ts:405` is the base matrix). The SVG is rasterized
   directly at that scale; no smaller bitmap is involved anywhere.
6. `view-renderer.ts:213`: blitted 1:1 (`ratio` = 1 at rest; it differs
   only during the 0.4 s transition).
7. The tool rig at that size (`:206`) finds the hand on the 64 px raster.

Evidence:
- **The raster itself:** the standing 64 px sprite is 82×91 px (anchor
  41,80), 70 rows crown to ground (tuft included), 42 colours. Only 44 of
  its 173 opaque 4×4 cells are one colour; a 16 px sprite enlarged ×4 would
  have all of them uniform.
- **Tests** (`tests/walk-stability.test.ts`): switching overview →
  exploration → close-up → overview → close-up gives 12, 32, 64, 12, 64 px.
  Each is equal to `buildBlobbiSprite` at that size, a revisited mode
  returns the same cached object, and the 64 px sprite is a different
  object from the 32 px one. The 64 px raster differs from the 16 px ×4
  and 32 px ×2 enlargements, and spans 64–76 rows crown to ground.
- **Face and morphology preserved:** `walk/native-sizes.png` shows the same
  genome, expression and walk phase at 12, 14, 16, 32 and 64 px, front,
  side and happy. The face gains detail with size (eye highlights, brows,
  mouth curve, blush, pattern stripes), with the same shapes and colours
  throughout.

### 9.4 Comparisons and regression tests

Images (`examples/camera/walk/`; any enlargement is labelled and for
inspection only):
- `native-sizes.png`: 12/14/16/32/64 px native renders of the same seed,
  genome, expression and walk phase, 1:1, with each scaled to about 64 px
  below for inspection.
- `walk-front-before-after.gif`, `walk-side-before-after.gif`: animated
  walk cycles (the kit's timing, 103 ms per phase), 12/14/16 px, before
  (raw raster) above and after (whole-pixel rig) below, at the same ground
  point, ×6 for inspection. These are the files for judging temporal
  stability.
- `walk-*-filmstrip.png`: the same frames as a still strip.
- `overview-door-before-after.png`: the overview beside the shelter with a
  16 px Blobbi (before) and a 12 px one (after), ×4 and 1:1.
- `overview-walk-12px-x4.gif`: 1.5 s of walking in the overview at 12 px.
- The GIFs come from a small encoder added for this (`src/node/gif.ts`);
  frames decoded with ImageMagick match the source with 0 differing
  pixels.

`tests/walk-stability.test.ts` (9):
- the raw raster reproduces the churn;
- front and back: zero upper-body change at 12/14/16/32 px for three seeds;
- side: under half the raw churn and at most 48 px;
- the feet still step, the anchor and buffer never change, and a foot stays
  on the ground line in every frame;
- standing, expressions and the 64 px sway are unaffected;
- under a follow camera at 60/120/144 Hz in four directions, the Blobbi
  never steps backwards while walking and the world never scrolls
  backwards;
- it settles centred after stopping;
- the two native-64 tests above.

## Limitations

- The Fidelity tab still shows the 16 px sprite magnified ×3 for
  inspection; it is a lab view, not gameplay.
- The world beyond the canvas edge (very wide screens, overview) is a flat
  sea colour; its seam against the textured sea is visible on close look.
- Camera transitions resample the target mode's native Blobbi by the
  in-between ratio for 0.4 s; the resting frame is always exact.
- The 6-band shading recommended by the M3.2 lab for 32 px and up is still
  not applied, so all sizes use the canonical 4 bands.
- The mode-dependent proportions of 9.1 are resolved (section 10). What
  remains is that the Blobbi is drawn smaller than its world size: its
  collision ellipse and reach are the 16 px ones, so it stops about a world
  pixel short of obstacles, and tools are the hand-made 7 px templates
  scaled with the world, so they look relatively larger in its hand.
- At 12–24 px the kit's body sway and bounce are below a pixel and are not
  drawn: the body is still above the legs, and the walk reads through the
  feet and arms. At 48 px the arms and tuft swing by whole pixels and the
  body holds; the body sway is drawn only from 64 px, which no camera mode
  uses now.
- The 0.75× overview steps unevenly by construction (9.2).

## 10. One Blobbi-to-world proportion in every mode (final adjustment)

After approving the camera, the walk and the performance, the player asked
for the Blobbi to keep the same size relative to the shelter, trees and
rocks in every mode: 12 px at 1×, 24 px at 2×, 48 px at 4×. This resolves
the conflict described in 9.1.

**Change.** One constant, `BLOBBI_DRAWN_SCALE = 0.75`
(`src/render/view-camera.ts`), is now the `blobbiScale` of all three modes.
`blobbiScreenSize()` gives 12, 24 and 48 px (and still 12 px for the 0.75×
small-window overview). Each size is its own native raster: the
`NativeBlobbi` cache for that size calls `buildBlobbiSprite(identity, pose,
size)`, which sends the genome and pose to the kit's V3 renderer and
rasterizes the drawing at that size. Nothing is magnified, and the walk fix
(whole-pixel rig motion) applies at each size. The world Blobbi is still
16 px: collision, reach, navigation, buildings, resources, coordinates and
saves are untouched (the presentation-only tests still pass unchanged).

**Speech bubbles.** A bubble over the Blobbi was placed 2 px above the 16
px world head, so with a 12 px drawing it floated 4 world px too high (the
"smaller effect" noted in 9.1). The Blobbi's bubbles now carry `head` (its
world height when it spoke; `Bubble.head` in `src/sim/live-world.ts`,
passed through `FrameText.head`), and the view moves the tail down by
`head − drawn height` world pixels, so it rests 2 px above the drawn head in
every mode. Bubbles over trees, rocks and buildings are unchanged. This
field is presentation data; it is not saved and the simulation never reads
it.

**Alignment checked** (`examples/camera/walk/modes-12-24-48.png`: the same
72×44 world rectangle around the Blobbi and the shelter door, cropped from
each mode at that mode's scale, 1:1):
- *Shelter doorway:* the door is 7×10 world px; the Blobbi is 12×15 world
  px in all three modes (1.5× the door's height everywhere).
- *Trees, rocks, ground:* world art is magnified by whole pixels, so their
  ratio to the Blobbi is now constant. The anchor is the bottom-centre
  screen pixel of the Blobbi's ground world pixel in every mode (tested),
  so its feet sit on the same ground pixel.
- *Equipment:* the pickaxe stays in the anatomical left hand
  (`right-arm` rig) at every size; the native hand agrees with the 16 px
  gameplay rig × scale × ¾ to within two template pixels (tested).
- *Speech bubbles:* the tail is 1–3.5 world px above the drawn crown in
  every mode (tested; 6 world px without the fix).

**Walking jitter at the new sizes.** Upper-body change over one walk cycle,
three seeds (`blobbi-9`, `abc123`, `blobbi-3`), raw raster → now:

| View | 24 px | 48 px |
|---|---|---|
| Front | 258–299 → 0 | 960–1011 → 164–308 |
| Side | 220–254 → 46–48 (arm) | 763–848 → 64–160 |
| Back | 164–202 → 0 | 544–742 → 94–230 |

At 48 px the arms and tuft move a whole pixel or more, so they are drawn as
the kit moves them; the body, face and outline hold still (checked visually
on a strip with every changed pixel marked). That is the walk, not shimmer.
Camera tracking is unchanged: the follow tests (no backward screen step at
60/120/144 Hz in four directions, centred after stopping) run in both
following modes at the new sizes and pass.

**Tests updated or added:**
- `blobbiScreenSize` and per-mode native sizes now expect 12/24/48;
- native 24 and 48 px are not the 12 px raster ×2 / ×4, and span about
  their size from crown to ground;
- a still upper body at 24 px in the front and back views; feet still step
  at 24 and 48 px;
- 48 px: only the arms and tuft move (churn under 40% of the raw raster);
- one proportion and one anchor in every mode; bubble on the drawn head in
  every mode (fails without the fix: 6 world px gap in the overview).

**Images regenerated:** `turtle-0-{overview,exploration,closeup,camera-modes,
blobbi-crops,transition}.png`, `walk/native-sizes.png` (now 12, 14, 16, 24,
32, 48, 64 px), and the new `walk/modes-12-24-48.png`.
