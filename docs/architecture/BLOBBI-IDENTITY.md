# Blobbi identity

**IMPLEMENTED** (M3.4, audited in [REPORT-BLOBBI-PROCEDURAL-AUDIT](../milestones/reports/REPORT-BLOBBI-PROCEDURAL-AUDIT.md)
and [REPORT-M3.4](../milestones/reports/REPORT-M3.4.md)). This repository **reuses** the Blobbi ecosystem's identity; it
never defines its own.

## 1. Which Blobbi

`src/blobbi/source.ts` resolves what the player gives into one seed, with the kit's own V3 rules
(`@blobbi-kit/core`, pinned exact):

| Source | Input | Seed |
|---|---|---|
| `v3-address` | owner pubkey (64 lower-case hex) + Blobbi `d` tag | `deriveBlobbiV3Seed(pubkey, d)` |
| `v3-seed` | 64 hex digits | `canonicalBlobbiV3Seed(value)` |
| `demo` | any other development string (`blobbi-9`) | the string itself (a lab-only Blobbi) |

Input is validated strictly and never "repaired" (an npub, upper case, spaces or a wrong length are refused with a
reason). The same address or seed is the same Blobbi as in the Blobbi Standalone, gene for gene.

## 2. From seed to pixels

`generateGenome(seed)` (`@blobbi-kit/renderer/procedural`) → `src/blobbi/identity.ts` reads the genes (colours,
morphology, trait kinds, pattern, mark) → `src/blobbi/canonical.ts` asks the kit's own `renderBlobbiSvg` for the
exact state (view, expression, lids, gaze, walk phase) → `src/blobbi/svg-raster.ts` paints that SVG with pixel-art
rules (thresholded coverage, banded gradients, one-pixel strokes, an outside outline, feature-aware eyes and
mouths). There is **no second morphology**: the silhouette, face, limbs, traits and walk cycle are the kit's.

- `src/blobbi/native-sprite.ts` (the lab's earlier geometry) and `src/blobbi/scale-lab.ts` (32 px experiments) are
  kept for comparison only; gameplay never imports them.
- Pinned identity hashes: `tests/__snapshots__/blobbi-hashes.json`; tests in `tests/identity.test.ts`,
  `tests/fidelity.test.ts`, `tests/faces.test.ts`, `tests/raster-compat.test.ts`.

## 3. In play

- The camera draws the Blobbi natively at 12, 24 or 48 px (never magnified); walking uses whole-pixel rig motion.
- Tools attach to the hand found from the canonical drawing itself (`src/game/equipment.ts`).
- Teleportation closes only the lids; everything else stays canonical (tested in `tests/teleport.test.ts`).
- Expressions come from care (mood) and reactions, using the kit's expression set.

## 4. Ownership

- The selected Blobbi is the **player's** choice per browser (`blobbi-pixel-lab:selected-blobbi`,
  `src/game/blobbi-selection.ts`). It owns nothing.
- Everything on an island belongs to the **world** (`owner: 'local-world'`); no save names a Blobbi
  (`tests/boundaries.test.ts`, `tests/identity.test.ts`). The island's companion record (needs, friendship) is the
  island's; a Blobbi's tastes come from its seed at runtime.
- Visiting another world (M7) carries the Blobbi's identity unchanged and nothing else.

## 5. Future (DESIGNED ONLY)

Carrying a Blobbi between Blobbi games keeps the V3 address as the identity; see
[Cross-game travel](CROSS-GAME-TRAVEL.md).
