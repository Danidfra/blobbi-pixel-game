# Blobbi generations V1, V2, V3 — compatibility with Blobbi Pixel (M11B)

**Status: INVESTIGATION** (read-only; no canonical identity, generation, event or kit code changed). Sources read
2026-10-13: `blobbi-kit` `main` `1e2d348` (`@blobbi-kit/core` 0.9.0, renderer 0.6.0), `nostr-pet` `feat/blobbi-v3`
`b7916dc`, `blobbi-procedural` `master` `d231092`, this repository. Labels: **VERIFIED** (read in source, line
given), **UNKNOWN** (not checked). Ditto and Blobbi Island were not re-read for this question.

## 1. What distinguishes the generations (VERIFIED)

| | V1 | V2 | V3 |
|---|---|---|---|
| Marker on the 31124 event | **no tag** (absent = V1: `DEFAULT_VISUAL_GENERATION`, `blobbi.ts:143`, `parseVisualGeneration` :182) | `["visual_generation","v2"]` | `["visual_generation","v3"]` (`visualGenerationTags` :168) |
| Seed | `sha256("blobbi:v1\|pubkey:d:createdAt")` (`deriveBlobbiSeedV1` :553), stored in a `seed` tag with mirror tags (colours, pattern, mark, size, `adult_type`) | **same as V1** (no V2 seed function; `buildEggTags` :1523) | `deriveBlobbiV3Seed(pubkey, d)` (`blobbi-v3-identity.ts:283`), domain `blobbi:visual-seed:v1`, **no** seed or appearance tags (:101); any `seed` tag is ignored (:302) |
| Trait model | `deriveSeedIdentity` (:960): 3 colours, pattern solid/spotted/striped/gradient, mark none/star/heart/sparkle/blush, size, one of **16 hand-drawn adult forms** | **same traits as V1**; differs only in the adult artwork | `generateGenome` (renderer `procedural/genome.ts:304`): 4 colours, morphology, antenna/horns/ears/tail, belly, freckles, pattern, mark (…/moon); **no adult forms, no size**; Algorithm 1 |
| Artwork | V1 egg, baby and 16 adult SVGs (`artwork/registry.ts:195-215`) | one authored V2 adult anatomy (blobbi-kit renderer adult/v2/parts.ts), V1 egg and baby (:147-191); pattern/mark/theme "PENDING" (kit adult/v2/customize.ts:33) | procedural renderer (`procedural/renderer.ts:148`) |
| Created by default by | Blobbis made before the marker | the kit's `buildEggTags` (`NEW_BLOBBI_VISUAL_GENERATION = 'v2'`, :159) | nostr-pet adoption (`ADOPTION_VISUAL_GENERATION = 'v3'`, `adoption-plan.ts:69`) |

## 2. Answers

- **Do V2 and V3 share morphology?** No. V2 is one authored body with semantic parts; V3 is a generated genome with
  anatomy genes V2 has no concept of (horns, ears, tail, antenna). They share only the vocabulary of colours and of
  pattern (solid/spotted/striped/gradient), and even the marks differ (blush vs moon).
- **Is V3 a compatible evolution of V2?** No: a different model with a **different seed** (address-only vs
  address + birth time). The same `pubkey + d` gives unrelated looks under V2 rules and V3 rules. The owner's
  suspicion that V2 and V3 look alike is not supported by the code: V2 is closer to V1 (same seed, same traits).
- **Does the same Blobbi look different across apps?** Not among kit-based apps: the generation is persistent
  event data ("never mirrored or rewritten", `blobbi-tag-schema.ts:586-597`) and every app renders through the same
  registry (`renderBlobbiSvg`, `load-blobbi-svg.ts:142`), which branches on it; nostr-pet passes the generation
  straight through (`lib/blobbi-visual.ts:20-33`). No code in the kit or nostr-pet migrates V1/V2 to V3 ("stay V1
  without any migration", `blobbi.ts:154-157`; "Existing Blobbis are untouched", `adoption-plan.ts:30-31`).
  **Blobbi Pixel is the exception**: it only knows V3 (below).
- **Blobbi Pixel today:** `src/blobbi/source.ts` accepts an address (always hashed with the V3 rule, :57) or any
  64-hex seed as a **V3 seed** (:69). It never reads `visual_generation`. A V1/V2 Blobbi's `seed` tag or address
  would therefore be drawn as an unrelated V3 creature — nothing changes on Nostr, but the picture would be wrong.
  The M11A rule stands: import only `visual_generation = v3` (planned for M11C; nothing imports Blobbis yet).
- **Can V1/V2 be drawn in Pixel without changing identity?** In principle yes, read-only: parse the event
  (`parseBlobbiEvent` → `getBlobbiVisualIdentity`), render with the kit's main `renderBlobbiSvg({ stage,
  visualGeneration, adultType, colours... })`, and rasterize. Needed work (estimated, not executed): the SVG
  rasterizer's allow-list (`src/blobbi/svg-raster.ts:120-134`) would have to accept `id`/`title`/`desc`, handle
  `line`, and drop `animateTransform`/`text`; V1/V2 art has fixed views and no genome rig, so the pixel game's walk,
  gaze and pose system (built on V3 geometry) would not apply — a V1/V2 Blobbi would move as a sliding sprite.
- **blobbi-procedural:** the original V3 prototype, now a catalogue page that renders through the kit (README);
  the kit is the source of truth for V3 Algorithm 1. Unrelated to V1/V2.

## 3. The "local world form" concept — evaluation

*"Your Blobbi has discovered a new form, perfect for exploring this little world!"*: in Blobbi Pixel a V1/V2
Blobbi would appear in a pixel-world form, while its canonical generation, event and original appearance stay
untouched and keep showing in the apps that support them.

| Criterion | Assessment |
|---|---|
| Narrative coherence | Good. The game already frames the Blobbi as visiting worlds by teleport; a world-specific form fits the cozy tone, and "discovered a form" reads as a gift, not a loss. |
| Technical feasibility | High *if the form is derived, not stored*: e.g. a pixel form computed from the canonical event (V1/V2 seed colours and adult form → a V3-style genome built by a documented, versioned local mapping). Rendering then reuses the whole pixel pipeline (walk, gaze, poses). |
| Identity preservation | Preserved only if: nothing is published; the form is never written into any event, save field or cache presented as identity; the address (`31124:pubkey:d`) stays the only identity; the mapping is labelled as Blobbi Pixel's own. |
| Deterministic rendering | Yes, if the mapping is a pure function of canonical event data with a version number (like the kit's `PROCEDURAL_ALGORITHM_VERSION`), pinned by test vectors. |
| User expectations | The main risk. A player who knows their V2 Blobbi as a pink round adult must recognise it: carry over what V1/V2 actually show (the three colours, roughly the size), say plainly that it is a local form, and show the original appearance next to it (e.g. a card in the Blobbi panel rendered with the kit's own V1/V2 art). Never call it an upgrade or evolution. |
| Future interoperability | Good if kept local: other apps never see it. If other worlds want the same idea, the mapping should become a kit-level, versioned spec rather than Pixel code. |

**Recommendation:** a good approach, as a clearly labelled, purely local, derived "world form" — and a better
first step than a full V1/V2 pixel renderer (which would lose the pixel game's animation and needs rasterizer
work). Prerequisites before implementing: (1) the owner and the kit maintainer agree on the mapping and its wording;
(2) the original V1/V2 appearance is shown alongside (kit renderer, a static card is enough); (3) test vectors pin
the mapping; (4) no write path exists (enforced by the M11B boundary tests). Until then, M11C should import V3 Blobbis
only and list V1/V2 ones as "not here yet". Nothing of this is implemented.
