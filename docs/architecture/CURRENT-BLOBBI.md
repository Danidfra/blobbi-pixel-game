# The current Blobbi (kind 11125 `current_companion`)

M11D.8 audit and design. Read only: Blobbi Pixel never writes this. Sources: `@blobbi-kit/core` 0.9.0 (installed
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
