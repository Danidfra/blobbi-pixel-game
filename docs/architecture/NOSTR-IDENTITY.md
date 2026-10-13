# Nostr identity: players, canonical Blobbis, guests

**Status: AUDIT + DESIGN (M11A); partly IMPLEMENTED since.** M11B implemented read-only NIP-07 identity; M11C implemented read-only discovery of the player's canonical Blobbis and V3-adult selection (see §5). The rest is design. Facts are labelled **VERIFIED**
(read in source at the commit given), **DOCUMENTED ONLY**, **PROPOSED** or **UNKNOWN**. Repositories read
(2026-10-13): `blobbi-kit` `main` `1e2d348` (`@blobbi-kit/core` 0.9.0, renderer 0.6.0, react 0.9.0), `nostr-pet`
`feat/blobbi-v3` `b7916dc`, `ditto` `feat/blobbi-v3` `b2e65945`, `blobbi-island` `production` `1a6c3b6`,
`blobbi-pixel-game` `develop` `9469dc9`. Event kinds below are **Blobbi-ecosystem conventions** defined by
`@blobbi-kit/core`; none of them is in the official NIP registry (`~/Developer/nips/README.md` at `acf74f8`).

## 1. The canonical Blobbi (VERIFIED)

| Fact | Value | Source |
|---|---|---|
| State event | kind **31124**, addressable, signed by the owner | `blobbi-kit/packages/blobbi-core/src/blobbi.ts:27` |
| Address | `31124:<owner pubkey>:<d>` (`buildBlobbiAddress`) | `blobbi.ts:513` |
| `d` tag | `blobbi-<pubkey[0..12]>-<10 hex random>` (`getCanonicalBlobbiD`, `generatePetId10`), checked by `/^blobbi-[0-9a-f]{12}-[0-9a-f]{10}$/` | `blobbi.ts:480,490,659` |
| Ecosystem marker | tag `["b","blobbi:ecosystem:v1"]` | `blobbi.ts:25` |
| Valid event | kind 31124, `d`, `b`, `stage` ∈ egg/baby/adult, `state` ∈ active/sleeping/hibernating, `last_interaction` (`isValidBlobbiEvent`) | `blobbi.ts:1148` |
| "Modern" (not legacy) | canonical `d`, a `name`, and a seed (V1/V2: 64-hex `seed` tag; V3: derived from the address) | `isLegacyBlobbiEvent`, `blobbi.ts:1070` |
| Player profile | kind **11125** replaceable (`d` = `blobbonaut-<pubkey[0..12]>`), tags `current_companion` (a 31124 `d`), `has` (repeated), `name`, `xp`, `level`, `room`…; **31125** legacy, read only | `blobbi.ts:28,31,498` |
| Interaction | kind **1124** regular, tags `a` (31124 coordinate), `p` owner, `action` ∈ feed/play/clean/medicate/boost, `source`; signed by anyone | `blobbi-interaction.ts:28,38` |
| Lifecycle | **no hatch or evolve event**: every stage change republishes the same 31124 (`stage`, `progression_state` incubating/evolving/none); missions live in its JSON `content` | kit react `useBlobbiHatch`, `useBlobbiEvolve`, `evolution-missions.ts:177-189` |
| Unknown tags | preserved on republish (`mergeTagsForRepublish`) | `blobbi.ts:1682` |

**Visual identity (VERIFIED).**
- **V3**: `seed = deriveBlobbiV3Seed(pubkey, d)` = lower-case hex SHA-256 of
  `u8(len(DOMAIN)) ‖ DOMAIN ‖ 32-byte pubkey ‖ u32be(len(d)) ‖ d` with `DOMAIN = "blobbi:visual-seed:v1"`
  (`blobbi-v3-identity.ts:206,231,283`), frozen by `blobbi-v3-seed.vectors.json`. A V3 event carries **no** seed or
  appearance tags (`BLOBBI_V3_ABSENT_TAG_NAMES`, `:101`), only `visual_generation` = `v3`. Appearance is computed
  by the renderer (`createBlobbiV3Identity` → `generateGenome`, Algorithm 1, `PROCEDURAL_ALGORITHM_VERSION = 1`).
- **V1/V2**: `seed = sha256("blobbi:v1|" + pubkey + ":" + d + ":" + createdAt)`, stored in a `seed` tag, plus mirror
  tags (`deriveBlobbiSeedV1`, `blobbi.ts:553`); traits come from slices of that seed (`deriveSeedIdentity`, `:960`),
  **a different visual algorithm** from V3.
- **Default generation**: the kit's `NEW_BLOBBI_VISUAL_GENERATION` is still `'v2'` (`blobbi.ts:159`); nostr-pet
  adopts V3 (`features/adoption/adoption-plan.ts:69`), Blobbi Island too (`src/lib/blobbi-egg-preview.ts:107`), Ditto
  previews too. So **V1, V2 and V3 Blobbis all exist** on relays.

**Locating a player's Blobbis (VERIFIED).** `{kinds:[31124], authors:[pk], "#b":["blobbi:ecosystem:v1"]}`, keep the
newest per `d`, filter `isModernBlobbiEvent` (kit `useBlobbisCollection`); the current one: a device pick
(`blobbi:selected:d:<pubkey>` in localStorage), else the profile's `current_companion`, else the only one, else the
most recently interacted (`nostr-pet/src/lib/select-current-blobbi.ts:16-33`). Several Blobbis per owner are
distinguished by `d`.

**Ownership checks (VERIFIED, with a gap).** Signatures are verified by Nostrify's `NRelay1` (nostr-tools
`verifyEvent`); readers rely on the `authors` filter and do **not** re-check `event.pubkey` for 31124/11125 (a relay
that ignores `authors` could hand back a validly signed event by someone else: UNVERIFIED whether exploitable).
**Blobbi Pixel must check `event.pubkey === owner` itself.**

## 2. Blobbi Pixel today (VERIFIED)

| Question | Answer | Source |
|---|---|---|
| Nostr libraries | none; a test forbids network, `nostr-tools`, `signEvent` in `src/` | `package.json`; `tests/boundaries.test.ts:11-14` |
| Identity rules | `@blobbi-kit/core` 0.9.0, pinned | `package.json:20` |
| Blobbi sources | `v3-address` (pubkey + `d` → `deriveBlobbiV3Seed`), `v3-seed` (64 hex), `demo` (any string) | `src/blobbi/source.ts` |
| A new player's Blobbi | the **demo seed `blobbi-9`**, which exists in no other app, unless a link or the lab's Blobbi tab chose another | `src/playground/main.ts:124-125` |
| Where it is stored | `blobbi-pixel-lab:selected-blobbi` (`{version:1, source}`), re-validated on load; the player's, per browser | `src/game/blobbi-selection.ts` |
| Appearance | always the **V3 algorithm**: `generateGenome(seed)` → the kit's `renderBlobbiSvg` → pixel raster | `docs/architecture/BLOBBI-IDENTITY.md` |
| Progress belongs to | the **island** (`owner: 'local-world'`); no save names a Blobbi; companion needs/friendship are the island's | `src/game/persistence.ts`, `BLOBBI-IDENTITY.md` §4 |
| Player id | `local:<random>` per browser (`blobbi-pixel-lab:player`), with a local owners index | `src/game/visiting.ts:69-77` |

**Gaps.**
1. **V1/V2 Blobbis would be drawn wrong.** A V1/V2 Blobbi's `seed` is 64 hex, so `resolveBlobbi` accepts it as a
   `v3-seed`, and the pixel game would draw it with the V3 algorithm — a different creature from the one its owner
   knows. *Rule:* import only Blobbis whose 31124 says `visual_generation` = `v3`; show V1/V2 ones as "not yet
   available here" (or later, a V1/V2 pixel path built on the kit's `deriveVisualTraits`).
2. **Everyone's default is the same demo Blobbi.** Acceptable for guests (it is a "visitor" Blobbi), but the product
   must say which Blobbi is the player's once an identity is connected.
3. **No owner check** exists yet (none needed so far).

## 3. Recommendations

| Decision | Recommendation | Evidence | Confidence | Open questions |
|---|---|---|---|---|
| Who the player is | The Nostr pubkey of a **signer the player already has** (NIP-07 extension, NIP-46 remote signer). No identity needed to play. | Every Blobbi app logs in with NIP-07 / NIP-46 / nsec via Nostrify `NLogin` (nostr-pet `useLoginActions.ts`, island idem, nostr-farm `LoginDialog.tsx`) | High | Which NIP-46 flow first (bunker URI vs `nostrconnect://` QR) |
| Secret keys | **Never** ask to paste an nsec; **never** generate a key in the game. A player without a signer is sent to an app that makes and backs up keys. | The other apps accept nsec and generate keys (`new-account.ts`, island `SignupDialog.tsx:50`): out of scope here by the M11A rules | High | Whether Blobbi Pixel should deep-link to a sister app for sign-up |
| Which Blobbi walks the island | The player's **existing V3 Blobbi**, read-only: 31124 by `authors` + `#b`, validated with the kit, `event.pubkey` re-checked, seed from `deriveBlobbiV3Seed` (already in `src/blobbi/source.ts`). Never create or write a 31124 in the alpha. | §1, §2 | High | Whether to offer "adopt a Blobbi" by linking to nostr-pet |
| No duplicates | The game **reads** Blobbis; it never makes one, so it cannot duplicate one. The `v3-address` source is the identity; the derived seed is never stored as an identity. | `source.ts` keeps the address | High | — |
| V1/V2 | Not drawn in the alpha (listed, labelled). | Gap 1 | High | Is a V1/V2 pixel path wanted later? |
| Progress | Stays the **island's** (as today). Switching Blobbi never moves progress. A Blobbi visiting carries only its address. | `BLOBBI-IDENTITY.md` §4 | High | — |
| Interactions (1124) | Not in the alpha. Later, "care" on the island could publish 1124 `feed`/`play` with `source` = `blobbi-pixel` (owner or visitor), the existing kind. | `blobbi-interaction.ts` | Medium | Would the owner's apps count them (mission credit) as intended? |
| Profile (11125) | Read `current_companion` and `name`; never write it in the alpha. | §1 | High | — |
| Autonomous Blobbis | Out of scope. A Blobbi has no key of its own today: its identity is `owner pubkey + d`; any future agent identity must keep that address as the canonical id. | §1 | High | — |

## 4. Guest play and progressive onboarding (PROPOSED)

1. **Begin** → Carrier → cinematic → play. A guest has a local player id and the demo Blobbi (renamed in the UI
   "a visiting Blobbi"); everything saves locally, as today.
2. Settings (and, gently, after a milestone such as the first growth): **"Keep your island safe — connect your
   Blobbi account"**. Shows the two ways the player may already have (a browser extension; a signer app via QR or
   link). No word "Nostr" on the first screen; a "What is this?" link explains.
3. After connecting: the game finds the player's Blobbis (V3 ones selectable) and asks **"Who lives on this
   island?"**; then world claiming ([world persistence](NOSTR-WORLD-PERSISTENCE.md) §5).
4. Disconnecting never deletes local data; it only stops syncing.

**Reusable without React (VERIFIED in `nostr-pet/node_modules/@nostrify/nostrify` 0.55.1):** `NBrowserSigner`
(NIP-07), `NConnectSigner` (NIP-46, `nip44` encryption option), `NPool`, `NRelay1` are framework-free classes.
`NLogin` (the login-storage helper the other apps use) is in `@nostrify/react` and is **not** usable here; Blobbi Pixel
needs its own small login record.

**Must be validated experimentally (M11B):** NIP-07 and NIP-46 from the canvas app with those classes, signer support
for `nip44.encrypt` to the player's own pubkey (optional in NIP-07: `~/Developer/nips/07.md:22`), signer behaviour
when the tab is backgrounded.

## 5. Implemented in M11C (read-only canonical Blobbis)

- **Query**: `{kinds:[31124], authors:[pk], "#b":["blobbi:ecosystem:v1"], limit:200}` to the two Blobbi relays, one
  REQ each, closed after; only when MY BLOBBIS opens; 5-minute memory cache; 8 s deadline (`src/nostr/relays.ts`,
  `src/nostr/account.ts`).
- **Ownership gap closed for Blobbi Pixel**: `event.pubkey === owner` is checked for every event (`src/nostr/blobbis.ts`).
- **Newest per `d`**, then the kit's `classifyBlobbiEvent === 'modern'` (same as `useBlobbisCollection`); legacy
  and invalid never shown.
- **Which Blobbi walks**: the player's own choice on this device (MY BLOBBIS); the profile's `current_companion`
  (kind 11125) is **not read yet** (the choice is explicit, so no surprise swap; reading it is a later nicety).
  Only V3 adults may visit (see [generations](BLOBBI-GENERATION-COMPATIBILITY.md) §4).
- **Identity**: the address `31124:pk:d` stays the identity (the selection stores a `v3-address`); the seed is derived
  by the kit on every load and never stored as identity. Guests keep the visiting demo Blobbi.
- **Never**: publishing, editing a 31124, claiming an island, syncing saves, reading or making secret keys.

## M11D.4

Signing and publishing now exist, confined to the key vault, the extension signer and the publisher, and only for a consented registration of a Blobbi met in this game: see [M11D.4](../milestones/M11D4.md). Reading stays as described above.
