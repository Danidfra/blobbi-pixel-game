# Living procedural pixel art: technical report (phase 2)

Scope: the second experiment in `blobbi-pixel-lab`, 2026-10-09. Phase 1
produced a static procedural island generator (see `REPORT.md`). Phase 2
asked whether the same approach supports a living, interactive world: a
procedural pixel Blobbi, procedural animation, movement and collision,
procedural growth, and a better-looking environment, at 60 FPS.

Visual claims below were checked on rendered PNGs (`examples/`, `out/`), at
pixel level where it mattered. The Chrome extension was not connected during
this phase, so the playground's play mode was **not** exercised in a browser
by me; it was exercised headlessly (`scripts/live-frames.ts` drives the same
simulation and renderer the page uses) and its UI is typechecked and built.
The in-page FPS and frame-time panel is the place to confirm the browser
numbers; see Performance.

## 1. What was implemented

- **Pixel Blobbi** (`blobbi/identity.ts`, `blobbi/sprite.ts`). Identity is
  read from the kit's V3 genome (`@blobbi-kit/renderer/procedural`:
  `generateGenome`), so the same seed is the same Blobbi in the kit's SVG and
  here: base, secondary, eye and accent colours; body, face and limb genes;
  antenna count and side; horn, ear and tail kinds; pattern (solid, spotted,
  striped, gradient); special mark; belly; freckles. Nothing of the kit's
  geometry is copied. The sprite is built from pixel geometry: an egg
  silhouette rasterized row by row (crown width, widest row and roundness from
  genes), banded sphere shading from the lab's shared rules, feet, paddle
  arms, belly patch, pattern bands or spots that wrap correctly per view, a
  3×3 mark glyph, eyes with a white ring, iris, highlight, gaze and three lid
  states, mouths per expression, cheeks, freckles, a leaf tuft, stalk antennae
  with ball tips, horns, ears and a tail. Four views (front, back, left,
  right) come from one identity by changing what is visible and where it
  sits, not from separate sprites.
- **Procedural animation** (`blobbi/animation.ts`, `sim/live-world.ts`,
  `render/live-render.ts`). Idle breathing (a one-pixel inhale), seeded blinks
  with half-lid frames, idle glances, a four-phase walk (feet, body bob),
  turning through a side frame when reversing, reactions (expression plus
  hop). Environment: foam dashes and wave strokes drift each frame, trees,
  bushes and flowers sway with a travelling wind, leaves and petals fall,
  shallows sparkle, chimneys smoke, interactions burst particles.
- **Interactive world** (`sim/`). WASD/arrows, camera follow with clamping,
  per-pixel collision (water, object footprints, cliff rims; bridges and
  piers walkable), sliding movement, painter's-order depth with the Blobbi
  inserted among objects, interaction with trees, bushes, houses, flowers,
  rocks, signs and lanterns, a speech bubble with a 3×5 font, tree planting.
- **Procedural growth** (`objects/tree.ts`). `growth` 0..1: seedling,
  sapling, then the adult drawn at a smaller size; the trunk kind, canopy kind,
  blob layout and foliage ramp are the seed's at every age; fruit arrives at
  85%. Planted trees grow on the simulation clock and become solid at 30%.
- **Visual improvements** (`world/`, `render/paint-terrain.ts`). Coastlines
  with bays and capes and higher harmonics; plateaus with lit lips and
  south-facing cliff faces; soft lighter streaks in open water; forest floor
  under groves, clearings at hubs, two-pixel grass blades; piers; fenced
  gardens; a well.
- **Playground**: Play, Blobbi, Growth modes added beside World and Gallery,
  with pause, speed, Blobbi seed and gallery, direction preview, growth
  controls, collision debug and performance statistics.
- **Tests**: 59 in total, 18 new (`tests/live.test.ts`).

## 2. Which animations are truly procedural

All of them: there is no spritesheet anywhere.

| Animation | How |
| --- | --- |
| Walk | A pose parameter (phase 0..3) changes foot positions and a body bob inside the sprite builder; sprites are cached by pose key. |
| Breathing | Pose parameter: body one pixel taller on the inhale, crown features follow. |
| Blink, glance | Lid and gaze pose parameters; the schedule is a keyed stream of the Blobbi's seed. |
| Turning | The animator inserts a side-view frame for 90 ms when the direction reverses. |
| Reactions | Expression pose parameter plus a sine hop applied to the sprite's y. |
| Water | Foam dash phase and wave-stroke drift are functions of the simulation time over precomputed pixel lists. |
| Wind | A travelling gust function of (time, x); each sprite's rows above its `swayRow` are blitted with a −1/0/+1 px offset; shakes from interactions use the same path. |
| Particles | Seeded spawns, simple kinematics, one or two pixels each. |
| Growth | The tree generator rerun with a quantized growth value (24 steps), cached. |

Determinism: the clock advances in fixed 1/60 s steps; all randomness in the
simulation comes from keyed streams; the test `replays deterministically`
proves state, particles and rendered pixels are identical across two runs with
the same inputs. Only the number of steps per frame depends on real time.

## 3. Are native procedural pixel characters visually viable?

Yes, with a qualification. At 24 px the pixel Blobbi is unmistakably a Blobbi:
the egg body, the big eyes with ring and highlight, cheeks, antennae, stripes,
spots and the mark all survive, and seeds are distinguishable at a glance.
Expressions read (happy, excited, sad, surprised, sleepy, blink). Front, back
and side views are coherent and the side is clearly the same individual.

At 18 px (the size that fits the world's trees and houses) it still reads as a
Blobbi and as a character in the scene, but details compress: arms become
two pixels, the mark is a smudge, horns and ears are hints. At 14 px it is a
coloured egg with eyes. The viable range for a world character is 18 to 24 px;
for portraits, 32 to 48 px.

The qualification: a pixel artist would still beat these sprites on the
pixels that carry charm, especially the eye shapes, the mouth and the
silhouette of the crown. The generator gets the proportions and the identity
right automatically; the last 10 percent of appeal is hand work.

## 4. Which visual elements still require artistic intervention

- **Face design at small sizes.** Eye and mouth shapes below 20 px are drawn
  by hand-written rules; those rules are an artist's choices in code form and
  will need an artist's eye to tune.
- **Cliff faces.** The earth wall reads but is plain; hand-pixelled rock
  textures and corner pieces would be better. The rim outline on plateaus is
  correct but stiff.
- **Water.** Streaks and drifting strokes are an improvement; real pixel water
  wants authored wave tiles cycling through three or four frames.
- **Walk cycle.** Two foot positions and a bob are enough for a 18 px
  character; a larger character would need a drawn cycle.
- **Landmarks** (lighthouse, windmill, market) and anything with a designed
  silhouette, as phase 1 said.
- **Ground transitions** between forest floor, clearings and plain grass are
  blobby; an artist would shape them.

## 5. Performance measurements

Headless (`npm run perf`, Node 24, Apple Silicon), averaged over 600 frames
with a walking Blobbi, wind and particles, all caches warm:

| Scenario | Viewport | Sim step | Render | Worst frame | Sprites drawn |
| --- | --- | --- | --- | --- | --- |
| 1280×820 canvas at 3× | 427×274 | 0.004 ms | 0.17 ms | 1.5 ms | 144 |
| 1280×820 canvas at 2× | 640×410 | 0.002 ms | 0.15 ms | 0.6 ms | 144 |
| Full default world | 448×288 | 0.001 ms | 0.14 ms | 0.3 ms | 144 |
| 640×448 world, 4 islands, 2× | 640×448 | 0.004 ms | 0.34 ms | 1.5 ms | 289 |

The worst frames are sprite-cache misses (a new pose or growth stage being
rasterized). The browser adds `putImageData` and a scaled `drawImage`, which
for a 640×410 frame are well under a millisecond on a desktop GPU. A 16.7 ms
budget is therefore met with a margin of more than an order of magnitude;
the page's statistics panel reports measured FPS and the sim/render/upload
split so this can be confirmed on the target machine. I was not able to run
the browser during this phase, so the browser number is not claimed here.

Memory: the world's static layer is one Uint32 buffer (129k entries for the
default world); object sprites and Blobbi poses are cached by key (a few
hundred small buffers).

## 6. What could be reused in Blobbi Island

- `blobbi/identity.ts`: the mapping from the kit genome to a compact pixel
  identity is directly reusable; it already depends only on the published
  package.
- `blobbi/sprite.ts` and `blobbi/animation.ts`: a pixel-art mode for the
  Island (map miniatures, a retro room, a mini-game) could draw walking Blobbis
  from their real identity with no artwork pipeline.
- `sim/collision.ts` and the sliding movement: the Island already routes a
  Blobbi around furniture; the walkability mask approach is simpler than
  polygon zones for tile-like rooms.
- `render/live-render.ts`'s layering (cached static, animated overlay,
  dynamic sprites in painter's order, front particles) is the structure any
  Canvas-based Island scene would want.
- `sim/particles.ts`: hearts, notes, sparkles and smoke are the Island's
  interaction feedback vocabulary already.
- `core/` (rng, pixel buffer, shading, palette) as in phase 1.

For Nostr Farm specifically, `growth` on trees is the pattern crops would use:
one seed, one morphology, a development parameter driven by time.

## 7. Remaining limitations

- No browser verification of the play mode in this phase (see above).
- The Blobbi has no diagonal views and no carrying, sitting or sleeping
  poses; `sleeping` exists in the animator but nothing triggers it.
- Collision is per-pixel but the Blobbi's foot is a fixed ellipse; tall
  objects can be walked "behind" visually only because of painter's order.
- Interactions are one-shot effects; there is no state (a tree keeps
  dropping leaves forever).
- Growth is limited to trees; bushes and flowers do not grow.
- Water animation is a drift, not a wave cycle; wind sway is a 1 px shift,
  which looks right at 3× zoom and slightly mechanical at 2×.
- The plateau is one level; no stairs, no second tier, no caves.
- The world is still a single screen-sized map; nothing streams.
