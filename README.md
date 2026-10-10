# blobbi-pixel-lab

An experimental laboratory for **fully procedural top-down pixel art**, and now
for a **living version of it**: islands, water, shorelines, cliffs, bridges,
piers, paths, trees, bushes, flowers, rocks, houses, fences and decorations are
generated from a seed and drawn pixel by pixel; a procedural pixel **Blobbi**
walks through the result, the water and the wind move, leaves fall, and
planted trees grow. No sprite packs, no downloaded or AI-generated raster
assets, no external artwork, no spritesheets.

It is a research prototype for the Blobbi ecosystem (Blobbi Island, Nostr
Farm). It is **not a game** and **not a package**. Findings are in
[REPORT.md](./REPORT.md) (phase 1: the static generator),
[REPORT-2.md](./REPORT-2.md) (phase 2: the living world) and
[REPORT-3.md](./REPORT-3.md) (phase 3: Blobbi fidelity, world scale, the
comparison lab), [REPORT-4.md](./REPORT-4.md) (phase 4: faces, mouths and
horns) and [REPORT-M1.md](./REPORT-M1.md) (M1: the living turtle) and [REPORT-SHELL.md](./REPORT-SHELL.md) (shell variants and the World Carrier). The
milestones are in [ROADMAP.md](./ROADMAP.md).

**M1: the turtle is the island.** `src/turtle/turtle.ts` generates a
turtle from its seed (shell, rim, head, neck, flippers, tail) and
`src/world/turtle-world.ts` grows the land on its shell with a plateau, a
pond, meadows and paths; `src/sim/brain.ts` lets the Blobbi live there on
its own (wander, idle, inspect, rest) over an A* nav grid, with WASD taking
over and autonomy resuming after five seconds.

**The pixel Blobbi is the canonical Adult V3.** `blobbi/canonical.ts` asks
the kit's own `renderBlobbiSvg` for the exact state (view, expression, lids,
gaze, walk phase) and `blobbi/svg-raster.ts` paints that SVG with pixel-art
rules (thresholded coverage, banded gradients, one-pixel strokes, an outside
outline), with feature-aware reconstruction of eyes and mouths from the
canonical ellipses and curve endpoints. There is no second morphology. The
Fidelity tab shows the kit's drawing beside the pixels at inspection and
gameplay sizes, and a 24-seed face gallery with enlarged face crops.

```
npm install
npm run dev        # http://127.0.0.1:5177  (the playground)
npm test           # 93 tests: determinism, geometry, placement, collision, animation, growth, fidelity, visual regression
npm run seeds      # many world seeds to PNG + a contact sheet
npm run perf       # headless frame-cost measurement of the living world
npx tsx scripts/render-turtles.ts 9 1 out/turtles      # turtle worlds for several seeds + contact sheet
npx tsx scripts/autonomy-run.ts turtle-0 blobbi-9 90    # headless autonomy session with frames
npx tsx scripts/compare.ts out/compare.png 24 6   # canonical V3 | pixel raster | native, side by side
npx tsx scripts/references.ts examples/fidelity    # ground-truth renders of the canonical Adult V3
npx tsx scripts/face-sheet.ts out/faces.png "blobbi-0,blobbi-1" neutral 24 16   # face and crown crops beside the canonical
npm run check      # typecheck + tests + build
```

Node 22+. Runtime code has one dependency, `@blobbi-kit/renderer` (its
`procedural` subpath: the V3 genome and colour generator, used for Blobbi
identity). Everything else is dev-only: Vite, Vitest, TypeScript, `pngjs`, `tsx`.

## The playground

| Mode | What it does |
| --- | --- |
| **World** | The static generator: seed, randomize, regenerate, islands, palette, density, size; zoom, pan, layer toggles (terrain, vegetation, structures, details, shadows); PNG export; statistics and an audit. |
| **Play** | The living world, on a turtle by default (world kind, turtle seed). The Blobbi is autonomous; WASD or arrows take over and autonomy resumes after five seconds; the statistics show its mind, note and destination, and an overlay draws the nav grid and path. WASD or arrows move the Blobbi, E or Space interacts with what it faces (trees shake and drop leaves, bushes sparkle, houses send hearts, signs speak, lanterns glitter), P plants a tree that grows. Pause/resume, speed 0.25× to 4×, camera zoom, Blobbi seed and size (12 to 32 px, default 16), toggles for water, wind, shadows and a collision debug overlay. Statistics show FPS, frame time (sim, render, upload), clock, caches and what the Blobbi faces. |
| **Blobbi** | Appearance gallery (24 seeds of a prefix), a four-direction animated preview (idle breathing, blinking, glances; walking on request; click to make it react), and an expression strip. |
| **Growth** | One tree seed at eight ages, plus an animated stage with a growth slider, Grow and Reset. |
| **Gallery** | Many world seeds side by side, each audited (unbridged island, object off land, clipped object). |
| **Fidelity** | For each seed: the canonical Adult V3 (the kit's SVG, drawn by the browser) beside the pixel raster at a chosen size and zoom, with expression and view selectors, an outline toggle, the native sprite for comparison, a walk animation, and a bottom strip at the actual gameplay size and play zoom. |

The seed, the mode and the Blobbi seed live in the URL hash.

## Architecture

Generation stays independent from rendering; the live layer sits beside both.

```
seed ─► world/layout ─► world/terrain ─► world/bridges ─► world/paths ─► world/placement ─► WorldDescription
                                                                                               │
          objects/* (tree, bush, flower, grass, rock, house, bridge/pier, fence, decor)         │
          blobbi/identity (kit genome → pixel identity) ─► blobbi/sprite (pose → Sprite)       │
                                                                                               ▼
                            render/compose (static picture)        sim/live-world + render/live-render (frames)
```

| Module | Responsibility |
| --- | --- |
| `core/rng.ts` | cyrb128 + sfc32, pure 32-bit integer math, **keyed streams**: `stream(seed, 'place', 'island', 2, 'trees')` is its own generator. Same design as blobbi-kit's V3 engine. |
| `core/noise.ts`, `core/color.ts`, `core/palette.ts` | Seeded value noise; packed RGBA colours; OKLCH ramp derivation (five shades, hue-shifted shadows); the shared `WorldPalette`. |
| `core/pixel.ts`, `core/shade.ts` | `PixelBuffer`, `Mask`, `Sprite` (with an optional `swayRow`); integer ellipses, lines, mask edges; one top-left light, banded blob shading, blob clouds, columns, inside outlines. |
| `world/layout.ts` | Islands as a bridged chain with axis-aligned gaps. Silhouette = radial harmonics (k 2..9, budgeted) × bays and capes (soft angular bumps, culled where a bridge lands); a plateau on large islands, set toward the back. Every size is stated at world scale 1 and multiplied by `WorldOptions.scale` (default 1.6, world 704×448). |
| `world/terrain.ts` | Per-pixel signed distance → classes (deep, water, shallow, foam, wet sand, sand, grass edge, grass, patch, path, cliff face, forest floor) and an elevation layer. Cliff faces are the rows under a plateau's south edge. |
| `world/bridges.ts`, `world/paths.ts`, `world/placement.ts`, `world/generate.ts` | Bridge ends read off the rasterized shore; hub paths; houses → fences, gardens, decor (sign, lantern, well) → groves and loners → bushes, rocks → flower clusters, tufts, all level-aware; piers; forest floor under groves and clearings at hubs. |
| `objects/tree.ts` | 4 trunks × 5 canopies × texture × fruit/blossom from the seed; `growth` 0..1 draws the same individual as seedling, sapling or scaled adult. |
| `blobbi/identity.ts` | Reads `generateGenome(seed)` from `@blobbi-kit/renderer/procedural`: colours, morphology genes, antenna/horn/ear/tail kinds, pattern, mark, belly, freckles. |
| `blobbi/sprite.ts` | Pixel geometry of a Blobbi: egg silhouette by rows, banded shading, feet, arms, belly, patterns, mark, eyes with lids and gaze, mouth per expression, cheeks, tuft, antennae, horns, ears, tail. Front, back and both sides from one identity. |
| `blobbi/animation.ts` | Pose state machine: walk phases, breathing, seeded blink and glance schedules, turning through a side frame, reactions with a hop. |
| `sim/clock.ts`, `sim/collision.ts`, `sim/particles.ts`, `sim/live-world.ts` | Fixed-step clock with speed and pause; walkability mask (water, footprints, cliff rims, bridges and piers) with sliding movement; seeded particles (leaves, petals, sparkles, hearts, notes, smoke, dust); the live world: input, wind, ambient events, interactions, planting and growth. |
| `render/paint-terrain.ts`, `render/compose.ts`, `render/live-render.ts` | Terrain painter; the static compositor; the live renderer: cached static layer, per-frame foam and wave strokes from precomputed lists, objects with wind sway, the Blobbi in painter's order, particles, speech bubble, debug overlay, camera. |
| `render/audit.ts` | Structural validity checks. |
| `playground/` | Vanilla TypeScript and Canvas 2D. |
| `scripts/` | `render-seeds`, `sheet` (one object kind), `blobbi-sheet`, `growth-sheet`, `live-frames` (scripted headless run to PNG), `perf`. |

### Why Canvas 2D and a software raster

All drawing is integer rasterization into typed arrays, which runs identically
in Node (tests, sheets, headless frames) and in the browser. The page only
blits a frame with `imageSmoothingEnabled = false` at an integer zoom. The live
renderer copies a cached static layer by rows, repaints a few thousand
animated water pixels, and blits the sprites in view; nothing is regenerated
per frame. If a game later wants PixiJS or Phaser, a `PixelBuffer` is a texture.

## Tests

`npm test` covers the phase 1 suites (RNG, objects, worlds, visual regression)
and `tests/live.test.ts`: pixel Blobbi determinism, identity from the kit
genome, one identity across four directions, geometry at every pose and size,
expressions touching only the face; animator phases, breathing, seeded blinks,
turning and reactions; clock stepping; collision rules, sliding movement,
bridge crossing; deterministic replay of the live world (state, particles and
pixels), walking, interaction, planting and growth; camera clamping and
viewport rendering; growth reproducibility and morphology stability.

Visual regression hashes are pinned in `tests/__snapshots__/render-hashes.json`;
re-pin on purpose with `UPDATE_SNAPSHOTS=1 npm test` after inspecting
`out/regression/`.

## Examples

`examples/`: eight worlds at 2×, an autumn world, a 640×448 world, a 16-seed
contact sheet, object sheets, Blobbi sheets at 18 and 24 px (four views,
expressions, blink, breath, walk frames), a close-up, a growth sheet, a
plateau close-up and two frames of the living world.
