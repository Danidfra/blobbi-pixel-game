# The current Blobbi (kind 11125 `current_companion`)

M11D.8 audit and design. Since the companion sync (§6, 2026-10-15) Blobbi Pixel also WRITES it, for a choice the
player makes here. Sources: `@blobbi-kit/core` 0.9.0 (installed
`dist` and `~/Developer/blobbi-kit/packages/blobbi-core/src`) and Blobbi Standalone (`~/Developer/nostr-pet` at
`773c3eb`). Neither was modified.

## 1. Findings

| Question | Answer, with evidence |
|---|---|
| Is kind 11125 the canonical source of the current Blobbi? | Yes, across apps. The kit's `BlobbonautProfile.currentCompanion` is "Currently selected companion Blobbi d-tag", parsed from the `current_companion` tag (`parseBlobbonautEvent`). Standalone reads it at boot (`useHomeBlobbi.ts:120`) and publishes it when the player switches Blobbi (`useSetCurrentCompanion.ts:32-53`) and when an egg is adopted (`adoption-plan.ts:139-148`). |
| Replaceable, regular, scoped? | Replaceable (kind 10000-19999, NIP-01): one per author, the newest wins. It also carries a `d` tag (`blobbonaut-<pubkey12>`, kit `getCanonicalBlobbonautD`) and the `b` marker `blobbi:ecosystem:v1`. The legacy kind 31125 (addressable) is still read by the kit: any 11125 wins over any 31125, even a newer one (kit README). |
| How is the Blobbi referenced? | A BARE d tag of a kind 31124 (`blobbi-<owner12>-<petId10>`), never a full address. The owner is the profile's author. Standalone always writes a bare d (`useSetCurrentCompanion.ts:41`). |
| Scoped to one application? | No. Global across Blobbi apps: no app tag is read. Writes carry `client: Blobbi`, which nothing reads for selection. |
| Owner pubkey and d tag? | The d tag only; the owner is `event.pubkey`. Standalone checks that the d is in the player's collection (authored 31124s), not against `has`, and not the d's 12-hex prefix. |
| Current vs historical? | Replaceable: the newest 11125 by created_at. The kit's `fetchFreshBlobbonautProfile` has no tie-break; Pixel adds NIP-01's (the lower id). |
| Multiple devices in conflict? | The newest profile wins (last write). Standalone ALSO keeps a per-device pick (`blobbi:selected:d:<pubkey>`, the kit's `getSelectedBlobbiKey`) that beats the profile on that device. It lives in Standalone's own origin storage: other apps cannot read it, so across apps only 11125 is shared. |
| Referenced Blobbi unavailable? | Standalone skips a reference that names no Blobbi in the collection and falls back (only one Blobbi: that one; else the most recently interacted). There is no deletion marker: no NIP-09 handling, no deleted/archived tag (kit and app). An egg can be the current companion. |
| Do apps publish it when changing Blobbi? | Standalone does, immediately (no debounce), after a fresh profile read, only when the value changes and only when a profile exists (`no-profile`: nothing published, only the device pick). Its own `ARCHITECTURE.md:1781-1785` still says "never published": that line is stale. |
| Signature checks | Standalone relies on Nostrify `NRelay1`'s default `verifyEvent` (nostr-tools). Pixel uses the same `NRelay1`, and its resolver checks every event again itself. |

**Conclusion.** No protocol change is needed and none was made. The current Blobbi is read exactly as the kit and
Standalone define it. One gap is documented, not worked around: the per-device pick in Standalone is not shared, so
"current" means "current in the profile" (what Standalone publishes on every switch).

## 2. The resolver (`src/nostr/current-blobbi.ts`, `resolveCurrentBlobbi`)

1. The owner is the CONNECTED identity (never a link, a typed npub or a profile).
2. One read of the profile (`kinds [11125, 31125]`, `authors [owner]`, `#d` = the kit's `getBlobbonautQueryDValues`)
   and one of the Blobbis (`kinds [31124]`, `authors [owner]`, `#b` the marker), in parallel, a few seconds at most.
3. Every returned event: well formed, by the owner, signature verified (`verifyEvent`). Relays are never trusted.
4. The profile: a valid Blobbonaut event (kit), 11125 before 31125, newest, then the lower id.
5. `current_companion` must be a canonical d whose prefix is the owner's (`ownersReference`). Anything else (another
   owner's d, a full address, a legacy name) is refused as `invalid-reference`.
6. The Blobbi: the newest modern 31124 for that d by the owner (`pickBlobbis`, the kit's `classifyBlobbiEvent` and
   `parseBlobbiEvent`, the V3 seed derived and compared). Generation and stage are kept as they are; `availability`
   says whether it can walk (eggs cannot; V1/V2 only in their world form, M11D.2).

Results: `current` (with `partial` when not every relay answered), `missing` (the profile names a Blobbi no relay
returned), `no-selection` (`no-profile`, `no-companion`, `invalid-reference`), `unavailable` (no relay answered for the
profile). Nothing is guessed from the Blobbis alone, and no failure ever creates an identity or a Blobbi.

## 3. Open protocol questions (for the ecosystem, not decided here)

- Should `current_companion` ever name an egg in a world app? Pixel never lets an egg walk; it just does not offer it.
- A deletion convention for 31124 (NIP-09 kind 5, or a tag) does not exist; a deleted Blobbi reads as `missing`.
- Should Standalone's device pick and the profile be reconciled (for example, the device pick written to 11125 when
  it differs)? Today Standalone publishes on every switch, so they agree whenever a profile exists.
- Profile tie-break: the kit has none; Pixel uses NIP-01's lower id. Worth adding to the kit so every app agrees.
- Standalone's stale doc line (`ARCHITECTURE.md:1781-1785`) should be corrected in that repository.

## 4. Ditto (M11D.8.2 audit, read only)

Source: `~/Developer/ditto` at `b2e65945` (2026-10-09), not modified. The owner reported that a Blobbi selected in
Ditto ("Boca rosa") was not recognised by Pixel. Each question of the brief, with evidence:

| Question | Answer, with evidence |
|---|---|
| 1. Does Ditto publish kind 11125? | Yes: `KIND_BLOBBONAUT_PROFILE` is the kit's 11125 (`blobbi.ts:28`). Ditto reads both 11125 and the legacy 31125 (`src/hooks/useBlobbonautProfile.ts:87-91`, the same `#d` values Pixel asks for). |
| 2. Does it write `current_companion`? | Only from the explicit **Set as companion** button: `src/pages/BlobbiPage.tsx` `handleSetAsCompanion` (lines 1424-1489) and `src/components/widgets/BlobbiWidget.tsx` (lines 166-200): a fresh profile read, the old tag removed, `updateBlobbonautTags(tags, { current_companion: companion.d })`, published with `prev`. Pressing the button on the CURRENT companion removes the tag ("Companion unset"). It needs an existing profile (`if (!profile) return`). **Selecting a Blobbi on the page does not publish**: `handleSelectBlobbi` (line 361) only calls `setStoredSelectedD`, the `localStorage` key `blobbi:selected:d:<pubkey>` (the kit's `getSelectedBlobbiKey`, `BlobbiPage.tsx:285-286`), and the page's selection priority is "localStorage selection always wins" (lines 290-328). The widget's companion picker does the same (`onSelectCompanion={setStoredSelectedD}`, line 248). On first load with a profile, Ditto copies the profile's companion INTO its local selection (lines 641-644), never the other way. |
| 3. Is the reference the canonical bare d? | Yes: `companion.d`, the d of a parsed, validated authored 31124 (the collection). Ditto's own profile document (its docs/blobbi folder, kind-31125-blobbonaut-profile) describes the same. |
| 4. The expected author? | The signed-in user (`publishEvent` signs with the user's signer); Pixel refuses any other author. |
| 5. Which relays receive it? | Ditto's write relays: its app defaults `relay.ditto.pub`, `relay.dreamith.to` (read+write), `relay.primal.net` and `relay.damus.io` (write only) (`src/lib/appRelays.ts:30-37`), plus the user's own NIP-65 list when enabled. |
| 6. Can Pixel retrieve it? | Yes: Pixel reads `relay.ditto.pub`, `relay.primal.net`, `relay.dreamith.to` (`src/nostr/relay-config.ts`), three of Ditto's four write relays; one answering relay is enough for the resolver (`partial` is noted). |
| 7. Does Pixel validate and parse it? | Yes: `tests/m11d8-2-ditto.test.ts` builds profiles exactly as Ditto does (the kit's `buildBlobbonautTags` as the hatching ceremony makes them, then `updateBlobbonautTags`) and the resolver returns `current` for a set companion, `no-companion` for a page selection or an unset, `missing` when the Blobbi is not returned, and ignores other authors and forged tags. |
| 8. Can Pixel retrieve the 31124? | Yes, the same relays, the same `#b` marker; Ditto's V3 Blobbis parse through the kit as Standalone's do. A V1/V2 Blobbi without usable colours resolves but cannot walk (`availability`), so it is not offered (M11D.2). |
| 9. Does Pixel restore the extension identity? | It did not VERIFY it (M11D.8 §8): "present" was `window.nostr` existing at that instant. M11D.8.2 waits for a late extension (the signer's 1.5 s) and asks it for its key once per page load (`verifyExtension`); only the remembered key counts as present. |
| 10. Does a local selection override the global current Blobbi? | In Ditto, yes, on Ditto's own device (its page selection beats the profile there, and is not published). In Pixel, no: the profile's companion is read as published, and a different walking Blobbi only leads to "who comes along?" (M11D.8 §4, scenario 6). |

**Finding.** Ditto publishes the canonical current selection correctly, but only through **Set as companion**. A Blobbi
merely selected on Ditto's page (the likely case for "Boca rosa") is not published anywhere, so no other app can see it;
Pixel then reads `no-companion` (or the profile's older companion). This is documented, not worked around: no
replacement protocol, no event from Pixel, kinds 11125 and 31124 unchanged. For the ecosystem (§3): Ditto's page
selection and Standalone's device pick could publish 11125 on change, as Standalone does.

## 5. Precedence between the device's choice and the current Blobbi (M11D.8.3)

Pixel keeps a choice of its own (the walking Blobbi, `blobbi-pixel-lab:selected-blobbi`) stamped with when and by
whom it was made (`selectedAt` ms, `selectedBy` player | remote). On entry, when the current Blobbi differs from the
walking one, the two CHOICES are ordered (`compareSelections`, `src/game/world-entry.ts`): the remote choice's time is
the profile's `created_at`; a clear gap of more than 60 s, both in the past, decides; the newer choice wins (a newer
remote one comes along, stamped with its own time; a newer local one stays). Anything unclear (no stamp, equal or
near-equal, future-dated) keeps "who comes along?". A Blobbi's kind 31124 `created_at` never takes part.

Pixel still publishes nothing: a choice made here is not visible to Ditto or Standalone until an explicit, consented
publication of kind 11125 exists (future work; not in M11D.8.3). Details: docs/milestones/M11D8-3.md §4 to §6.

M11D.8.4 additions: the read keeps the answers of the relays that did answer (one slow relay no longer reads as
offline), starts beside the extension's check, and an unstamped device choice gets a one-time `existedBy` upper bound
so a remote choice made clearly after it can be ordered. Each automatic entry leaves a diagnostic record without
identifiers (`blobbi-pixel-lab:entry-diagnostic`). Details: docs/milestones/M11D8-4.md.

## 6. Companion sync (2026-10-15): the choice goes both ways

The Blobbi the player chooses is their companion in every Blobbi app. No new kind or tag: kind 11125
`current_companion`, the bare d. Blobbi Standalone carries the same rules (its `src/features/companion`).

**Choice order v1** (`src/game/companion-order.ts`; the same test vectors as Standalone's, `tests/companion-order.test.ts`):
same Blobbi: agree. Only one side usable: that one. A choice the network knows of (shared from here, or adopted, with
the profile event's id: `synced` in the selection record) against the current one: NIP-01 order (newer `created_at`,
then the lower id), so a shared choice never blocks a later one. Adopted with a time only (records before the sync):
`created_at` order. Made here and not shared yet: made over the profile now seen or a newer one (`over`: the newest of
the current Blobbi last read and the profile the walking Blobbi's own choice was carried by), it wins; a profile
written after it is never ignored (even one naming the Blobbi the player passed over: it may be a real new choice):
the clock, as M11D.8.3/8.4 (`selectionOrder`: 60 s margin, the `existedBy` bound); anything unclear is put to the
player. Writers add `CHOICE_FRESH_MS`: the share starting within 30 s of the choice is the latest act in real time
and is written without asking; a later attempt is ordered against what it finds.

**Writing** (`src/nostr/companion-share.ts`, live builds only; a rehearsal build shares nothing): a complete read (each
of `PROFILE_REQUIRED_RELAYS`, relay.ditto.pub and relay.primal.net, answered), over the newest valid profile, only
`current_companion` changed (the Blobbi listed in `has` if missing; nothing removed; content kept; `created_at` after
the base's; `preservesProfile` checked before signing); never over a choice made clearly later elsewhere (the order
above); a second complete read before sending; shared when read back as activation's policy says (2 relays,
relay.ditto.pub among them); the signed event stored first (`blobbi-pixel-lab:companion-share`) so a retry resends it;
a stored write superseded by a newer profile is dropped. No profile: nothing made (the choice stays here).

**When**: only the player's acts share (MY BLOBBIS, BRING / CONTINUE WITH on "who comes along?", the answer to the
question), by the connected account whose identity is really here (its key in the vault, or the extension verified),
for a Blobbi of its own collection. Never a reload, an automatic entry or resume, an adopted choice, a visitor or a
Blobbi met here and not shared. Failures are said once (a notice) and retried in the visit (back online, 15/60/180 s)
or by TRY AGAIN in MY BLOBBIS; a signer that said no is not retried by itself.

**Meeting a choice made elsewhere** (`src/game/companion-sync.ts`): the current Blobbi is read every minute while the
game is in front, when the page comes back and when the connection returns; a newer one comes along by teleport, only
in a calm moment (the invitation's calm: no menu, speech, notice, timed action, teleport or cinematic), stamped
`remote` with its profile event (never shared again). Too close to tell: nothing changes by itself; a notice, and MY
BLOBBIS asks (KEEP <here> / BRING <there>).

**Audit of the existing writer.** Registration (`activation.ts`) set `current_companion` and merged over whatever
profile the answering relays returned; it now also needs a complete read before building OVER an existing profile (a
newer one on a silent relay could have lost what it listed) (`tests/m11d6.test.ts`).

**Kit (recommended, not done):** `orderChoices`, the template and `preservesProfile` are pure and the same in both
apps; a `@blobbi-kit/core` release could hold them, and the kit's `fetchFreshBlobbonautProfile` could gain the NIP-01
tie-break and a "complete" flag.

