# Guest identity: audit and implementation plan (M11D.2, DESIGN ONLY)

**Status: AUDIT AND DESIGN (M11D.2); IMPLEMENTED in [M11D.4](../milestones/M11D4.md)** (live publishing off). Nothing here is implemented: no keypair is generated, no secret stored, no account
created, no event signed or published. Facts are **VERIFIED** (read in source, path:line given) or **PROPOSED**.
Sources read 2026-10-13: this repository (`develop` during M11D.2), `nostr-pet` (`feat/blobbi-v3`, the Blobbi
Standalone, read only), `blobbi-kit/packages` (read only). It extends [guest Blobbi identity](GUEST-BLOBBI-IDENTITY.md)
(M11C.5 options) and [account creation](ACCOUNT-CREATION.md).

## 1. The approved direction (from the Blobbi Standalone project)

1. A V3 look stays derived from **owner pubkey + d**. No explicit-seed protocol change.
2. A guest Blobbi gets a **locally generated Nostr identity at birth**; its canonical look is derived from that
   reserved identity from the first frame.
3. **Nothing is signed or published at birth.**
4. The player may later **activate** that identity and **register** the Blobbi.
5. The guest copy is removed **only after a confirmed, recoverable migration**.
6. Ownership transfer (moving the Blobbi to a different existing account) is **out of scope**.

This is option A (+C) of [guest Blobbi identity](GUEST-BLOBBI-IDENTITY.md) §3.

## 2. What exists today

### In Blobbi Pixel (VERIFIED)

| Fact | Where |
|---|---|
| Every guest walks with the demo adult `blobbi-9` (a `demo` source, not a canonical identity); no guest Blobbi is ever created or stored | `src/blobbi/source.ts` (`DEMO_BLOBBI_SEED`), `src/playground/main.ts` (`startupBlobbi`) |
| The chosen Blobbi is one per-browser record (`blobbi-pixel-lab:selected-blobbi`, version 1: a demo, V3 seed, V3 address or, since M11D.2, world-form source, plus `name`, `account`, `stage` beside an account) | `src/game/blobbi-selection.ts` |
| Island saves (schema 12) belong to the world (`owner: 'local-world'`), never name a Blobbi; companion needs, friendship and tastes are the island's | `src/game/persistence.ts`, `tests/boundaries.test.ts` |
| A local player id `local:<random>` and per-world first-player owners exist for visiting | `src/game/visiting.ts` (`PLAYER_KEY`, `OWNERS_KEY`) |
| Accounts are read-only NIP-07 (public key and profile name only, `blobbi-pixel-lab:account`); a boundary test forbids signing, publishing and secret handling anywhere | `src/nostr/*`, `tests/boundaries.test.ts` |
| Other per-browser keys: settings, audio, camera, worlds, active world, backups, account invite, world forms | [save and persistence](SAVE-AND-PERSISTENCE.md) §5 |

### In the Standalone (nostr-pet, VERIFIED; paths under `src/`)

| Step | How |
|---|---|
| Key | `reserveGuestIdentity()` → `createNewAccount()`: nostr-tools `generateSecretKey`, `getPublicKey`, `nip19.nsecEncode`, buffer zeroed (`features/guest/guest-signer.ts:24-27`, `features/onboarding/new-account.ts:26-32`) |
| When | at the first "Meet your Blobbi!" press, before the egg (`features/onboarding/OnboardingFlow.tsx:47-49`, `features/guest/useGuest.ts:48-59`); a failure falls back to the normal account screen |
| Blobbi | `petId = generatePetId10()`, `d = getCanonicalBlobbiD(pubkey, petId)`, `seed = deriveBlobbiV3Seed(pubkey, d)`, `buildEggTags(..., { visualGeneration: 'v3' })` (`features/adoption/adoption-plan.ts:69, 102-119`) |
| Storage | localStorage `blobbi:guest:v1`: `{ v: 1, createdAt, identity: { nsec, pubkey }, blobbiD, events, care, invite, migration, conflicts }` (`features/guest/guest-store.ts:42, 76-87`); **the nsec in plain bech32, unencrypted**; unreadable documents quarantined (`:unreadable[:ts]`), never deleted; no `navigator.storage.persist()`, no IndexedDB |
| No signing | `localRecordSigner` writes `sig: ''`; the guest pool refuses a signed guest event and never lets an unsigned one leave the device (`features/guest/guest-signer.ts:36-47`, `features/guest/guest-pool.ts:52-97`) |
| Activation | "Save my Blobbi" (`features/guest/SaveCeremony.tsx:55-67`): intro, **key backup** (copy, download the bare nsec as a text file, or "written", plus a required acknowledgement; `KeyScene.tsx:113-199`), the reserved key becomes the login (`nostr:login`, plain nsec), optional profile (kind 0), then publish **31124 then 11125** with a preflight per event (found = not republished; `features/guest/guest-migration.ts:89-144`), read back to verify, and the guest document cleared only after the done screen or at the next start (`useFinishSave.ts:27-37`); relays: relay.ditto.pub, relay.primal.net, relay.nostr.band |
| Failures | stops at the first failing step with "Try again" (document kept); a closed tab resumes at the stored stage; duplicates prevented by the preflight, replaceable kinds and in-flight guards; **storage cleared before a backup: no recovery** |
| Another account | `dormant` mode: the guest document is kept, the player told once per account, "Keep it here" or "Remove" (two confirmations); never merged (`GuestConflictSheet.tsx`) |
| Docs and tests | `ARCHITECTURE.md:379-431` (Milestone 14), `LAUNCH_TEST_PLAN.md:74-115`; tests `features/guest/*.test.ts`, `__tests__/m14-play-first.test.tsx` |

### Kit helpers (VERIFIED, `blobbi-kit/packages/blobbi-core/src/`)

`generatePetId10()` (`crypto.getRandomValues`, 5 bytes → 10 hex, `blobbi.ts:480-484`); `getCanonicalBlobbiD(pubkey,
petId)` = `blobbi-<pubkey[0..12]>-<petId>` (`:490-492`); `isCanonicalBlobbiD` (`:658-660`); `buildEggTags(pubkey, petId,
createdAt, name, { visualGeneration })` (`:1507-1555`, V3 omits seed and trait tags; the default generation is V2, so
`'v3'` must be stated); `deriveBlobbiV3Seed(pubkey, d)` (`blobbi-v3-identity.ts:283-285`); the hatch republish
(`blobbi-react/src/hooks/useBlobbiHatch.ts:60-116`: same d and generation, stage baby, stats at max, `evolving` with
missions). No guest helper exists in the kit; Blobbi Pixel needs none beyond these.

## 3. Key storage options (for the next milestone)

| Option | Protects against | Does not protect against | Verdict |
|---|---|---|---|
| Plain nsec in localStorage (the Standalone today) | nothing beyond the origin boundary | any script running on the page (an XSS, a compromised dependency), anyone with the device, clearing site data (loss), Safari's 7-day eviction of script-written storage | **only** as the Standalone's compatible baseline, never presented as safe or as a backup |
| **Non-extractable WebCrypto key wrapping the nsec, in IndexedDB** (an AES-GCM key generated with `extractable: false`; the nsec stored encrypted) | casual reading of storage, other origins, storage dumps and backups of the profile folder | a script running on the page can still ask the browser to decrypt (same origin); loss on clearing | **recommended default**: a real improvement for the same convenience, no password |
| NIP-49 `ncryptsec` with a player password | storage theft, the downloaded backup file | a forgotten password (unrecoverable), page scripts while unlocked | **recommended for the backup file**, optional for storage |
| Passkey (WebAuthn PRF) wrapping | as NIP-49 without a password to forget | support varies by browser | later |
| `navigator.storage.persist()` | eviction under storage pressure (Chromium, Firefox) | Safari's script-storage eviction, the player clearing data | ask once, never rely on it |

Required alongside any option: a strict Content Security Policy before secrets are stored (no inline or third-party
script), the boundary test widened to exactly one key-store module (a new keystore.ts module under src/nostr, proposed) and nothing else, no
secret ever in logs, screenshots, URLs, `postMessage` or error reports, and a security review.

## 4. Backup and recovery (PROPOSED)

- **Before activation is possible, a backup is required** (the Standalone's rule): an encrypted NIP-49 backup file
  (preferred, password chosen by the player) or the bare nsec copied/written with a required acknowledgement, in plain
  words: "This key is your Blobbi's home. Without it, nobody can bring your Blobbi back."
- A **reminder** (never during play, never nagging) after a few days of play for guests who have no backup yet, in the
  M11C.5 invitation's style and frequency rules.
- **Recovery**: "I have a backup" on the ACCOUNT page reads an ncryptsec (password) or nsec file, checks that its
  public key owns the stored guest Blobbi, and restores the reserved identity on a new device (the Blobbi's `d` and look
  come back with it, since the look is derived from the key).
- **Honesty**: without a backup, clearing the browser loses the guest Blobbi for good; the game says so before the
  player can lose it, never after.

## 5. Migration (activation and registration) failure scenarios (PROPOSED handling)

| Scenario | Handling |
|---|---|
| Storage cleared before any backup | unrecoverable (said in advance, §4); the island is unaffected (saves never name a Blobbi) |
| Signer/key store unavailable at activation | nothing happens; "Try again"; the guest record kept |
| Offline or relay refuses | stop at the first failing step; the guest record and the stage kept; retry re-runs the preflight |
| Partial publish (31124 landed, 11125 not) | each step's "landed" recorded; retry publishes only what is missing; one relay accepting is enough to continue, the others filled in later |
| Tab closed mid-activation | the stage persisted (`key → profile → publishing → verifying → done`); the next start resumes where it stopped |
| Duplicate press or two tabs | an in-flight guard, a preflight by `#d` before every publish, replaceable kinds; the signed event stored before publishing and republished unchanged |
| The same Blobbi already advanced elsewhere (newer created_at for the same d) | never overwrite: adopt the newer state |
| The player is connected with a different account | `dormant`: the guest Blobbi stays a local guest, said once; no merge, no transfer (out of scope) |
| Verification fails (relays do not return it) | stay in `verifying`; the guest copy kept; check again on the next start |
| Guest copy removal | only after verification **and** a confirmed backup; never automatic on a timer |

## 6. Save compatibility and island ownership (PROPOSED)

- Island saves stay schema 12 and never name a Blobbi or a key. A guest Blobbi is a new, separate per-browser record;
  nothing in an island refers to it.
- New records: `blobbi-pixel-lab:guest-blobbi` (version 1: `{ createdAt, pubkey, petId, d, name, stage, migration,
  conflicts }`, public data only) and the key store (encrypted, §3, its own module and key). The selection record gains
  no field: the guest Blobbi is a `v3-address` source whose pubkey is the reserved one, plus a `guest: true` marker so
  it walks without a connected account.
- Existing players keep the demo Blobbi until they explicitly choose "Meet your own Blobbi" (never automatic, never
  replacing a chosen canonical Blobbi). New islands are unaffected either way.
- The `local:<random>` player id and island owners stay as they are; a guest identity is not an island owner.
- Standalone interoperability: Blobbi Pixel does not read `blobbi:guest:v1` (another origin anyway); a player who has
  a Standalone guest can activate it there and then connect in Pixel.

## 7. Security concerns

- A reserved key is a real Nostr account key: whoever reads it owns the Blobbi everywhere.
- Same-origin scripts can use any key the page can use (WebCrypto wrapping does not stop that), hence the CSP, the
  dependency discipline and the single key-store module.
- Plain-text backup files and clipboard copies leak easily: prefer NIP-49 files; clear the clipboard reminder.
- Safari evicts script-written storage after 7 days without a visit (unless installed): the backup is the only real
  safety; the UI must not imply otherwise.
- No telemetry, logging or error report may include the record; tests must assert it.

## 8. Implementation plan for the next milestone (PROPOSED, needs approval)

**M11E (proposed name): the guest's own Baby, reserved identity, no publishing.**

1. A key store (proposed keystore.ts under src/nostr): generate (nostr-tools `generateSecretKey`), wrap with a non-extractable WebCrypto key in
   IndexedDB, unwrap only for an explicit export or (later) signing; zero buffers; never expose the secret to the rest
   of the game (it returns the public key only). Boundary test rewritten to allow exactly this module.
2. A guest Blobbi module (proposed guest-blobbi.ts under src/game): the public guest record (§6), born with `generatePetId10`, `getCanonicalBlobbiD`,
   `deriveBlobbiV3Seed`; tests with fixed vectors (an injected key) that the look equals the canonical V3 look of
   (pubkey, d).
3. "Meet your own Blobbi" (title/new island and SETTINGS for existing players): reserve the key, hatch a Baby locally
   (no event; stats local), the swap animation brings it; the demo stays selectable.
4. Backup UI: NIP-49 file (password) and copy/written with acknowledgement; reminders; "I have a backup" restore.
5. Tests: no event signed or published, the secret never in localStorage plain text, never in logs; eviction and
   damaged-record paths; the look equals nostr-pet's for the same (pubkey, d).
6. Only after that (a later milestone, explicitly approved): activation and registration (31124 then 11125, preflight,
   stored signed events, verification, guest copy removal after a confirmed backup), the M11C.5 registration state
   machine, a fake relay first, then real relays behind an explicit button.

Decisions for the owner: (a) WebCrypto-wrapped storage vs the Standalone's plain nsec; (b) NIP-49 password backup
required or optional; (c) whether existing players are offered their own Baby; (d) relays for later publishing.
