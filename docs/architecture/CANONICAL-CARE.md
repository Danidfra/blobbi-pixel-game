# Canonical Blobbi care: audit and integration plan (2026-11-09)

How the real Blobbi's care stats (shared by Blobbi Home, Blobbi Island and the other apps) work in the installed
`@blobbi-kit` library, how this game relates to them today, and how Pixel can begin to read them safely. Read-only
findings first (every claim with a file and line in the installed kit or this repo; the sibling repos were read
where they exist on this machine), then the plan. Nothing in Pixel writes canonical care yet; see "Status".

## Status

- Pixel reads the selected Blobbi's canonical care stats and shows them, read-only, in the Blobbi panel (see
  "Read path, implemented"). It never publishes or changes them.
- Canonical care writes from Pixel are designed below ("Write pipeline, proposed") and not implemented; they
  need the kit changes listed there, reviewed separately.

## Summary of findings

1. The installed kit is a real copy (no symlink): `@blobbi-kit/core` 0.11.1 and `@blobbi-kit/renderer` 0.6.0 under
   `node_modules/@blobbi-kit/`; the source repo is `~/Developer/blobbi-kit` (core 0.11.1, react 0.11.1, renderer 0.6.1).
2. Pet state is kind 31124 (addressable, replaceable per `d`); the stats are plain tags `hunger`, `happiness`,
   `health`, `hygiene`, `energy` (1..100), with `last_decay_at` (the decay checkpoint) and `last_interaction`;
   `d` = `blobbi-<12 hex of the owner>-<10 hex pet id>`.
3. The care interaction kind is **1124** in code and in the current docs. **14919** appears only as "legacy /
   draft (old NIP-BB)" in `WORLD-TRAVEL.md` and in Island's event registry: no code emits or reads it.
4. Decay is a pure client-side function (`applyBlobbiDecay`): hour-based rates per stage, truncated deltas, a clamp
   to 1..100; it is persisted only when a client republishes 31124 with `last_decay_at = now`.
5. A 1124 event never changes 31124 by itself. Each client computes the new stats (decay, then the effect) and
   republishes a full 31124. Home does decay + effect + republish per action; Island republishes from its cache
   with no decay and no fresh read; only Ditto runs the kit's `useCanonicalSync` consolidation.
6. Only the owner's key signs. Pixel signs with its IndexedDB key vault (guest identities, nostr-tools
   `finalizeEvent`) or a NIP-07 extension; NIP-46 is not offered.
7. The current companion is the bare `d` in the `current_companion` tag of the owner's kind 11125 profile (31125
   legacy). Pixel reads it (`resolveCurrentBlobbi`) and writes it only through a guarded profile republish.
8. Concurrency: replaceable last-write-wins by `created_at` (lower id on ties). The kit offers `fetchFreshEvent`,
   `writeProfileSafely` (profiles only) and `profileWriteQueue`; Island adds a per-pet Web Lock transaction for some
   writes; Pixel has a one-game-per-browser Web Lock for its local save only.
9. Pixel today never reads or writes 31124 stats: its needs (`src/game/care.ts`) are island-local and saved in
   localStorage; the only 31124 Pixel publishes is the birth/registration event with the stats at their maximum.
10. Main risks: a republish from a stale base (Island item use), timestamp ties and clock skew, duplicate
    application of 1124 across apps (a 30-event, 6-hour window), and three decay/effect regimes (the kit's, Island's
    0..100 with no decay, Pixel's local needs).

## 1. The canonical pet state event (kind 31124)

- `KIND_BLOBBI_STATE = 31124` (`node_modules/@blobbi-kit/core/dist/blobbi.js:18`); `STAT_MIN = 1`, `STAT_MAX = 100`
  (`:22-23`).
- Address `31124:<pubkey>:<d>` (`buildBlobbiAddress`, `dist/blobbi.js:162-163`); `d` = `blobbi-${pubkeyPrefix12}-${petId}`
  (`:156-157`); profile `d` = `blobbonaut-<12 hex>` (`:159-160`).
- Validity needs `d`, `b` (the ecosystem namespace `blobbi:ecosystem:v1`, Pixel's `src/nostr/relays.ts:33`), `stage`
  in egg/baby/adult, `state` in the activity states, and `last_interaction` (`dist/blobbi.js:395-408`).
- Parsed stat and time tags: `last_interaction`, `last_decay_at`, `hunger`, `happiness`, `health`, `hygiene`,
  `energy` (`dist/blobbi.js:495-503`); also `experience`, `care_streak`, `care_streak_last_at`,
  `care_streak_last_day`, `published_at`, `state_started_at` (`:507-518`).
- Egg creation tags (stats 100, `last_interaction` = `last_decay_at` = createdAt): `dist/blobbi.js:558-598`. The
  managed tag set: `:599-675`. The content JSON may carry `evolution` and `social_checkpoint`
  (`dist/blobbi-interaction.d.ts:150-161, 214-224`).
- Timestamps: `created_at` (NIP-01 replaceable ordering), `last_decay_at`, `last_interaction`, optional
  `published_at` (Home preserves it from `prev`: `nostr-pet/src/features/care/usePublishAdapter.ts:26-31`).

## 2. The care interaction event

- `KIND_BLOBBI_INTERACTION = 1124` (`dist/blobbi-interaction.js:3`); the README table (`core/README.md:61`).
- Tags: `a` (the 31124 address), `p` (the owner), `action`, `source`, optional `blobbi` (short id), `item`, `alt`
  (`dist/blobbi-interaction.js:18-39`); empty content (`:36`); a regular (non-replaceable) event.
- Actions: `feed`, `play`, `clean`, `medicate`, `boost` (`:4`); the internal map (`medicine → medicate`,
  `play_music`/`sing → play`; `sleep` emits none) (`:5-13`).
- Fallback stat effects (when the host gives no item resolver): feed hunger +10; play happiness +10, energy −5;
  clean hygiene +15; medicate health +10; boost energy +15 (`dist/blobbi-social-projection.js:3-9`). Item effects
  come from the host's `CareItemEffectResolver` (`dist/blobbi-social-projection.d.ts:43-51`).
- **14919**: "legacy interaction | kit" in `core/WORLD-TRAVEL.md:303`; Island calls it `KIND_DRAFT_INTERACTION`
  from the old NIP-BB draft, "never queried, parsed or published" (`~/Developer/blobbi-island/src/protocol/event-registry.ts:202-212`,
  `src/lib/blobbi-kinds.ts:12-13`). In the kit's source the string occurs only in that doc. The discrepancy is
  documentary: there is no code constant for 14919.
- Pixel builds or publishes no 1124 anywhere (`grep KIND_BLOBBI_INTERACTION|emitInteractionEvent src`: none).

## 3. Decay

- `applyBlobbiDecay(input)` is pure; `elapsedHours = (now − lastDecayAt) / 3600`; a missing `lastDecayAt` means
  `now` (no decay) (`dist/blobbi-decay.js:178-215`).
- Baby per hour: hunger −8, happiness −4.5, hygiene −6, energy −9; health −0.4 base plus −0.5 per stat ≤ 50 and
  −1 per stat ≤ 25; +1.5/h when all four ≥ 76 (`:3-24, 112-144`).
- Adult per hour: hunger −5, happiness −2.5, hygiene −4, energy −5.5; health −0.25 base plus tiered penalties
  (< 60 / < 30, < 40 / < 20); +1/h when all ≥ 80 (`:25-44, 145-177`).
- Sleeping: stat decay × 0.2, health penalties × 0.25, no base health decay, energy +40/h (baby) or +35/h (adult)
  (`:45-48, 124, 129, 157, 162`). Egg: hunger and energy forced to 100, the others unchanged (`:103-111`).
- Deltas are truncated before applying; the clamp is [1, 100] (`:91-101`). The doc header says 0..100
  (`dist/blobbi-decay.d.ts:16`) but the code clamps to 1 (`.d.ts:108`, `.js:92`).
- Where it runs: client-side, at read for display (`useProjectedBlobbiState`, a 60-s tick, "no 31124 mutation":
  `blobbi-react/src/hooks/useProjectedBlobbiState.ts:5-11, 38`) and at write inside each action plan (Home:
  `nostr-pet/src/features/care/care-plan.ts:156-163`; Ditto: `useCanonicalSync.ts:145-151, 184-190`). It is
  persisted by `statsToTagUpdates` writing `last_decay_at = now` (`dist/blobbi.js:748-759`).

## 4. Consolidating interactions into the state

- 1124 events "do NOT directly mutate canonical state" (`dist/blobbi-interaction.d.ts:11-13`); the projection
  module "never mutates kind 31124, never publishes" (`dist/blobbi-social-projection.d.ts:16-17`).
- The client computes and republishes: `consolidateSocialInteractions` returns stats and `lastConsumed`; the caller
  writes `social_checkpoint {processed_until, last_event_id}` into the content with `serializeSocialCheckpoint`
  (`dist/blobbi-social-projection.js:13-33`, `dist/blobbi-interaction.js:104-116`).
- The kit's React `useCanonicalSync`: decay + consolidate on a fresh fetch, publish with `prev`, skip when under
  60 s of decay and nothing consumed (`blobbi-react/src/hooks/useCanonicalSync.ts:62, 145-233`). Used by Ditto
  only (`~/Developer/ditto/src/pages/BlobbiPage.tsx`), not by Home or Island.
- Home (`~/Developer/nostr-pet`): per action, `fetchFreshEvent` → `planCareAction` (decay, its own 1124 applied
  through `consolidateSocialInteractions`, XP, streak, `statsToTagUpdates`) → publish 31124 with `prev` →
  fire-and-forget 1124 (`src/features/care/useCareActions.ts:65-90`, `care-plan.ts:143-183`).
- Island: publishes 1124, then a 31124 built from the cached pet (30-s stale time) with `planCareEffect` (clamp
  0..100, no decay) and `mergePetStateTags`; no fresh read, no `prev` (`~/Developer/blobbi-island/src/inventory/useUseItem.ts:79, 101, 137, 151-169`,
  `inventory/care-effect.ts:42-47, 109-118`, `hooks/useOptimizedStatus.ts:81-94`).
- Pixel: never consolidates; it does not read the stats at all (`OwnedBlobbi` has none: `src/nostr/port.ts:86-108`;
  `readBlobbi`: `src/nostr/blobbis.ts:70-116`).

## 5. Who signs; signing in Pixel

- The kit never signs or chooses relays: `emitInteractionEvent` takes a `publishEvent` callback
  (`dist/blobbi-interaction.js:74-79`); `writeProfileSafely` takes `sign`, `verify`, `stillAccount`
  (`dist/safe-profile-write.d.ts:70-83`).
- The owner key only: 31124 and 11125 are authored by the owner (`authors: [pubkey]` everywhere, e.g.
  `dist/fetchFreshBlobbonautProfile.js:12`, Home `useCareActions.ts:65`); Island's registry says
  `authority: 'player'` for 1124 (`event-registry.ts:224`). No service key anywhere.
- Pixel: `PublicKeySigner {available, getPublicKey}` and `browserExtensionSignEvent` (NIP-07 through Nostrify's
  `NBrowserSigner`); "remote signers (NIP-46) are not offered yet" (`src/nostr/signer.ts:1-43`). Vault signing with
  nostr-tools `finalizeEvent` from the IndexedDB vault (`src/nostr/keystore.ts:25, 161-162, 289-292`).
  `IdentityService.signAsAccount(owner, 'vault' | 'nip07', template)` refuses a signer answering for another key
  (`src/nostr/identity.ts:318-324`); activation re-verifies `pubkey === owner && verifyEvent(e)`
  (`src/nostr/activation.ts:219-228`).
- Publishing: `relayPublisher` (one NRelay1 per relay, closed after; `src/nostr/publisher.ts:124-153`); relays
  `relay.ditto.pub`, `relay.primal.net`, `relay.dreamith.to`; delivered means read back from at least one relay;
  LIVE only with `VITE_BLOBBI_PUBLISH=live`, else an in-browser rehearsal (`src/nostr/relay-config.ts:27-52`).

## 6. The current companion and the canonical identity

- Storage: the `current_companion` tag of kind 11125 (`KIND_BLOBBONAUT_PROFILE`), legacy 31125
  (`dist/blobbi.js:19-21, 534, 676-698`); the value is the bare `d`. Home's per-device pick
  `blobbi:selected:d:<pubkey>` (`dist/blobbi.js:899-901`) is in Home's own origin; Pixel cannot read it
  (`src/nostr/current-blobbi.ts:10-11`).
- Pixel reads: `resolveCurrentBlobbi` queries 11125/31125 and 31124, verifies signatures, prefers 11125 over
  31125, then the newest, then the lower id (`src/nostr/current-blobbi.ts:52-56, 61-106`); "unavailable" when no
  relay answered.
- Pixel writes the companion only through `companionProfileTemplate` (`created_at = max(now, base + 1)`;
  `src/nostr/canonical-events.ts:83-89`) and the share pipeline (`src/nostr/companion-share.ts`), with the
  ordering rules shared with Home (`src/game/companion-order.ts:12-40`).
- Birth: Pixel publishes a Baby 31124 (`buildEggTags` v3 + `updateBlobbiTags {stage: 'baby'}`), stats at their
  maximum, the clock starting at share time, and an 11125 listing it (`src/nostr/canonical-events.ts:40-72`,
  `src/nostr/activation.ts:237-259`).

## 7. How Home and Island read and write; the kit's read helpers

- Home reads with the kit's `useBlobbisCollection` (react-query, 30-s stale time) and writes as in §4; profile
  writes go through `writeProfileSafely` / `profileWriteQueue`.
- Island reads with `useOptimizedStatus` (`kinds: [31124], authors`, 30-s stale time); item use writes as in §4;
  its value-bearing writes (mining energy) use `pet-state-transaction.ts` (a cross-tab Web Lock per owner and pet,
  an authoritative EOSE read, `created_at = max(now, prev + 1)`, a strict publish). Its generic `useNostrPublish`
  treats a 5-s timeout as success (`hooks/useNostrPublish.ts:26-45`).
- Kit read helpers: `fetchFreshEvent(nostr, filter)` ("MUST be used inside every read-modify-write on a replaceable
  event", `dist/fetchFreshEvent.d.ts:7-14, 36`), `fetchFreshBlobbonautProfile`, `readProfileCensus`,
  `BLOBBI_CACHE_KEY = 'blobbi:boot-cache'`. No subscribe helper for 31124 in core (only `NostrQuerier.query`).

## 8. Concurrency protections

- Replaceable semantics: the newest `created_at` wins, the lower id on a tie (Pixel `src/nostr/blobbis.ts:53-58`;
  kit `profile-order.js:9`; README 179-183).
- Fresh read before write: `fetchFreshEvent`, `useFreshBlobbiBeforeAction`; `useCanonicalSync` re-applies on fresh
  data behind `syncInProgressRef`.
- Profiles only: `writeProfileSafely` answers `stale` / `unsafe` / `wrong-account`; `profileWriteQueue` runs one
  write per account per page. There is no equivalent for 31124 in the kit.
- The `max(now, prev + 1)` bump: Pixel profiles, Island's pet transaction. Home's adapter uses `created_at ?? now`
  with no bump (`usePublishAdapter.ts:26`).
- No version or lock field on 31124; `social_checkpoint.last_event_id` is the only dedup marker.
- Pixel cross-tab: the Web Lock `blobbi-pixel:game` (one tab runs the game and its save; `src/game/single-tab.ts`);
  the profile share stores the signed event and resends the same id.

## 9. A shared mutation interface in the kit?

Pure reducers exist (`applyBlobbiDecay`, `consolidateSocialInteractions`, `applySocialInteractions`,
`statsToTagUpdates`, `updateBlobbiTags`, `mergeBlobbiStateTagsForRepublish`) but there is no single
`applyInteraction(state, interaction)` or `publishCare(...)` that performs the whole read-modify-write of 31124;
the only "safe write" helper is for profiles.

## 10. Offline, guest and authenticated sessions in Pixel

- Account states `guest → connecting → connected`; guest means no account pubkey; CONNECT asks a NIP-07 extension
  once and stores a public record (`src/nostr/account.ts`, `account-store.ts`).
- A guest Blobbi's identity is a real keypair in the vault (`reserve({kind: 'guest'})`, `src/nostr/identity.ts:114-127`);
  registration needs consent and a verified backup (`activation.ts:203-204`). A registered guest Blobbi has a 31124
  of its own on the relays; an unregistered one has none.
- Relays are contacted only on CONNECT and profile reads, MY BLOBBIS, entry (`resolveCurrentBlobbi`, 6 s),
  registration, the companion share and world travel; the first screen loads no network library; offline (no
  answer) goes straight in with the device's Blobbi (`src/game/world-entry.ts:25-26`).
- Local caches (`localStorage`, `blobbi-pixel-lab:*`): the island saves (with the local `care` needs), worlds,
  selected Blobbi, guest and local Blobbis, account, activation, companion share, entry choice, world forms,
  visits, settings. Secrets only in the IndexedDB vault.
- Pixel's needs are local by design: 0..100, per simulated second, "not part of the Blobbi's identity"
  (`src/game/care.ts:1-42`); canonical stats are never rescaled (`docs/architecture/BLOBBI-ENERGY.md:23-41`).

## 11. Risks

- Last-write-wins over a stale base: Island item use republishes from a 30-s cache without a fresh read or `prev`,
  so a Home or Ditto write in between is overwritten (decay, XP, checkpoint lost).
- Timestamp ties and skew: Home writes a bare `now`; two writes within a second tie and resolve by id; a slow clock
  loses to an older event.
- Duplicate application of 1124: Home applies its own interaction into 31124 and still emits the 1124; Ditto's
  `useCanonicalSync` re-fetches 1124 (limit 30, 6-h window) and re-applies any not covered by `social_checkpoint`;
  Home writes no checkpoint, so its interactions can be applied twice elsewhere.
- Lost interactions: more than 30 per window, or older than 6 h, never consolidate.
- Decay divergence: the kit clamps 1..100 with decay; Island clamps 0..100 with no decay; Pixel uses local needs;
  a Pixel baby is published at the maximum with the clock restarted at share time.
- Ambiguous publishes: Island reports a 5-s publish timeout as success.
- Stale reads: 30-s caches in Home and Island; Pixel's selection record can disagree with a newer 11125 (handled
  by the choice-order rules).

## Exported kit API relevant to care (`node_modules/@blobbi-kit/core/dist/index.d.ts`)

- `KIND_BLOBBI_STATE`, `KIND_BLOBBONAUT_PROFILE`, `KIND_BLOBBONAUT_PROFILE_LEGACY`, `STAT_MIN`, `STAT_MAX`,
  `DEFAULT_EGG_STATS`.
- `parseBlobbiEvent(event)`, `parseModernBlobbiEvent`, `classifyBlobbiEvent`, `isValidBlobbiEvent`.
- `buildEggTags`, `statsToTagUpdates(stats, now)`, `updateBlobbiTags`, `mergeBlobbiStateTagsForRepublish`,
  `buildBlobbiAddress`, `parseBlobbiAddress`, `getCanonicalBlobbiD`, `generatePetId10`, `getSelectedBlobbiKey`.
- `parseBlobbonautEvent` (`.currentCompanion`), `buildBlobbonautTags`, `updateBlobbonautTags`,
  `mergeBlobbonautTagsForRepublish`, `addPetToHas`.
- `applyBlobbiDecay({stage, state, stats, lastDecayAt?, now?}) → {stats, elapsedSeconds, newDecayTimestamp}`,
  `getStatStatus`, `getStatsNeedingAttention`, `getVisibleStatsWithValues`, `WARNING_THRESHOLDS`,
  `CRITICAL_THRESHOLDS`.
- `KIND_BLOBBI_INTERACTION`, `INTERACTION_ACTIONS`, `INTERNAL_TO_INTERACTION_ACTION`,
  `buildInteractionEventTemplate`, `parseInteractionEvent`, `isValidInteractionEvent`, `sortInteractionEvents`,
  `emitInteractionEvent(publishEvent, params)`, `resolveSocialCheckpoint`, `serializeSocialCheckpoint`.
- `applySocialInteractions`, `consolidateSocialInteractions`.
- `fetchFreshEvent(nostr, filter, {signal?})`, `fetchFreshBlobbonautProfile`, `writeProfileSafely`,
  `readProfileCensus`, `profileWriteQueue`, `profileFilter`, `BLOBBI_PROFILE_REQUIRED_RELAYS`.
- React (not installed in Pixel): `useCanonicalSync`, `useProjectedBlobbiState`, `useBlobbiInteractions`,
  `useFreshBlobbiBeforeAction`, `useBlobbiCareActivity`, `useBlobbisCollection`.

## Read path, implemented (phase 6)

What the Blobbi panel (U) shows under "Shared Blobbi care", for the Blobbi walking here, read only:

- **Who.** The Blobbi's canonical address when it has one: a V3 by address, or a V1/V2 in its world form
  (`sharedAddressOf`, `src/game/shared-care.ts`). A demo or seed-only Blobbi has no shared care: the panel says
  "not a shared Blobbi: nothing to read" and no relay is contacted. A guest Blobbi (a reserved vault identity) is
  read like any other: registered, its state comes back; not registered, the relays do not hold it ("not found on
  the relays"). Nothing is ever invented.
- **What.** `readCanonicalCare(owner, d)` (`src/nostr/canonical-care.ts`) asks every read relay for kind 31124 by
  the owner with that `d` and the ecosystem marker (`queryRelays`: one REQ per relay, opened for it and closed;
  the reader has no way to publish), 6 s with a 1.5-s grace once one relay has answered. Every event is checked:
  well formed, by the owner, its signature verified, modern per the kit (`classifyBlobbiEvent`,
  `parseBlobbiEvent`), the `d` asked for; the newest wins (the lower id on a tie). The five stats are taken as the
  event states them (a missing one stays unknown, shown as "?"); `last_decay_at`, `last_interaction`, the stage
  and the activity state come along.
- **As it stands.** The stats shown are the kit's own projection (`applyBlobbiDecay`) from the event's checkpoint
  to the moment of drawing, exactly as Blobbi Home shows them for display; without a checkpoint nothing decays; a
  clock behind the checkpoint projects nothing. The projection is computed for display only: no event is built.
- **States.** `none` (not a shared Blobbi), `loading` ("reading from the relays…"), `ready` (bars, "read N min
  ago", "(some relays silent)" when not every relay answered, "(asleep)" when the apps have it sleeping),
  `missing` ("not found on the relays"), `unavailable` ("no relay answered"; the last state read stays on show).
- **When.** On opening the panel; kept for two minutes per Blobbi, then read again; switching Blobbi starts
  afresh, and an answer that comes back for the previous Blobbi is dropped (`SharedCareService`). The network
  module is loaded on the first read, never on the first screen.
- **Kept apart.** The island's own needs stay the island's: "On this island" above them, "Shared Blobbi care"
  below the actions, the same five canonical names (hunger, happy, health, hygiene, energy) in EN, PT, ES. Nothing
  local is replaced by a canonical value, and nothing canonical is written.
- Tests: `tests/canonical-care.test.ts` (newest wins, decay projection against the kit, stale and bare events,
  forged and strangers' events, missing, partial, every relay down or hung, a demo Blobbi reads nothing,
  caching and forced re-reads, an outage keeping the last state, switching Blobbi, a thrown reader, and a source
  scan that the modules cannot sign or publish); `tests/readability.test.ts` draws the block in every language at
  every size. Captures: `npx tsx scripts/panel-shots.ts <label>` (out/ui/<label>/).

## Status UI audit (phase 4)

The HUD's status card shows four island meters (fed, energy, happy, clean) as icons with ten segments and a "!"
under 25; the Blobbi panel names them. "Joy" with a heart beside the pink friendship bar read as affection, so the
happiness label is now "Happy" / "Feliz" / "Feliz", the HUD glyph a smile, and the island bars sit under "On this
island". The local happiness IS the island's fun/happiness status; no second stat is warranted: the shared
"Happy" (canonical happiness) is shown separately, read only, and the two are never mixed.

## Write pipeline, proposed (phase 7; not implemented)

**Mappings.** Only actions the protocol already names (`INTERACTION_ACTIONS`): feeding → `feed` (with the food's
`item` tag); petting and play (the music box, a sit-down with a bunny, a song) → `play`; the washing tub → `clean`;
resting → no interaction exists (`sleep` emits none): resting would set the canonical activity `state` to
`sleeping` on lying down and `active` on waking (decay slows, energy regenerates by the kit's own rates), a state
republish the protocol supports; medicine → `medicate` only once Pixel has such an item (it has none: not mapped).
Walking, chopping, mining, tilling, watering, fishing stay local. Effects are the kit's (feed hunger +10; play
happiness +10, energy −5; clean hygiene +15), never Pixel's own deltas; the local needs keep their own economy.
Frequency: at most one canonical interaction per action per Blobbi per ten minutes (clean: thirty), the rest
local only, so an island afternoon does not spam the shared state; the panel says which action "counted".

**Preconditions.** A LIVE publish build; an owner key at hand for the walking Blobbi (the account's NIP-07 signer
for an account Blobbi, the vault for a registered guest Blobbi), `signAsAccount` refusing any other key; the
Blobbi registered (a 31124 exists); online. Otherwise the action stays local and the panel says "not shared".

**Pipeline, per action.**
1. Record a `CareIntent {address, action, item, at, id}` in a durable local queue (localStorage, per owner),
   `id` = hash(address, action, at): the idempotency key. The game goes on; the intent is sent in the background.
2. The sender takes a Web Lock `blobbi-pixel:care:<address>` (one sender per Blobbi across tabs) and reads the
   fresh 31124 with the kit's `fetchFreshEvent` from every required relay (a census, as profiles are read); if not
   every required relay answered, the intent waits (never a republish from a partial read).
3. It builds the 1124 template (`buildInteractionEventTemplate`), signs it (its id is now known, nothing sent
   yet), then plans the state: `applyBlobbiDecay` from the fresh event's checkpoint to now → the interaction's
   effect through `applySocialInteractions` with that one event (so the effect is the kit's) → `statsToTagUpdates`
   (sets `last_decay_at` and `last_interaction` to now) → `mergeBlobbiStateTagsForRepublish(prev.tags, updates)`;
   `created_at = max(now, prev.created_at + 1)`; the content keeps the previous content with
   `social_checkpoint = {processed_until: now, last_event_id: <the 1124's id>}` (`serializeSocialCheckpoint`) so
   a consolidator (Ditto) never applies that 1124 a second time.
4. It signs the 31124 and publishes it to every relay, delivered meaning read back from at least one relay (the
   existing `relayPublisher` rule); then publishes the 1124 (fire-and-forget as the apps do). The 1124 never goes
   out without its 31124: an unpublished 1124 cannot be double-applied, an unpublished 31124 cannot leave the
   checkpoint behind.
5. Reconcile: read back; if a newer 31124 by another app arrived between the fresh read and the publish (a greater
   `created_at`, or the same with a lower id), ours lost and its effect is not in the shared state: the intent is
   retried from step 2 on the newer base (at most three times, then dropped with a notice). The retry is safe: the
   newer base does not contain our effect, and the 1124 was not sent on the lost attempt.
6. Offline and failures: the queue persists; retries with backoff on reconnect; an intent older than six hours is
   dropped with a notice (the kit's consolidation window); the panel shows "sent", "waiting for the relays",
   "not sent (offline), will retry", "dropped".
7. Decay: Pixel applies the kit's decay only inside this republish (as Home does), never to its local needs, and
   never rescales local values into canonical ones. Health is never written directly (no mapping).
8. Verification across devices: after a confirmed publish the panel shows the new event's time; a check opens
   Home on another device and compares; the read path above re-reads on the panel's next opening.

**Kit changes to ask for (separate review).**
- A pure `planCareStateWrite(prev: NostrEvent, interaction: InteractionTemplate, now, resolver?)` returning the
  31124 template (decay, effect, checkpoint, tags, `created_at` bump): today that plan lives in Home
  (`nostr-pet/src/features/care/care-plan.ts`), so Pixel and Island would each write their own.
- A `writeBlobbiStateSafely(deps, build)` like `writeProfileSafely` for 31124 (fresh census read, build, sign,
  publish, read back, outcomes `stale` / `unsafe` / `wrong-account`), and a `blobbiStateWriteQueue` per address.
- `fetchFreshBlobbiState(nostr, address)` beside `fetchFreshBlobbonautProfile`.
- Docs: retire 14919 in `WORLD-TRAVEL.md`; the decay header's "0..100" versus the code's clamp to 1.
- Not Pixel's to change, but blocking consistency: Island's item use republishes from a stale cache without decay
  or a `prev` bump; Home writes no `social_checkpoint`, so its own interactions can be applied twice elsewhere.

**Stop.** No canonical write is implemented; the first one needs the review above and explicit approval.
