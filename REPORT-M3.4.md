# M3.4: Procedural fidelity and identity

Scope: `blobbi-pixel-game`, 2026-10-11. This milestone follows the audit in
`REPORT-BLOBBI-PROCEDURAL-AUDIT.md` (M3.3 committed as `66bc9ac`).

- **Status:** approved after manual review (2026-10-11) and committed.
  Nothing was pushed or deployed.
- **Other repositories:** none was modified. The kit is used through
  packages pinned in `package.json`: `@blobbi-kit/renderer` 0.6.0 as before,
  and now `@blobbi-kit/core` 0.9.0, added and pinned exactly.
- **Out of scope:** no Nostr fetching, no multiple Blobbis, no baby or egg
  stage, no farming, and no new gameplay.

## 1. What was fixed

### Rasterizer (`src/blobbi/svg-raster.ts`)

The kit's SVG is read as the kit writes it. The kit renderer itself is
unchanged.

| Gap | Cause (audit section 6) | Fix |
|---|---|---|
| Gradient pattern missing (18% of V3 Blobbis) | `<rect>` was not a shape here; `stop-opacity` was ignored | `rect` is painted. Each gradient stop carries its opacity, and a band is composited over what lies under it at the interpolated opacity. A band below 1/64 paints nothing. Banding stays 4 bands, nearest-colour, deterministic. |
| Freckles missing (22%) | the fill is on the parent `<g data-part="freckles">`; shapes read only their own `fill` | Paint properties (`fill`, `stroke`, `stroke-width`) are inherited down groups as in SVG. Opacity still multiplies rather than inherits. |
| Freckles invisible even once painted | each freckle is 0.15–0.25 px wide below 48 px: no pixel wins | **Dot clusters** (pixel-art treatment, opt-in by `data-part`). See below. |
| Unsupported markup vanished silently | — | `svgSupportIssues(svg)` lists every unknown element, attribute, colour syntax, transform, broken `url(#…)` reference and fill-less shape. `rasterizeSvg` refuses an SVG that has any. |

**Dot clusters.** This applies only to the kit's `freckles` group:
- A freckle that is large enough to win pixels by itself is painted as
  usual.
- Freckles too small for that are pooled with their neighbours. A pool
  whose extent spans at least one pixel is drawn as one solid pixel under
  each freckle's centre. Freckles that land on the same pixel merge.
- A pool narrower than a pixel is not drawn, because one pixel would stand
  for less than one.

What the kit's trio under each eye becomes:

| Size | Span of the trio | Drawn as |
|---|---|---|
| 12 px | 0.58–0.73 px | not drawn |
| 24 px | 1.15–1.46 px | 1–3 pixels |
| 48 px | 2.3–2.9 px | 2–3 pixels |

The pixels use the kit's freckle colour. The existing marking floor raises
the group's 0.5 opacity to 1, so they stay readable. This changes neither
the positions nor the number of freckles; no trait is invented.

**One extra fidelity change, found while testing.** The kit's **belly
patch** is also a gradient with stop opacities (opaque in the middle,
transparent at the edge). It used to be painted as a flat 30% white
ellipse. It now fades towards its edge, as in the kit. This affects every
Blobbi with a belly (25%), and it is why the audit, which looked only at
rect and freckles, did not list it.

**Before and after** (`examples/fidelity/m3.3-vs-m3.4.png`):
- Columns: M3.3 at 24 px, M3.4 at 24 px, M3.3 at 48 px, M3.4 at 48 px.
- Rows: a freckled Blobbi, gradient + freckles, gradient + belly.

### Identity (`src/blobbi/source.ts`)

A Blobbi now comes from one of three sources. All derivation is the kit's
own: no seed algorithm was written here.

| Input | Source | Seed |
|---|---|---|
| owner pubkey + d tag | `v3-address` | `deriveBlobbiV3Seed(pubkey, d)` from `@blobbi-kit/core` |
| 64 hexadecimal digits | `v3-seed` | `canonicalBlobbiV3Seed(value)`: lower case, the kit's one spelling |
| anything else (e.g. `blobbi-9`) | `demo` | the string itself, as before (lab-only Blobbis) |

**Validation.** Errors are readable and nothing is repaired.

- **Seed field:** refused when it is empty, has surrounding spaces, has a
  `0x` prefix, or is 48–63 or 65+ hex digits ("a V3 seed is exactly 64
  hexadecimal digits; this one has 63").
- **Pubkey field:**
  - refused when it is missing, or an `npub` ("must be hexadecimal, not an
    npub");
  - refused when it is not hex, the wrong length, or upper case (NIP-01
    writes lower case).
- **d tag:**
  - refused when it is missing or ill-formed (a lone surrogate), with the
    kit's own error;
  - the d tag is used exactly as given: no trimming and no Unicode
    normalisation, as the kit requires.
- **Seed and address together:** refused.
- **Non-canonical d tags:** accepted, as the kit accepts them, with a note.
  The same applies to a d tag carrying another owner's prefix.

**Playground (Play tab):**
- The seed field takes a V3 seed or a demo seed.
- New fields: Owner pubkey, Blobbi d tag, and a "Use V3 address" button.
- New buttons: "Random V3 seed" (and "Random demo").
- A status line shows the current identity or the error. After an error the
  typed fields are kept, and the current Blobbi stays.
- An address is written to the URL hash as `pubkey=…&d=…`.

## 2. Which traits are now visible

Measured on 400 demo seeds and on canonical V3 addresses (tests in
`tests/raster-compat.test.ts`):

| Trait | 12 px | 24 px | 48 px |
|---|---|---|---|
| Gradient pattern | yes (≥10 px darker, lower body only) | yes (≥40) | yes (≥150) |
| Freckles, front | no: under a pixel (by design, see above) | yes, 4–6 px, all 80 freckled seeds | yes, 5–6 px, all 80 |
| Freckles, side | no | yes, 1–3 px | yes, 3 px |
| Belly | yes, now with the kit's soft edge | yes | yes |
| Antenna, horns, ears, tail, spots, stripes, mark, colours | unchanged from M3.3 (audit section 5) | unchanged | unchanged |

**Unchanged by design:**
- **Back view:** neither the kit's back view nor the game's shows freckles
  or face markings.
- **Visibility of other traits:** antenna, horns, ears, tail, spots,
  stripes, mark and colours show as in M3.3.
- **Pixels of Blobbis without these traits:** every Blobbi without a
  gradient pattern, freckles or belly is pixel-identical to M3.3. Of the
  pinned sprite hashes, only `ears-2` (belly + freckles) and `horns-1`
  (belly) changed, and only in views that show those traits. They were
  re-pinned after the images were inspected.

**Support check.** The kit's output for these states produces **zero**
issues:
- 150 seeds × 3 views × still / walk / idle;
- every expression and lid state for 20 of them.

## 3. How identity persistence works

There are two separate records, with explicit ownership.

**1. The selected Blobbi** (`src/game/blobbi-selection.ts`):
- **Record:** key `blobbi-pixel-lab:selected-blobbi`, version 1,
  `{ source }`. There is one record per browser.
- **Contents:** an address is stored as an address (pubkey, d) together
  with its derived seed.
- **Validation on load:** every load re-validates the record with the kit's
  rules. A record whose seed is not what its address derives, or that is
  malformed, is ignored whole.
- **At start-up, the first match wins:**
  1. a Blobbi named in the link (`#pubkey=…&d=…` or `#blobbi=…`);
  2. the stored selection;
  3. the demo `blobbi-9`.

  A link naming an invalid Blobbi is reported in the status line and is not
  used.
- **What it does not touch:** camera mode is a separate viewer preference
  and never touches identity. A test cycles all modes and checks that the
  source, the genome, the drawn sprite and the stored record are unchanged.

**2. The world save** (`src/game/persistence.ts`):
- **Schema 5:** the only addition is `owner: 'local-world'`. Inventory,
  equipment, buildings, resources and world time belong to the local world,
  keyed by the world identity, as before.
- **No Blobbi in it:** no Blobbi seed or address appears in the record or in
  its key (tested).
- **Switching Blobbis:** `LiveWorld.setBlobbi` changes only who walks the
  island. The inventory stays, and the saved record is byte-identical before
  and after the switch (tested). Another Blobbi opening the same world
  therefore sees that world's inventory, which is intended and explicit.
- **Old saves:** records of schemas 1–4 migrate to schema 5 with the owner
  stated (tested from v1 and v4).
- **Other owners:** a schema 5 record naming any other owner, or none, is
  not read. That leaves room for a future per-Blobbi inventory, which would
  be a new record with its own key, never a reinterpretation of this one.

**Determinism.** The genome is always `generateGenome(source.seed)`, so the
same source gives the same Blobbi in every mode and after every reload.

**Same Blobbi as the Standalone.** For the kit's own frozen address
vectors:
- The game derives exactly the kit's seed (8 vectors, including a d tag
  with a trailing space and NFC/NFD Unicode).
- The renderer's `createBlobbiV3Identity(seed)` agrees with the game's
  genome on colours and every trait kind. This is what the Standalone
  resolves for a V3 event.
- The game's genome equals `generateGenome(seed)`.

**Checked in the browser** (dev server, Chrome):
- an upper-case pubkey was refused with the NIP-01 message, and the fields
  were kept;
- the lower-case pubkey and d were accepted, giving seed `50b4b285…`, the
  kit's vector;
- the record was stored; a reload with no Blobbi in the URL restored the
  address;
- the identity was unchanged through Overview, Exploration and Close-up;
- there were no app errors in the console.

## 4. Remaining fidelity limitations

- **Freckles at 12 px are not drawn.** Each trio is narrower than a pixel
  (0.6–0.7 px). One pixel per cheek would look like noise on a 12 px face
  and would overstate the trait about 20 times by area. The trait is still
  in the genome and appears from 24 px.
- **Freckles at 24 px share the cheek.** They are 1–3 pixels per cheek and
  take a few of the blush pixels. Freckles are drawn after cheeks in the
  kit too, so the order is the kit's; only the resolution is coarse.
- **The gradient pattern is quantised into 4 bands.** At 12 px it reads as
  a darker lower body rather than a smooth fade. The belly fade is banded
  the same way.
- **Markings are drawn more strongly than the kit draws them.** Spots and
  stripes are floored at 80% opacity, and freckles and the special mark at
  100%, because the kit's 50% does not read at pixel scale. Colours and
  shapes are the kit's; this policy is from M0 and unchanged.
- **The support check covers the dialect the kit writes for adult
  Blobbis.** The egg renderer and accessories (not used by the game) were
  not scanned. If the game draws them later, the check will refuse any new
  markup until it is supported. That is the intended guard.
- **Still open from the audit:**
  - adult only, with 6 of 7 expressions (no `upset`);
  - no shared stat-to-expression mapping with the Standalone;
  - no Nostr loading;
  - one Blobbi;
  - V1/V2 (hand-drawn) Blobbis cannot be shown.
- **Demo seeds** stay the default (`blobbi-9`), as the brief asked. Tests
  and scripts keep pinning demo Blobbis; the V3 tests use the kit's
  vectors.
- **Cost:**
  - **Bundle:** grows by 17 kB (6.8 kB gzipped) for the kit's SHA-256 and
    seed functions.
  - **Sprite builds:** about 0.1 ms slower each (1.67 / 1.83 / 2.41 ms
    against 1.60 / 1.68 / 2.36 ms at 12 / 24 / 48 px) because of the
    support check. Sprites are cached per pose and size.

## 5. Test results

- `npm run typecheck`: passes.
- `npm test`: **211 passed** (22 files). 30 are new:
  - `tests/raster-compat.test.ts` (18):
    - rect and translucent gradient bands; transparent stops;
    - group fill inheritance and override;
    - dot clusters above and below a pixel;
    - 8 refusals of unsupported markup;
    - a 150-seed scan of kit output;
    - gradient visibility at 12/24/48, lower body only;
    - freckles at 24/48 (front and side) in the kit's colour and none at
      12, and none in the back view;
    - determinism independent of render order;
    - 120 seeds distinct at 12, 24 and 48.
  - `tests/identity.test.ts` (12):
    - the kit's seed vectors; V3 seed case;
    - demo seeds unchanged;
    - agreement with the Standalone's V3 identity;
    - 15 validation errors; non-canonical d notes; 12/24/48 from one
      genome;
    - selection round trip and reload; tampered records ignored;
    - world ownership across a Blobbi switch;
    - schema 1–4 → 5 migration and refusal of other owners;
    - camera modes leave identity untouched.
- Updated:
  - `tests/camera.test.ts`: the save is schema 5 with `owner`;
  - `tests/crafting.test.ts`: v1 migration expects `owner`;
  - `tests/__snapshots__/blobbi-hashes.json`: 9 hashes, ears-2 and
    horns-1.
- `npm run build`: passes.
- **Preserved, by the unchanged tests:**
  - turtle anatomy and shell variant B;
  - camera proportions (12/24/48);
  - walking stability (zero upper-body churn at 12–32 px);
  - autonomy, gathering, mining, crafting, equipment, the shelter;
  - loading of existing saves.

## 6. Screenshot locations

`examples/fidelity/` (from `npx tsx scripts/trait-fidelity.ts`):

Every row of the two kit-vs-pixels sheets has the same columns: the kit's
SVG (resvg, anti-aliased, 96 px) | the game at 12 px ×8 | 24 px ×4 |
48 px ×2 | 12 / 24 / 48 at 1:1. All identities are canonical V3 addresses
whose seed comes from `deriveBlobbiV3Seed`.

- `traits-kit-vs-pixels.png`:

  | Rows | Trait | d tag |
  |---|---|---|
  | 1–2 | freckles, front and side | `blobbi-3bf0c63fcb93-0000000001` |
  | 3–4 | gradient pattern, front and side (with belly) | `…-0000000003` |
  | 5–6 | gradient + freckles, front and happy | `…-0000000017` |
  | 7 | belly with the soft edge | `…-0000000005` |

- `v3-identities-kit-vs-pixels.png`: eight distinct V3 identities (two
  owners, canonical d tags).
  - Row 1 is the kit's vector `blobbi-aaaaaaaaaaaa-3196847fb5` → seed
    `b24dede2…`.
  - The script prints each row's d tag, seed and traits.
- `m3.3-vs-m3.4.png`: before and after, 24 and 48 px (section 1).

**Also regenerated:** `examples/camera/*` (`scripts/camera-modes.ts`).
`blobbi-9` has a belly, so its pixels changed slightly; the camera and the
proportions did not.
