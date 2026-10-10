# Procedural pixel art: technical report

Scope: `blobbi-pixel-lab`, built on 2026-10-09 as a research prototype. The
question was whether fully procedural generation can produce top-down pixel art
environments that look intentionally designed and consistent, and whether that
could replace a meaningful share of hand-drawn artwork for Blobbi Island and
Nostr Farm.

Every claim below about visuals was checked by looking at rendered PNGs
(`examples/`, `out/seeds/sheet.png`) and at the playground in Chrome at 1× and
2×. No reference image was attached to the brief, so the visual direction was
taken from its written description and from the mood of the current Island map.

## What was built

- A deterministic pipeline: seed → island layout → terrain raster → bridges →
  paths → placement → object sprites → composited pixel buffer.
- Keyed random streams throughout (the kit's V3 design), so adding a feature
  does not move existing ones; `Math.random()` is never called in generation.
- Nine object generators sharing one palette and one set of shading rules.
- A playground with seed, randomize, regenerate, zoom, pan, layer toggles,
  statistics, PNG export and a gallery with a structural audit.
- 41 automated tests plus hash-pinned visual regression; scripts that render
  any number of seeds to PNG and contact sheets.

Default world: 448×288 logical pixels, generated and rendered in roughly
100 ms in Node; the browser gallery renders 12 worlds in about 2.3 s.

## What worked well

- **Art-directed shapes beat noise.** Islands are low-order radial harmonics
  (k = 2..5, budgeted amplitude) with a 2–3% noise wobble. Every seed in the
  16-seed sheet reads as a drawn island, not a blob of noise. Thresholded noise
  was never used for a silhouette and should not be.
- **The signed-distance band model for shorelines.** Classes come from distance
  to the boundary: grass outline, darker grass rim, sand (wider on the south
  side), one pixel of wet sand, one pixel of dashed foam, shallow water, water,
  deep water. It produces clean, consistent, hand-drawn-looking transitions with
  no tileset and no autotiling, and band widths are the art direction.
- **Layout as a bridged chain.** Placing each island at an axis-aligned,
  bridgeable gap from an existing one guarantees connectivity, keeps bridges
  horizontal or vertical (diagonal bridges pixel badly), and still gives L and T
  shaped archipelagos. Reading bridge ends off the rasterized shore made every
  one of 40 test seeds valid.
- **Five-shade ramps with hue shifts.** Deriving every ramp from a mid colour in
  OKLCH with cooler shadows and warmer highlights is what makes trees, rocks,
  wood, roofs and water look like one artist. Swapping the palette to `autumn`
  recolours the whole world coherently without touching any generator.
- **Trees as morphology.** Trunk kind × canopy kind × leaf texture × fruit or
  blossom, from the seed, with groves sharing a foliage ramp. The tree sheet
  shows real variety in form (round, tall, cloud, pine, layered) at one style.
  Cloud canopies with lower-half separation lines are the single most
  effective trick for "pixel tree" rather than "lollipop".
- **Rocks and houses.** Faceted banded shading makes convincing boulders at
  5–20 px. Modular houses (wall box, roof shape, door, windows, chimney, planks)
  read as charming cottages across roofs and sizes; nobody drew a sprite.
- **Placement rules.** Low density, groves plus loners, flower clusters, the
  hub plaza kept clear, footprints never overlapping, nothing on paths or shore
  bands. Worlds look composed, not scattered.
- **Painter's order and ground shadows.** Sorting by ground anchor and painting
  solid shadow ellipses in terrain-aware tones sell the ¾ top-down depth.

## What still looks artificial

- **Water is too uniform.** Wave strokes are sparse single-row dashes; large
  water areas read flat. Real pixel water uses two or three alternating wave
  shapes, a lighter band near shores that follows the coast more organically,
  and animation. This is the biggest gap between the output and the reference
  mood.
- **Grass interior is too plain.** The light-patch noise and sparse speckles
  are barely visible. Hand-drawn grass uses deliberate tufts and darker
  patches at island centres and under trees. More structure, not more noise.
- **Canopy shading is a lit disc.** It works, but highlights are small and the
  leaf dabs are subtle. Real sprites have leaf-cluster silhouettes on the
  outline and a stronger dark underside. Pine tiers are stiff.
- **Paths are a little too smooth and uniform in width**, and they stop at the
  hub rather than opening into a plaza with a visible shape.
- **Composition is repetitive.** The chain usually runs left to right; islands
  are similar in size. A 448×288 canvas cannot hold more variety, and the
  layout has no notion of "feature islands" (a lighthouse island, a forest
  island, a farm island).
- **Small decor is weak at 8 px.** The mushroom and barrel need a few more
  pixels than the budget allows; the stump needed a hand-fix.

## What is hard to generate

- **Characterful silhouettes.** Procedural blobs are convincing for foliage,
  rocks and islands; they are not convincing for anything with a designed
  silhouette (a lighthouse, a windmill, a market stall, a Blobbi). Those need a
  modular kit of authored parts or hand pixels.
- **Readable tiny objects.** Below about 10 px, a pixel artist's choices are
  all intention and no rule. The generators here hand-place those pixels;
  that is drawing, not generating.
- **Edge-aware detail.** Hand-drawn pixel art puts the right pixel at the
  corner of a roof or the base of a trunk; integer rasterization of ellipses
  and trapezoids gets the body right and the corners merely acceptable.
- **Large-scale composition** (where the eye goes, what the island is "for")
  is not emergent. It has to be written as rules, and each rule is design work.

## Is fully procedural pixel art viable?

For **environments**, yes, with limits. Terrain, water, shorelines, paths,
bridges, vegetation, rocks and simple buildings can be generated at a quality
consistent with a cozy commercial style, with full determinism and variety per
seed. The constraint is that quality comes from art-directed rules and shading
conventions, not from randomness; the rules were the actual art work of this
project, and they took far more iteration than the plumbing.

For **anything with identity** (characters, landmark buildings, UI, items),
pure generation is not viable at this resolution.

## Would a hybrid be better?

Yes. The recommended shape:

1. **Procedural terrain and composition**: layout, terrain bands, paths,
   bridges, placement. This is where the generator shines and where manual
   work is most tedious.
2. **Procedural "crowd" objects**: trees, bushes, rocks, flowers, fences,
   generic houses. Variety for free, style guaranteed by the shared palette.
3. **Authored landmarks and parts**: a small library of hand-pixelled parts
   (roof corners, doors, signs, a lighthouse, props) assembled by the same
   placement and palette system, recoloured through the ramps so they match.
4. **Authored palette and shading rules**: an artist tunes the ramps and
   thresholds once; everything inherits it.

The lab's `WorldPalette` and `Sprite` contracts already fit this: an authored
part is just a sprite with an anchor and a footprint, and its colours can be
remapped onto the ramps.

## What could be reused in Blobbi Island and Nostr Farm

- `core/rng.ts`: the keyed-stream RNG (already the kit's pattern).
- `core/pixel.ts` and `core/shade.ts`: a DOM-free pixel raster with shading
  rules, usable in Node for tooling and in any renderer as a texture source.
- `core/palette.ts`: OKLCH ramp derivation and the shared palette, which could
  be a Blobbi-wide style token source and could map Blobbi identity colours
  onto pixel ramps.
- `world/terrain.ts` band model: Nostr Farm currently renders a baked
  background with a plant grid over it; the band model could generate farm
  backgrounds, plot borders and paths per player seed.
- `world/placement.ts` rules and `render/compose.ts` painter's order: Island
  already walks a Blobbi through depth-sorted furniture; the same ordering and
  footprint rules apply.
- `objects/tree.ts`, `bush.ts`, `rock.ts`, `house.ts`: as decoration
  generators for new island locations, or as a map-miniature generator.
- `render/audit.ts` and the gallery approach: cheap bulk validation of seeds
  before anything reaches players.

If the hybrid route is taken, the next experiment should be a Blobbi drawn in
this pixel style from its V3 identity (colours and traits from the kit), since
that is the one object the ecosystem cannot do without and the one this report
says pure generation cannot produce.
