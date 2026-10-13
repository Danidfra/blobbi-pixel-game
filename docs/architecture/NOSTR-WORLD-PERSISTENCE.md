# Nostr world persistence: the island, its snapshot, sync and claiming

**Status: AUDIT + DESIGN (M11A).** Not implemented. Builds on
[Nostr persistence readiness](NOSTR-PERSISTENCE-READINESS.md) (the record's boundaries, written in M10 phase C) and
does not repeat it. Labels: **VERIFIED**, **PROPOSED**, **UNKNOWN**. NIP facts are from `~/Developer/nips` at
`acf74f8`.

## 1. The island today (VERIFIED)

| Aspect | Today | Source |
|---|---|---|
| Local id | the **world identity string** = generation inputs, e.g. `seed=island-…|kind=turtle|turtle=…|variant=4|704x448|scale=1.6|palette=cozy|density=1|islands=auto|house=none` (~110 chars) | `worldIdentity`, `src/game/persistence.ts` |
| Save key | `blobbi-pixel-lab:save:v1:<identity>` | `saveKey` |
| Seed | random at creation (`newWorldSeeds`: `island-<random>`, `turtle-<random>`), never reused for a saved identity | `src/game/worlds.ts` |
| Carrier species | in the identity (`kind=`) and the record (`species`) | |
| Generator / growth | `generator` (`m6.0`), `growth { stage, version (1–4), history[{stage, worldTime, version}] }` | schema 9; growth v4 = the landing |
| Name | `name` (player's, sanitised) or null (generated from the identity) | schema 10 |
| Active island | `blobbi-pixel-lab:active-world` (falls back to the most recent) | M10 phase C |
| Several islands | every save kept; ISLANDS page lists and opens them | `src/ui/title.ts` |
| Migration | `SAVE_VERSION` 12, every older version migrated; unreadable / newer records never overwritten (backup key) | `loadSave`, `saveStatus` |

**Problem for Nostr:** the identity is *what the island is made from*, not *which island it is*. It is unique in
practice (random seeds), but it is long, leaks nothing private yet says nothing about ownership, and a future
generator change could need different inputs. **Proposal:** add an opaque, stable **`islandId`** (128 random bits,
hex, made once at creation; for existing islands made on first connect) to the record (schema 13), and keep the
generation inputs as data *inside* the island state. The identity string stays the local save key.

## 2. Measured sizes (VERIFIED, synthetic data, 2026-10-13)

| Island | Record JSON | gzip | Largest parts |
|---|---|---|---|
| New Variant S turtle | 1,506 B | 683 B | tally 346, carrier 166, inventory 161 |
| After the scripted story (both chapters, home, farm, cooking) | 9,208 B | 2,794 B | inventory 1,456, interiors 1,102, collectedAt 1,061 |
| Heavy synthetic (stage-4 whale, 300 placed things, 120 felled trees, 400 collected nodes) | 39,399 B | 6,034 B | buildings 22,371, collectedAt 7,141, collected 6,280 |

Limits: NIP-44 plaintext ≤ 65,535 B (`44.md:87`); relays advertise their own limits (`11.md`: `max_message_length`,
`max_content_length`; the spec's example is 16,384 / 8,196 — **relay-specific, UNKNOWN for the Blobbi relays**).
A heavy island fits one NIP-44 payload but may exceed a strict relay's content limit; `collected`/`collectedAt`
(regrowth bookkeeping) are the compressible part.

## 3. Event model: options compared

| Option | Stable id | Many islands | Discovery | Replacement | Cross-device | Size | Relay compat. | Complexity |
|---|---|---|---|---|---|---|---|---|
| **A. One addressable event per island** (`d` = island id) | ✔ `kind:pubkey:d` | ✔ one per island | by `#d` or an index | ✔ newest wins per `d` | ✔ | per island | ✔ addressable (30000–39999) | low |
| B. One replaceable event with the active island | ✘ (no `d`) | ✘ | trivial | ✔ | ✔ | grows with islands | ✔ | lowest, but blocks the future |
| C. Separate identity event + state event | ✔ | ✔ | public card discoverable | state replaced, identity rarely | ✔ | small card + state | ✔ | medium |
| D. Initial definition + delta events (journal) | ✔ | ✔ | — | — (append-only) | needs replay | many small events | spam risk | high |

**Kind.** Verified options: **NIP-78 kind 30078** (draft, addressable, "for apps that do not care about
interoperability", content/tags free: `78.md`) — already used in the ecosystem (Ditto `d=ditto/metadata`, read by
Blobbi Island). A dedicated "procedural world card" kind would need a NIP discussion
([Nostr multiplayer](NOSTR-MULTIPLAYER.md), proposal P2). **No new kind is assigned here.**

**Recommendation (PROPOSED): option A on kind 30078, private, with option C's public card deferred.**
- `["d", "blobbi-pixel/island/<islandId>"]`, plus `["client","blobbi-pixel"]`; content = NIP-44-encrypted (to the
  player's own pubkey) JSON `{ format: 1, islandId, identity, species, generator, growth, name, record: <the schema-12+
  save, minus the fields of §4 that never sync>, revision, worldTime, savedAt }`.
- An **index** event `["d","blobbi-pixel/islands"]` (also 30078, encrypted): `{ format: 1, islands: [{islandId,
  name, species, revision, savedAt}], active: islandId }` — so a device finds the player's islands with one
  `{kinds:[30078], authors:[pk], "#d":["blobbi-pixel/islands"]}` instead of listing all of the player's app data.
- Later (only if visiting needs it): a **public** world card (identity, species, growth, buildings) as a separate
  event — option C — without exposing the private state.
- Rejected: B (blocks multiple islands), D (spam, replay complexity, relay pruning), publishing the raw save (leaks
  private progress and device bookkeeping).

## 4. What syncs (classification)

| Subsystem | Fields | Class | Sync? |
|---|---|---|---|
| Player identity | (pubkey; `local:` id) | canonical external / local | pubkey is the event author; `local:` id never |
| Blobbi identity | selected source | canonical external (31124) | as the address only (`31124:pk:d`) |
| Island identity | `islandId` (new), identity, species, generator, growth, name | world snapshot | ✔ |
| Terrain | — | derived (regenerated from identity + growth) | ✘ never stored |
| Trees, rocks, cleared, collected/collectedAt | resource states | world snapshot | ✔ (largest; compress) |
| Planted trees, plots, crops | | world snapshot | ✔ |
| Buildings, upgrades, looks, interiors, furniture, containers, producers, prepared land (flags) | | world snapshot | ✔ |
| Inventory, equipped | island bag | world snapshot (local items) | ✔ inside the snapshot; never as 31633 (see [inventory interop](NOSTR-INVENTORY-INTEROP.md)) |
| Canoe | `boat` | world snapshot | ✔ (afloat state restored ashore on a new device: safer) |
| Player position | not saved | local only | ✘ |
| Quests, tally, lore, found, places, caught, pinned quest, tutorial, intro | | world snapshot | ✔ |
| Carrier bond, companion care/friendship/tasted | | world snapshot (private) | ✔ encrypted |
| World time | `worldTime` | world snapshot | ✔ (the clock of every timer) |
| Weather, daylight | derived from world time + seed | derived | ✘ |
| Settings, camera, audio, active-world pointer, world index, backups | | local only (device) | ✘ (the index event replaces the pointer across devices) |

Never sync: secret material (there is none), backups of unreadable saves, dev/lab state, `local:` player ids.

## 5. Guest claiming (PROPOSED)

Every island record gains a small **`sync`** block (local only): `{ islandId, owner: pubkey|null, remoteRevision,
remoteEventId, remoteSavedAt, localRevision, conflict?: … }`. `localRevision` increments on every save.

- **A — guest connects, no island on the account**: "**Save this island to your account?** You can keep playing
  here; your island will also be safe if you change devices." → publish island + index; set `owner`.
- **B — account already has an island, device has a guest island**: never merge, never overwrite. "**Your account
  already has an island: _Kelp Harbour_ (Whale, day 31).** This device has _Mossy Cove_ (Turtle, day 4)." Choices:
  *Keep both* (the guest island is added to the account — multiple islands are supported in data; the active one is
  chosen), *Open Kelp Harbour here* (Mossy Cove stays on this device, unsaved to the account), *Not now*.
- **C — wrong identity connected**: claiming binds only after the player confirms the island list of *that* account.
  Disconnecting keeps every local island (with `owner` set) and unpublishes nothing; connecting a different account
  shows "**This island belongs to another account.**" and never re-binds it silently. A bound island can only be
  re-bound by an explicit "Move this island to this account" (later; not in the alpha).
- **D — relay returns older state**: compare `revision` and `worldTime`. Remote older than local → keep local, publish
  local. Remote newer and local unchanged since the last sync → adopt remote (after a local backup). **Both changed**
  → conflict: "**This island changed on two devices.** _This device_: day 12, 18 quests. _Your account_: day 11, 20
  quests." Keep this one / Use the saved one (the other kept as a backup copy, never deleted).

Safe failure: any doubt → do nothing, keep local, say so. A local backup is written before any remote state replaces
local state.

## 6. Sync strategy (PROPOSED; relay facts VERIFIED)

Existing practice: nostr-pet writes to `BASE_RELAYS` = ditto, primal, nostr.band (`src/config/relays.ts:20-24`), no
NIP-65, read timeout 15 s, publish 8 s; Blobbi Island confirms empty reads with a second read
(`readRelayConfirmedOrThrow`) and serialises writes (cross-tab lock, `created_at = max(now, prev+1)`). Inventory
relays: primal + ditto (farm), ditto + dreamith (island official items).

- **Relays**: the ecosystem's (ditto, primal) as defaults; the player may add their own. Write to all, succeed on ≥ 1
  acknowledgement; read from all, newest valid event wins (by `revision`, then `created_at`).
- **When to publish**: on explicit save, on growth / house upgrade / quest chapter, after 5 minutes of play with
  unsynced changes, and best-effort on page hide. Never per action, never per frame. One event per island per
  publish (replaceable: relays keep only the newest).
- **When to fetch**: on connect, on opening an island, on returning to the tab after > 10 minutes.
- **Failure**: keep playing; mark "not yet saved to your account"; retry with backoff; never block play.
- **Simultaneous sessions**: one writer per island per device; a newer remote `revision` from another device during
  play → stop auto-publishing that island and ask (case D).
- **Offline**: the game is local-first; nothing waits for relays.
- **Lost relay data**: the device's local record is the truth; republishing restores the relays. Losing both the
  device and the relays' copy loses the island (say so in the UI).
- **Validation on read**: `event.pubkey === player`, kind 30078, exact `d`, decrypts, `format` known, payload ≤ 64 KB,
  the embedded record passes `loadSave` (the same validation as local saves). Anything else is ignored and reported.

## 7. Snapshot strategy for the first alpha

**Full snapshot of the island record (A/B hybrid), not deltas.** It is deterministic to rebuild (the generator
regenerates terrain from identity + growth; the record holds only what the player changed), small (1.5–40 KB),
reuses the tested migrations, and is debuggable. Deltas or a journal are deferred until a measured need (they add
replay, ordering and relay-pruning problems). If a payload would exceed a safe size (start at 48 KB), compact
`collected`/`collectedAt` (store only nodes still regrowing) before publishing — measure first.
