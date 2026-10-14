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
