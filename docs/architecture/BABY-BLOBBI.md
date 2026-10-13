# Baby Blobbi in the pixel world (M11C.5, DESIGN)

**Status: INVESTIGATION + PROPOSAL (M11C.5); the visual part is IMPLEMENTED in [M11D.1](../milestones/M11D1.md)**: V3
Babies are drawn from the kit's baby with a whole-pixel hop, tools are held by invisible arms, V3 Babies can visit
from MY BLOBBIS and V1/V2 Babies show their kit picture. Still proposals: baby bars, energy, growth, the guest's own
Baby. The initial Blobbi is unchanged (the demo adult).
Facts are **VERIFIED** with paths (kit = `~/Developer/blobbi-kit/packages`, matching the installed `@blobbi-kit/core`
0.9.0 and renderer 0.6.0) or **PROPOSED**. Identity and registration: [guest Blobbi identity](GUEST-BLOBBI-IDENTITY.md).

## 1. How the kit draws a baby (VERIFIED)

| | V1 | V2 | V3 (procedural) |
|---|---|---|---|
| Baby art | one authored baby, awake and sleeping variants (`blobbi-renderer/src/artwork/baby/v1/lib/*`) | **none**: "Baby V2 is not designed yet: a V2 baby draws the V1 baby" (`artwork/registry.ts:190`) | generated from the same genome: `deriveMorphology(genome, 'baby')` (`procedural/morphology.ts:335`), `renderBlobbiSvg(genome, { stage: 'baby' })` (`procedural/renderer.ts:148-151`) |
| Egg | V1 egg (kit renderer: artwork/egg/v1/lib/egg-svg-data.ts) | V1 egg | `genome.egg` genes (spots, speckles, shape; `procedural/genome.ts:216-249, 398-421`), `deriveEgg` (`procedural/egg.ts:252-300`) |

**V3 baby vs adult** (kit renderer: procedural/plan/baby.ts vs procedural/plan/adult.ts):

| | Baby | Adult |
|---|---|---|
| Size | `scale: 0.64` (baby.ts:129) | 1 |
| Body / eyes / gait | `body: 'v1'` droplet, `eye: 'simple'`, `gait: 'hop'` (baby.ts:133) | `body: 'v2'`, `eye: 'layered'`, `gait: 'legs'` (adult.ts:228) |
| Limbs, brows, tuft | **none** (`arms/feet/brows/tuft: null`, baby.ts:89-94, 118-120) | yes |
| Trait development | antenna 0.5, horns 0.34, ears 0.52, **tail 0**, marking 0.85, no belly (baby.ts:132) | all 1, belly |
| Colours | a flatter baby paint (`procedural/colors.ts:202-208, 286-353`) | full |
| Expressions | no brows: lids carry it (`procedural/face.ts:246-247`); shallower mouths (baby.ts:46) | brows + lids |
| Motion | `hop`: floats and bobs (`procedural/motion.ts:96-118`) | walking legs |

**Identity across stages**: "The same identity is an egg, a baby and an adult" (`artwork/v3/identity.ts:37-38`);
the genome comes from the identity alone (`artwork/v3/render.ts:13-15`). Growing up never changes the seed, the d
or `visual_generation` (`blobbi-core/src/blobbi.ts:155-157`, tag schema `persistent: true`). A V3 baby grows into
exactly the adult its genome says.

**Lifecycle** (VERIFIED): hatch keeps d, seed and generation, sets stage baby, stats to max, and by default
`progression_state: 'evolving'` with evolve missions (`blobbi-react/src/hooks/useBlobbiHatch.ts:67-110`); evolve is
baby only, carries decayed stats, sets adult and `none` (`useBlobbiEvolve.ts:150-222`). Missions are social Nostr
actions (themes, colour moments, 21 interactions, a profile edit: `blobbi-react/src/lib/evolution-missions.ts:82-120`);
time is irrelevant (nostr-pet `features/lifecycle/useLifecycle.ts:51`).

## 2. What the pixel game would need (VERIFIED gaps, PROPOSED work)

| Area | Today | Needed for a baby |
|---|---|---|
| Raster | `stateForPose` fixes `stage: 'adult'` (`src/blobbi/canonical.ts`) | pass the stage; check the baby SVG against the rasterizer allow-list (`svgSupportIssues`, `src/blobbi/svg-raster.ts`): inner glow and the flat paint are untested (run `scripts/trait-fidelity.ts` style sheets) |
| Size | standing height from the canonical adult (`CANONICAL_STANDING_HEIGHT`), drawn 12/24/48 px | the 0.64 scale makes a 16 px adult about 10 px: keep the baby legible (at least 12 px at exploration zoom), decide whether the camera proportion rule bends for babies |
| Walk | kit walk with `snapRig` whole-pixel motion | `hop` gait: bob frames, snapped to whole pixels; no feet, so no walk cycle frames |
| Tools | `EquipmentRig` finds the hand by rasterizing the arm alone (`src/game/equipment.ts`) | **babies have no arms**: a new carry style (the tool held against the body side, or floating beside it in the same pixel style) and new swing poses; the user wants babies to use every tool |
| Gaze, faces | `gazeShiftFor`, expression map | simple eyes: one dark disc; expressions by lids only |
| Rest, beds | climb-in plan sized for adults | smaller sprite: bed offsets |
| Carrier, fishing line, canoe | anchored to rig points (rod tip) | new anchor points for the baby carry |

All activities (explore, chop, mine, fish, farm, build, cook, Carrier) can stay identical in rules; only the
presentation changes. Recommended carry: the tool tucked against the near side, raised with a little hop on a swing
(keeps the M2.3 lesson: compact on the near side, never across the body).

## 3. Status capacity: what "4 segments vs 10" means (VERIFIED)

- Stats are **1-100 for every stage** (`STAT_MIN = 1`, `STAT_MAX = 100`, `blobbi-core/src/blobbi.ts:49,54`).
- The 4/10 bars are **display**: `BABY_SEGMENTS = 4`, `ADULT_SEGMENTS = 10`, `toSegments(v, n) = ceil(v / 100 * n) || 1`
  (`blobbi-core/src/blobbi-segments.ts:45-62`), consumed by nostr-pet's `RoomStatusHud.tsx:54`. A baby at 60 hunger
  shows 3 of 4; an adult at 60 shows 6 of 10. Care thresholds differ (baby urgent ≤25, attention ≤50; adult ≤30, ≤60).
- What really differs is **decay**: per hour, baby hunger -8, happiness -4.5, hygiene -6, energy -9; adult -5, -2.5,
  -4, -5.5 (`blobbi-decay.ts:64-118`); sleep regen 40/h baby, 35/h adult (`:134-138`).

So a baby does not have "less stat" in the canonical model; it needs care more often and shows coarser bars.
**Recommendation**: keep Pixel's needs on 0-100 for both stages (they map 1:1 to kit stats later); draw a baby's bars
with 4 segments and an adult's with 10 using the kit's own `getBlobbiStatDisplayState` thresholds; express "smaller
capacity" only in the game-local **work energy** pool ([energy](BLOBBI-ENERGY.md)), never by rescaling canonical stats.

## 4. Growth (PROPOSED)

- Local (guest, unregistered): a gentle, play-based growth (days cared for, friendship, quests) with a celebration;
  nothing published.
- Registered: the canonical evolve needs the kit's missions, which are Nostr social actions. The pixel game must not
  fake them; options: let the Blobbi grow up in its home app, or later publish the evolve republish from Pixel once
  publishing is approved (respecting `progression_state` and missions).
- The pixel look must follow the canonical stage of a registered Blobbi (read-only): a baby in nostr-pet is a baby here.

## 5. Risks and open decisions

Risks: the baby's flat paint and inner glow may not rasterize cleanly at 10-12 px; the hop may read as jitter at
small sizes (the M3.3 shaking lesson); the tool carry is new art direction. Decisions: the carry style; the minimum
baby size per zoom; whether eggs ever appear in Pixel (an egg cannot walk: recommended only as a hatching moment).

## 6. Implementation order (after approval)

1. A baby sprite sheet script (V3 seeds, 12/24/48 px, front/side/back, hop frames) for the owner to judge.
2. Stage-aware rendering in `canonical.ts` and the native renderer, behind a flag; snapshot hashes.
3. The carry and swing for babies; fishing-line and bed anchors.
4. Baby bars (4 segments) in the HUD and care panel.
5. Only then: babies selectable in MY BLOBBIS (lifting KI-69: done in M11D.1), and the guest Baby ([guest identity](GUEST-BLOBBI-IDENTITY.md)).

## 7. Manual test checklist (future, all NOT TESTED)

BABY-01 a V3 baby looks like its nostr-pet self (side by side); BABY-02 hop walk reads smooth at every zoom;
BABY-03 every tool is usable and readable; BABY-04 bed, canoe, Carrier listening; BABY-05 the 4-segment bars.
