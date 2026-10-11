# Blobbi procedural generation audit

Scope: read-only, 2026-10-10, after M3.3 was committed (`66bc9ac`).
Repositories inspected: `blobbi-pixel-game` (this one), `blobbi-kit`,
`blobbi-procedural`, `nostr-pet` (the Standalone). Implementation code was
not modified in any of them. The only files written are this report, the
evidence image `examples/audit/seed-gallery.png`, and throwaway comparison
scripts in the session scratch directory. Nothing is committed.

Labels: **[ran]** = verified by running code; **[read]** = verified by
reading code. Status: **IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT
IMPLEMENTED**.

## Summary

- The game's Blobbi **is** the canonical V3 Blobbi. Seed → genome →
  morphology → geometry → SVG are the kit's own functions
  (`@blobbi-kit/renderer@0.6.0`, `/procedural`). Only the last step
  (SVG → pixels) belongs to the game. Same seed in, same genome and the
  same SVG as the Standalone **[ran]**.
- The renderer is still 0.6.0 in the kit monorepo (core/react moved to
  0.9.0). Its executable code is unchanged since the 0.6.0 release.
  Genomes and SVGs are byte-identical between the game's copy, the kit's
  build and the Standalone's copy **[ran]**.
- **The game's seeds are not real V3 seeds.**
  - A real V3 Blobbi's seed is 64 hex characters, derived from its Nostr
    address: `deriveBlobbiV3Seed(pubkey, d)`.
  - The game feeds free strings like `blobbi-9` straight into
    `generateGenome`. They render deterministically, but no Standalone
    Blobbi can ever have them.
  - Given a real address-derived seed, the game draws the same genome as
    the Standalone (verified for a synthetic address).
- **Two V3 traits never reach the pixels**: the *gradient* pattern and
  *freckles*. The kit draws both, but the game's rasterizer drops them.
  Two concrete causes, below. Every other trait shows at 12, 24 and 48 px.
- The game draws **adult only**, 6 of the kit's 7 expressions, no egg or
  baby, and no kit accessories. Nostr loading and multiple Blobbis are not
  implemented.

## 1. The actual generation pipeline

| Step | Function | Where | Owner |
|---|---|---|---|
| Seed | any string; default `blobbi-9` | `src/playground/main.ts:83` (`?blobbi=` URL param), Blobbi seed inputs `#blobbi-seed`, `#blobbi-seed-2` | game |
| Hash + PRNG | cyrb128 → sfc32 (12 warm-up draws); one keyed stream per gene: `${seed}\u0000${key}` | kit `packages/blobbi-renderer/src/procedural/rng.ts:18-90` | kit |
| Genome | `generateGenome(seed)` → `{version:1, seed, colors, scheme, morphology(24 genes), traits, egg}` | kit `procedural/genome.ts:304-425`; game calls it in `src/blobbi/identity.ts:122` | kit |
| Morphology | `deriveMorphology(genome, 'adult')` | kit `procedural/morphology.ts`; called inside `renderBlobbiSvg` | kit |
| Geometry | `buildBlobbiGeometry(morphology, state)` | kit `procedural/renderer.ts:66`; the game also calls it for the ground anchor (`src/blobbi/canonical.ts:110`) | kit |
| SVG | `renderBlobbiSvg(genome, state)` | kit `procedural/renderer.ts:148`; game `src/blobbi/canonical.ts:90` | kit |
| Pose → state | `stateForPose(pose)`: stage `adult`, view, direction, expression weight 1, `sleeping`/`face.eyes:'half'` from lids, walking phase, gaze zero (applied after as a whole-pixel iris shift) | `src/blobbi/canonical.ts:47-71` | game |
| Rasterization | `rasterizeSvg(svg, {scale, bands:4, outline, minOpacity, gazeShift, snapRig})`: pixel-art fill, banded gradients, whole-pixel eyes, rig snapping | `src/blobbi/svg-raster.ts` | game |
| Sprite at a size | `buildCanonicalSprite(genome, pose, size)` → `buildBlobbiSprite(identity, pose, size)` | `src/blobbi/canonical.ts:84`, `src/blobbi/sprite.ts:18` | game |
| Per camera mode | `NativeBlobbi` cache per (seed, size), size from `blobbiScreenSize` | `src/render/view-renderer.ts`, `src/render/view-camera.ts` | game |

`src/blobbi/identity.ts` also derives a `PixelBlobbiIdentity` (body ramp,
genes, traits in pixel terms). Only its `genome` and `seed` are used by the
current renderer. The other fields fed the lab's earlier geometry
(`native-sprite.ts`), which survives only in the comparison lab and the
fidelity test **[read]**.

The kit side, per the kit agent's diff **[read]** and runs **[ran]**:
- `git diff 2e013a6 HEAD -- packages/blobbi-renderer/src` (2e013a6 is the
  0.6.0 release) changes only comments and docs.
- `diff -rq` of the game's installed `dist` against the kit's `dist`
  differs only in `.d.ts` and `.js.map` files.
- 25 seeds × 6 states: 0 genome differences and 0 SVG differences.

**blobbi-procedural** is where V3 was born:
- Commit `0cc5be5` is the prototype engine. The kit's `procedural/README.md`
  says it was "ported file for file" from that snapshot. The engine was then
  deleted from this repo (`3a722d9`), and the lab now draws through the kit
  sources via a vite alias.
- Prototype vs kit:
  - `rng.ts` and `generateColors` are identical.
  - `genome.ts` uses the same streams, ranges and odds.
  - The kit adds `pattern` and `mark`, replacing the prototype's
    `spots.enabled`.
  - Over 51 seeds the shared fields are identical **[ran]**.
- Two caveats:
  - The lab turns names into 64-hex seeds with its own FNV-based
    `seedFor()` (`src/kit.ts:92-106`). So the lab's "abc123" is **not** the
    game's `abc123`.
  - The lab no longer builds against the current kit: it imports
    `blobbiV3IdentityTags`, which was removed in kit `cf99bab` **[read]**.

## 2. Relevant source files

- **Game:**
  - `src/blobbi/identity.ts`: seed → kit genome.
  - `src/blobbi/canonical.ts`: pose → kit state → SVG → raster, anchor.
  - `src/blobbi/svg-raster.ts`: the SVG dialect rasterizer.
  - `src/blobbi/pose.ts`, `src/blobbi/animation.ts`: poses and the
    animator.
  - `src/blobbi/sprite.ts`: the one entry point.
  - `src/render/view-renderer.ts`, `src/render/view-camera.ts`: per-mode
    native sizes.
  - `src/sim/live-world.ts`: the single `blobbi` entity, its cache, rig and
    brain.
  - `src/game/persistence.ts`: save identity.
- **Kit (`blobbi-kit/packages`):**
  - `blobbi-renderer/src/procedural/{rng,genome,colors,morphology,renderer,state,expressions,version}.ts`.
  - `blobbi-renderer/src/artwork/v3/{identity,render}.ts`: the V3 artwork
    path, 64-hex seed check.
  - `blobbi-core/src/blobbi-v3-identity.ts`: `deriveBlobbiV3Seed`,
    `getBlobbiV3Seed`, `parseBlobbiV3Identity`, retired and absent tags.
  - `blobbi-core/src/blobbi.ts`: kinds, `parseBlobbiEvent`,
    `isValidBlobbiEvent`, `getCanonicalBlobbiD`, `buildEggTags`.
  - `blobbi-core/src/blobbi-visual-identity.ts`: `getBlobbiVisualIdentity`.
- **Standalone (`nostr-pet`):**
  - `src/lib/blobbi-visual.ts:20-33`: `toBlobbiVisual` → core
    `getBlobbiVisualIdentity`.
  - `src/features/home/scene/BlobbiActor.tsx:107,156-172`:
    `<BlobbiRenderer>`.
  - `src/features/adoption/adoption-plan.ts:69,102-106`: V3 adoption,
    `petId`, `d`, seed.
  - `src/hooks/useHomeBlobbi.ts`, `src/lib/select-current-blobbi.ts`:
    several Blobbis.
  - `src/features/home/scene/reactions.ts`: expressions from stats.

## 3. Current implementation status

| Capability | Status | Notes |
|---|---|---|
| Blobbi from the canonical V3 generator | **IMPLEMENTED** | kit `generateGenome` + `renderBlobbiSvg`; no second morphology [read, ran] |
| Seed → genome dynamically | **IMPLEMENTED** | generated on every `setBlobbi`, no fixture [read] |
| Player chooses a seed | **IMPLEMENTED (dev UI)** | Play tab "Blobbi seed" input and `?blobbi=`; any string [read] |
| Default Blobbi | fixed demo seed `blobbi-9` | `main.ts:83`; scripts and tests use it too [read] |
| Seed persisted with the world | **NOT IMPLEMENTED** | the world identity (`persistence.ts:64`) has no Blobbi seed; inventory and equipment are shared by any Blobbi in that world [read] |
| All V3 morphology genes | **IMPLEMENTED** | via the kit; 400 seeds give 400 distinct front sprites at 12, 24 and 48 px [ran] |
| V3 traits visible in pixels | **PARTIALLY IMPLEMENTED** | gradient pattern and freckles dropped (§6) [ran] |
| Expressions | **PARTIALLY IMPLEMENTED** | neutral, happy, excited, sad, surprised, sleepy; the kit's `upset`, blends and `FaceParts` (mouth, brows, blush) unused [read] |
| Life stages | **PARTIALLY IMPLEMENTED** | adult only (`stage:'adult'` hard-coded, `canonical.ts:50`); no egg or baby [read] |
| Views, walk cycle, gaze, sleep | **IMPLEMENTED** | front, side ×2, back; 6 walk phases; whole-pixel gaze; sleeping via lids [read] |
| Kit accessories and effects | **NOT IMPLEMENTED** | the game has its own tools (axe, pickaxe) on a hand rig [read] |
| Standalone (V3 address) seeds | **NOT IMPLEMENTED (compatible by construction)** | the same genome as the Standalone when given its 64-hex seed [ran]; nothing derives or accepts one today |
| Nostr loading | **NOT IMPLEMENTED** | no Nostr dependency [read] |
| Multiple Blobbis | **NOT IMPLEMENTED** | §7 |

## 4. Compatibility with the Standalone

**How the Standalone identifies a V3 Blobbi** [read, ran]:
- The address is kind 31124, `pubkey`, `d`.
- `d` is `blobbi-<first 12 hex of pubkey>-<petId10>` (`getCanonicalBlobbiD`).
- The seed is
  `deriveBlobbiV3Seed(pubkey, d) = hex(sha256(u8(21) ‖ "blobbi:visual-seed:v1" ‖ pubkey[32 bytes] ‖ u32be(len d) ‖ utf8 d))`.
- The event carries **no** seed, colour or trait tags: identity is the
  address.
- The render path is `getBlobbiVisualIdentity` → `<BlobbiRenderer>` →
  `resolveBlobbiV3Visual` → `blobbiV3Genome` → `generateGenome(seed)`.

**Same seed, same Blobbi?** Verified with a synthetic address (a
64-hex test pubkey, `d = blobbi-aaaaaaaa0123-0a1b2c3d4e`) **[ran]**:
- The Standalone's `generateGenome(seed)` and the game's are byte-identical.
- The Standalone's V3 artwork genome (`blobbiV3Genome(createBlobbiV3Identity(seed))`)
  equals the game's genome, except the metadata field `scheme`, which the
  artwork path leaves unset. It is not used for drawing.
- `renderBlobbiSvg` output is identical for adult and baby.
- The game rasterizes that genome at 12, 24 and 48 px (row 7 of
  `examples/audit/seed-gallery.png`).
- So identity, genome, colours, morphology and the vector drawing would be
  preserved. The pixel art then differs only by resolution, plus the two
  dropped traits (§6).
- Expressions match where the vocabulary overlaps. The Standalone derives
  its face from stats (`reactions.ts`: neutral / sad / sleepy, and care
  reactions); the game derives it from its own animator. A shared mapping
  would be needed.

**Caveats:**
- Seeds must be 64 hex characters and lower-cased **[ran]**: an upper-cased
  seed gives a different genome. The kit's V3 entry points enforce the
  format; the game's `generateGenome` path does not.
- **V1/V2 Blobbis** (no `visual_generation` tag, or `v2`) are a different
  system: hand-drawn artwork with a `seed` tag and colour tags. The
  procedural game cannot reproduce them. The kit's default for new Blobbis
  is still `v2`; the Standalone opts into `v3` at adoption.
- Name strings are not Blobbis: `abc123` in the game, in the
  blobbi-procedural lab and on Nostr are three different individuals.

## 5. Supported procedural characteristics

Odds come from the kit's `genome.ts`. The 400-seed distribution was
**[ran]**. Visibility was measured by rendering the same genome with and
without the trait and counting changed pixels, over 5 seeds that have it.
Front view, except the tail (side view).

| Trait | Values (kit odds) | 400 seeds | 12 px | 24 px | 48 px |
|---|---|---|---|---|---|
| Antenna | 0 / 1 / 2 (55/30/15%) | 220/113/67 | 5/5 (6.8 px) | 5/5 (13.8) | 5/5 (43.8) |
| Horns | none, forehead, top, side (80/8/6/6) | 328/25/12/35 | 5/5 (2.0) | 5/5 (7.2) | 5/5 (26.6) |
| Ears | none, round, pointed (86/9/5) | 359/27/14 | 5/5 (4.8) | 5/5 (16.4) | 5/5 (54.6) |
| Tail | none, nub, curl, leaf (50/22/16/12) | 206/85/55/54 | 5/5 (2.6) | 5/5 (7.4) | 5/5 (23.6) |
| Pattern spotted | (26%) | 117 | 5/5 (2.6) | 5/5 (5.2) | 5/5 (20.0) |
| Pattern striped | (16%) | 60 | 4/5 (1.8) | 5/5 (5.2) | 5/5 (14.2) |
| **Pattern gradient** | (18%) | 70 | **0/5** | **0/5** | **0/5** |
| Special mark | none, star, heart, sparkle, moon (58/12/11/10/9) | 247/37/44/37/35 | 3/5 (1.0) | 3/5 (1.8) | 3/5 (4.8) |
| Belly | 25% | 100 | 5/5 (15.4) | 5/5 (69.6) | 5/5 (286) |
| **Freckles** | 22% | 80 | **0/5** | **0/5** | **0/5** |
| Eye colour | per seed | | 5/5 | 5/5 | 5/5 |
| Accent colour | non-analogous schemes | | 4/5 | 4/5 | 4/5 |
| Secondary colour | per seed | | 1/5 | 1/5 | 1/5 |

How to read the partial rows:
- **Special mark:** 3/5 is the kit's own choice, not a pixel loss. In 2 of
  the 5 seeds the kit's front-view SVG has no mark at all (it sits on a
  region not visible from the front) **[ran]**.
- **Secondary colour:** the kit uses it for limbs and details that are
  small or banded, so it rarely changes a front pixel at these sizes. Not a
  loss.
- **Morphology genes:** the 24 genes all reach the kit drawing. 400 seeds
  give 400 distinct sprites at each size **[ran]**.

**Hard-coded differences between sizes** (there are none between camera
modes as such: a mode only picks a size) **[read]**:
- `gazeShiftFor`: the iris moves 1 px sideways; vertically only from 24 px;
  2 px from 40 px.
- Eye whites at least 2×3 px; a shape that wins no pixel gets its best
  pixel.
- `snapRig` (walking only): rig motion under 1 px is snapped. At 12–24 px
  the body and arms hold; at 48 px the arms and tuft move as drawn.
- The same 4 gradient bands, outline and marking opacity floors at every
  size.

All sizes come from the same `identity.genome` object, so a Blobbi keeps its
identity across 12, 24 and 48 px. The size only changes the raster scale
(`view-renderer.ts` `NativeBlobbi` → `buildBlobbiSprite(identity, pose,
size)`).

## 6. Missing features and inconsistencies

1. **Gradient pattern dropped (game rasterizer).**
   - The kit draws it as `<rect data-part="pattern-gradient" fill="url(#…pattern-gradient)">`.
   - `svg-raster.ts` paints only `path`, `ellipse` and `circle` (`walk`,
     around `:826`), so the rect is skipped.
   - The gradient also relies on `stop-opacity` (0 → 0.37 → 0.52), which
     the stop parser ignores (`collectDefs`, `:411`). Adding `rect` alone
     would paint it opaque.
   - 18% of V3 Blobbis are affected. Visible on `blobbi-19` and `blobbi-5`
     in the gallery: the kit reference has a darker lower body, the pixels
     do not.
2. **Freckles dropped (game rasterizer).**
   - The kit writes `<g data-part="freckles" fill="#…" opacity="0.5"><circle data-part="freckle" …/>`.
     The fill is on the group.
   - `paintFill` reads only the shape's own `fill` (`:468`), so each
     freckle has no fill and is skipped.
   - Not a size problem: still 0 changed pixels at 192 px, where a freckle
     is over 1 px in radius **[ran]**.
   - The comment at `svg-raster.ts:12` ("a freckle survives at 16 px") is
     therefore wrong today.
   - 22% of V3 Blobbis are affected.
   - A scan of 300 seeds × 3 views × walk/stand (20 seeds × 6 expressions)
     found no other unsupported element and no other shape inheriting its
     fill **[ran]**.
3. **Non-canonical demo seeds.** `blobbi-9` and every seed in tests and
   scripts are free strings, never 64-hex. Pinned hashes and screenshots are
   of Blobbis that cannot exist on Nostr.
4. **Adult only; expression subset.** No egg or baby (the kit supports
   both, and the Standalone shows them). No `upset`, no `FaceParts`.
5. **Blobbi not part of the save identity**, so switching the Blobbi seed
   keeps the same inventory, tools and buildings.
6. **Stale code around the edges** (not used by gameplay):
   - `PixelBlobbiIdentity`'s derived fields and `native-sprite.ts`
     (comparison only).
   - blobbi-procedural's lab is out of date with kit core 0.9.0.
   - A stale comment in kit `blobbi-core/src/blobbi.ts:~147-150`.

## 7. Potential architectural problems

**Multiple Blobbis.** The architecture assumes one Blobbi throughout
**[read]**:
- **The Blobbi itself:**
  - `LiveWorld.blobbi` is a single field, with 34 references in
    `live-world.ts`.
  - There is one `blobbiCache`, keyed by pose and size but not seed
    (cleared on `setBlobbi`).
  - There is one `rig` (`EquipmentRig`) and one `Brain`, seeded from
    `world.seed/blobbi.seed` (a good basis for per-Blobbi determinism).
  - There is one `bubble` and one `equipped`; the inventory is per world.
- **Rendering:**
  - `LiveRenderer` draws one Blobbi into painter's order.
  - The `ViewRenderer` split (`d.y > by …`) puts one Blobbi between the
    back layer and the overlay. With several Blobbis this must become "all
    characters sorted with the drawables", each with its own native sprite
    and tool.
  - `NativeBlobbi` is keyed `seed|size` but built from `live.blobbi`.
- **Camera and input:** the camera follows `live.blobbi`; player input and
  E/P interactions drive it directly.
- **Simulation:**
  - Collision only tests Blobbi against world, never Blobbi against Blobbi.
  - The nav grid is shared and fine.
- **Persistence:**
  - The save has no Blobbi list. Position and identity are not saved
    (positions restart at spawn).
  - Inventory and equipment would need an owner.

What already works for it:
- Sprites are pure functions of (genome, pose, size).
- The rasterizer is stateless.
- The brain, animator and particle streams are seeded by strings.
- The world, nav and camera are independent of which Blobbi is shown.

**Other risks:**
- **Format risk:** the game's `generateGenome(seed)` path performs no V3
  seed validation. A Nostr integration must use `deriveBlobbiV3Seed` (or
  `getBlobbiV3Seed(event)`) and pass the lower-case 64-hex result, or it
  will silently draw a different Blobbi.
- **Version pinning:** the game pins `@blobbi-kit/renderer ^0.6.0`. The kit
  promises "V3 is Algorithm 1, forever", and the renderer's code is frozen.
  But a 0.7 with any drawing change would shift pinned hashes. Keep exact
  pins and the snapshot tests as the tripwire.
- **Rasterizer coverage:** the rasterizer supports exactly the SVG subset
  the kit emits today. A new kit primitive (as `rect` already is) silently
  disappears. A guard test that fails on any unhandled element or
  fill-less shape would catch this.

## 8. Recommended next steps

In order, each small and separately testable:

1. **Fix the two rasterizer gaps** in the game, inside the rasterizer only:
   - `rect` support, `stop-opacity`, and fill inherited from parent groups.
   - Re-pin the affected hashes after inspecting images.
   - Add a guard test that fails on unhandled SVG elements and fill-less
     shapes over a seed sweep.
2. **Adopt canonical seeds.** Accept a 64-hex V3 seed, and add an
   "address" input (pubkey + d) that computes `deriveBlobbiV3Seed`.
   - Either depend on `@blobbi-kit/core@0.9.0` or port its ~10-line hash
     with the kit's test vectors (`blobbi-v3-seed.vectors.json`).
   - Validate and lower-case the seed as the kit does.
   - Choose a 64-hex demo seed to replace `blobbi-9`; the hashes will need
     re-pinning.
3. **Put the Blobbi seed in the save** (schema v5) so a world remembers
   whose it is.
4. **Expression mapping** shared with the Standalone (`upset`, stat-driven
   baseline). Consider `FaceParts` for the close-up.
5. **Read-only Nostr loading** (later milestone):
   - Fetch kind 31124 by address with `#d` (plus the 11125 profile's
     `current_companion` / `has` to pick one).
   - Use `parseBlobbiEvent` / `getBlobbiV3Seed`.
   - Accept `visual_generation = v3` only; show V1/V2 as unsupported.
   - Map `stage` (adult now; baby and egg after step 6).
   - No writes.
6. **Baby and egg stages** via the kit's `stage` and `renderEggSvg`.
   Needs the anchor, size and rig checked per stage.
7. **Multiple Blobbis** (later): a `blobbis[]` collection, each with its own
   brain, animator, rig, caches and save record; all characters
   depth-sorted in the split render; a camera target selection;
   Blobbi-to-Blobbi avoidance.

## Evidence

- `examples/audit/seed-gallery.png`: seven seeds (including one derived
  from a V3 address), each with the kit's SVG rendered by resvg as the
  reference, then the game's native 12, 24 and 48 px rasters, 1:1. Rows 4–5
  show the missing gradient and row 6 the missing freckles.
- Comparison scripts (scratch, not in the repo):
  - trait visibility and distribution;
  - SVG markup scan;
  - freckles at 48–192 px;
  - Standalone seed equivalence;
  - kit dist equivalence (by the kit agent);
  - prototype-vs-kit genome comparison (by the procedural agent).
