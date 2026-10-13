# Guest Blobbi identity, registration and the save model (M11C.5, DESIGN)

**Status: INVESTIGATION + PROPOSAL.** Nothing here is implemented. No key is generated, no event is published,
no save changes. Facts are labelled **VERIFIED** (read in source, path and line given) or **PROPOSED**. Sources read
2026-10-13: this repository (`develop` after M11C), `blobbi-kit` (`@blobbi-kit/core` 0.9.0, renderer 0.6.0, the
installed versions), `nostr-pet` (`feat/blobbi-v3`). Companion documents: [Baby Blobbi](BABY-BLOBBI.md),
[energy](BLOBBI-ENERGY.md), [account creation](ACCOUNT-CREATION.md), [Nostr identity](NOSTR-IDENTITY.md),
[generations](BLOBBI-GENERATION-COMPATIBILITY.md).

## 1. Today in Blobbi Pixel (VERIFIED)

| Fact | Where |
|---|---|
| Every guest walks with the same **demo adult** `blobbi-9` (a `demo` source: the string is the seed; no V3 address derives it) | `src/blobbi/source.ts` (`DEMO_BLOBBI_SEED`), `src/playground/main.ts` (`startupBlobbi`) |
| The pixel renderer draws **adults only**: `stateForPose` sets `stage: 'adult'` | `src/blobbi/canonical.ts` |
| The chosen Blobbi is a per-browser record, never part of a save (`blobbi-pixel-lab:selected-blobbi`, version 1, M11C adds optional `name`/`account`) | `src/game/blobbi-selection.ts` |
| Island saves (schema 12) belong to the world (`owner: 'local-world'`) and never name a Blobbi; companion needs, friendship and tasted foods are the island's | `src/game/persistence.ts`, `tests/boundaries.test.ts` |
| A connected player can bring their own **V3 adult** (read-only); nothing is ever published | [M11C](../milestones/M11C.md) |

## 2. The exact constraint: a V3 look is a function of its owner (VERIFIED)

- `seed = hex(SHA-256( u8(len(D)) ‖ D ‖ pubkey(32 bytes) ‖ u32be(len(d)) ‖ utf8(d) ))`, `D = "blobbi:visual-seed:v1"`
  (`blobbi-kit/packages/blobbi-core/src/blobbi-v3-identity.ts:231-285`, pinned by `blobbi-v3-seed.vectors.json`).
- The canonical `d` is `blobbi-<pubkey[0..12]>-<10 random hex>` (`blobbi.ts:473-492`, `generatePetId10` uses
  `crypto.getRandomValues`, `:480-484`): the d itself names the owner.
- A V3 event carries **no** seed or appearance: `BLOBBI_V3_ABSENT_TAG_NAMES` (`seed`, the colour tags, `pattern`,
  `antenna`, `horns`, `ears`, `tail`, `belly`, `freckles`, `size`, `adult_type`...) are "never written, never read,
  dropped by every kit write" (`blobbi-v3-identity.ts:28-37, 101`). `getBlobbiV3Seed` reads only the single `d`
  (`:304-311`).
- Therefore **a Blobbi's V3 appearance is fixed by (owner pubkey, d)**. A random local seed can never be published
  as that appearance; the same Blobbi registered under the player's key looks different; the only freedom is
  re-rolling the 10 random hex of d (a new look each time), which is what nostr-pet's "try another egg" does.
- The renderer will draw stated traits for a host preview (`blobbi-renderer/src/artwork/v3/identity.ts:14-18`), but
  core never reads them from events: a preview drawn that way is not what other apps would show.

## 3. Options to keep a guest Blobbi's look when it is registered

| Option | How | Look kept? | Cost / risk |
|---|---|---|---|
| **A. Owner key reserved at birth** (nostr-pet's guest mode, VERIFIED: `nostr-pet/src/features/guest/guest-store.ts:1-44`, `guest-signer.ts:22-26`) | When the guest's Blobbi is born, generate a keypair locally, derive `d` and the V3 seed from it; the Blobbi is canonical-to-be from day one. Registering = publishing with that key. | **Yes**, exactly | Needs a **secret key stored in the browser** before the player has an account (forbidden in M11C.5; needs approval). The Blobbi is owned by THAT key: a player who later connects a different, existing account cannot move it (ownership is baked into the address); they would keep two identities or adopt the guest key as their account ([account creation](ACCOUNT-CREATION.md)). |
| **B. Provisional local Blobbi, honest re-roll at registration** | The guest Blobbi has a local seed (pixel game only), clearly local. Registering under the player's key shows the canonical result **before** anything is signed: "In other worlds, your Blobbi will look like this." The player may re-roll (new d) or keep the local one unregistered. | **No** (changes look) | No secret before an account. Disappoints players attached to the look; must never be presented as the same appearance. |
| **C. Register at first connection, before attachment** | Encourage connecting early (the M11C.5 invitation does it gently); a Blobbi born after connection is canonical from birth (d and seed from the player's real key). | Yes for Blobbis born after connecting | Guests who never connect keep a local Blobbi (back to B for them). |
| **D. An ecosystem change** | A kit-level "explicit V3 identity" (a stated appearance seed allowed on 31124). | Yes | Changes the canonical model the kit deliberately forbids today; only the kit maintainer can decide it; every app must agree. |

**Recommendation (PROPOSED):** **A for new guests, combined with C**, mirroring nostr-pet so the ecosystem stays
consistent: a guest's Baby Blobbi is born with a reserved owner key (its look is canonical from the first frame); the
first account a guest makes in the game **is** that key ([account creation](ACCOUNT-CREATION.md), with a forced
backup step before registration); a player who connects an existing NIP-07 account first gets their new Blobbi under
their own key (C). For a guest who already has a reserved-key Blobbi and then connects a different existing account,
say plainly: "This Blobbi was born with its own key. Keep it as a second identity, or let it stay on this island
only." Never silently re-roll its look. **B** is the fallback if the owner refuses secret storage before an account.
Requires the owner's approval (secret storage) and a security review.

## 4. Registration flow (PROPOSED; no publication implemented)

`Guest Baby Blobbi → identity (connect or create) → player chooses REGISTER → 31124 published → portable`

1. **Preconditions**: an identity whose public key equals the Blobbi's owner (A) or the connected key (B/C);
   the player asked for it (a button, never automatic); the player's slot limit allows another Blobbi (the kit's
   level unlocks: 1 Blobbi at start, more at levels 5/10/15/20, `blobbi-core/src/progression.ts:98-105`).
2. **Preflight** (as nostr-pet `useAdoptEgg.ts:72-82`): query the owner's 31124 events (6 s). If one with the same
   `d` exists, this is a **re-registration**: stop and adopt the existing state (never overwrite a newer one).
3. **Draft, kept locally before signing**: `petId` and `d` (fixed at birth for A), `created_at`, name, tags from the
   kit's `buildEggTags(pubkey, petId, createdAt, name, { visualGeneration: 'v3' })` (`blobbi.ts:1515-1563`), then
   `stage: 'baby'` and the initial stats. Open decision: publish a Baby with `progression_state: 'none'`, or follow
   the kit's hatch shape (`useBlobbiHatch.ts:78-110`: stats at `STAT_MAX`, `progression_state: 'evolving'` with the
   evolve missions in the content) so other apps continue its growth naturally. Recommended: the hatch shape.
4. **Sign** through the signer (NIP-07 / NIP-46 / the local key), with a timeout, and check `event.pubkey` equals the
   owner (as nostr-pet `usePublishAdapter.ts:43-51`).
5. **Store the SIGNED event locally before publishing** (registration record, §5): every retry republishes the
   **same event** (same id), so publishing is idempotent; a crash after signing never makes a second Blobbi.
6. **Publish** to the Blobbi relays (nostr-pet: relay.ditto.pub, relay.primal.net, relay.nostr.band,
   `src/config/relays.ts:20-24`); success when at least one accepts; then read it back by `#d` to confirm.
7. **Profile** (kind 11125): add the `d` to `has` (`addPetToHas`), set `current_companion` if the player wants; a
   profile failure is tolerated and retried later (nostr-pet does the same, `useAdoptEgg.ts:96-102`).
8. **After**: the selection becomes the `v3-address`; the island and its progress are untouched.

| Concern | Answer |
|---|---|
| Duplicate registration | `d` fixed before signing; preflight by `d`; a page-wide in-flight guard; the stored signed event is reused |
| Conflicts | Another app may have advanced the Blobbi (same d, newer `created_at`): never republish the draft over it; adopt the newer state |
| Offline | Keep the signed event queued (`signed`), publish on the next online moment, show "waiting to reach the Blobbi relays" |
| Partial publication | One relay accepted = registered; republish the same event to the others later; profile update retried separately |
| Recovery | The record survives reloads; states `draft → signed → published → confirmed` (`failed` keeps the signed event) |
| Appearance | A: unchanged by construction. B: shown before signing, the player confirms |

## 5. Future save model (PROPOSED; explicit migrations only)

Keep the rule that **island saves never name a Blobbi**. New, separate per-browser records:

| Record (key) | Holds | Never holds |
|---|---|---|
| island save `blobbi-pixel-lab:save:v1:<world>` (schema 12, unchanged) | the island and its progress | any Blobbi or account |
| `blobbi-pixel-lab:account` (exists) | public key, method, profile name | secrets |
| `blobbi-pixel-lab:guest-blobbi` (new, version 1) | `localId`, birth time, name, stage and local growth, the **owner public key and d** (A) or the local seed (B), `registered: address or null` | the secret key (that lives in the key store of [account creation](ACCOUNT-CREATION.md), separately) |
| `blobbi-pixel-lab:registration` (new) | per `localId`: state, `d`, the signed event JSON, relays that accepted, timestamps | secrets |
| `blobbi-pixel-lab:selected-blobbi` (exists) | which Blobbi walks: demo, guest (`localId`), or a `v3-address` | progress |

Migrations: none for existing islands. Existing players keep the demo Blobbi until they choose "Meet your own Baby
Blobbi" (an explicit, optional step); the demo stays available. Any later change to the island save (for example an
island-to-Blobbi bond) is a numbered schema migration with tests, applied on read, with the M10C backup rule for
unreadable or newer records.

## 6. Risks

- Secret storage in the browser (A): loss when site data is cleared; theft by any script injected into the page;
  Safari may evict script-written storage after 7 days without a visit (see [account creation](ACCOUNT-CREATION.md)).
- Ownership confusion: a reserved-key Blobbi cannot move to another account.
- Look changes (B) feel like losing the Blobbi: never do it without an explicit preview and confirmation.
- Publishing a Baby shape other apps do not expect (progression state, missions): agree with the kit maintainer.

## 7. Open decisions (owner)

1. A (reserved key at birth, like nostr-pet) or B (local Blobbi, re-roll on registration)?
2. Registered Baby shape: hatch shape (`evolving` + missions) or `none`?
3. Which relays the game publishes to (nostr-pet's three?).
4. Whether existing players are offered their own Baby (optional) and when.

## 8. Implementation order (after approval)

1. Pixel baby rendering ([Baby Blobbi](BABY-BLOBBI.md) steps 1-3), with the demo still the default.
2. The guest Blobbi record and birth (local, no key) behind a dev flag; tests for determinism.
3. Account creation with backup ([account creation](ACCOUNT-CREATION.md)); security review.
4. Option A key reservation (if approved), then the registration state machine with a fake relay; only then real
   publishing, behind an explicit button.

## 9. Manual test checklist (future, all NOT TESTED)

GBI-01 a new guest sees their own Baby; GBI-02 reload keeps it; GBI-03 two browsers give two different Babies;
GBI-04 registration preview equals the walking Blobbi (A); GBI-05 offline registration resumes; GBI-06 a duplicate
press makes one event; GBI-07 the Blobbi appears identical in nostr-pet after registration.
