# Cross-game Blobbi: architecture (research and design)

**Status: DESIGNED ONLY.** Nothing cross-game is implemented. No Nostr event is created, and no identity or inventory
contract is changed or extended.

> **Status update (M7).** Within this game, a Blobbi can now travel between local worlds: the teleport controller is
> the handoff (the world switches only while the Blobbi is absent), its identity travels unchanged, and nothing of a
> bag or a world's state is carried (`src/game/visiting.ts`, [World visiting](../specifications/WORLD-VISITING.md)).
> That is the in-game half of the lifecycle in §2; the cross-app token (§2.1) remains DESIGNED ONLY. A Blobbi already exists outside this game (Blobbi Standalone, `@blobbi-kit`), and
items already have a protocol (`nostr-games-inventory`). This document says how this game fits between them without
competing with either.

## 1. Portable identity: reuse, do not redefine

- **The Blobbi is its V3 address:** owner pubkey + `d`. Its seed is `deriveBlobbiV3Seed(pubkey, d)` from
  `@blobbi-kit/core`, gene for gene the same Blobbi as in the Standalone. This repo resolves the address
  (`src/blobbi/source.ts`) and never derives a seed any other way.
- **Appearance is canonical.** The pixel Blobbi is drawn from the kit's genome (M3.4 audit: canonical V3 identity).
  No game may store or publish a different appearance for the same address.
- **What this game adds is local and world-owned.** Care, friendship and tastes belong to the *island's* companion
  record, keyed by world identity, never by Blobbi (save schema 5+). Changing the selected Blobbi never moves or
  overwrites another Blobbi's anything.
- The inventory specs' examples use `31124:<pubkey>:<d>` as a character target. That kind is defined elsewhere (the
  Blobbi ecosystem), not here. This document does not depend on its details.

## 2. The handoff lifecycle

A Blobbi "travels" from one game to another. Presence is local to each app; identity is global.

```
 game A                                  game B
 present ──leaveBlobbi()──► departing ──► absent           (A keeps its world; nothing is deleted)
                                          │  handoff token (signed intent, §2.1)
                                          ▼
                              absent ──enterBlobbi()──► arriving ──► present
```

- The teleport controller (`src/game/teleport.ts`, IMPLEMENTED) is the visible half: departure and arrival are the
  same operations a handoff calls.
- Presence is never saved, so a crash in the middle of a handoff always comes back as "present" in the app the
  player opens. There is no stranded Blobbi.

### 2.1 The handoff token — PROPOSAL H1

- **Contents:** the Blobbi address, the source app, the target app, a nonce, and an expiry. Signed by the owner
  (NIP-07 or NIP-46).
- **Transport:** delivered *locally* (a URL fragment or a `postMessage` between same-origin or trusted apps), not
  published.
- **Optional publication:** if it is ever published, it is a NIP-40-expiring, NIP-44-encrypted message to oneself.
  No new kind.
- **Validation by the target:** signature, address, expiry and nonce unused.

The token carries **no stats and no items**. Each game keeps its own local state for the Blobbi. Items travel only
through the inventory protocol (§4).

### 2.2 States and failures

| Failure | Behaviour |
|---|---|
| Target app never opens | The token expires. In A, the Blobbi is shown "away" until the player enters A again; then it simply arrives. |
| Token rejected (bad signature, expired, reused) | The target shows the Blobbi absent with a reason, and offers "bring it here" (a fresh local arrival, no token needed for one's own Blobbi). |
| Both apps open | Each shows the Blobbi present. Presence is per app, cosmetic, never a lock. There is no "only one place" rule to enforce, so nothing can be duplicated or lost. |
| Offline | Everything is local. Handoff is a nicety, never a requirement to play. |
| Different generator versions | Identity is unaffected; the appearance comes from the kit's genome, not from this game's generator. |

## 3. What may cross, and what may not

| May cross (by reference) | Stays in each game |
|---|---|
| Blobbi V3 address | care, energy, friendship, tastes (per world) |
| Items, via inventory addresses (`31632` / `31633`) | quests, journal, Carrier bond, places |
| Equipped and placed items, via `31634` placements (if adopted) | the island, buildings, farm |

## 4. Inventory interoperability: the existing protocol, not a competing one

This game's local inventory uses namespaced item ids (`blobbi-pixel:<category>:<slug>`) and an inventory per world.
Mapping to `nostr-games-inventory`:

| Local | Protocol (v0.5.0) |
|---|---|
| item id `blobbi-pixel:food:carrot` | item definition `31632:<issuer>:blobbi-pixel:food:carrot` (recommended `d` form `<namespace>:<category>:<slug>`) |
| an inventory per world | `31633:<owner>:<d>`, with `d` an app-defined context, e.g. `game:blobbi-pixel` or `world:blobbi-pixel:<hash>` |
| inventory revision | `revision` tag (advisory, not a lock) |
| equipped tool | `31634` placement, `mode: equip`, slot `hand` |
| spending a portable item | `1416` spend (owner-signed debit), later folded with `1417` |

Rules this game would follow:

- **One replacement writer per context**, as the specs require. This game would write only its own `d` context and
  never another game's inventory.
- Read another game's items and debit them only with spends, never by rewriting their inventory. **Grants and
  transfers are not defined by the specs, so this game defines none.** "Receiving" an item from another game waits
  for the specs' own grant kind.
- Preserve unknown tags on round-trip (`toBuildGameInventoryInput`).
- Item trust (which issuers count) is local policy: by default, this game's own issuer and an explicit allow list.

**Local-first.** Until publishing is approved, the local inventory stays authoritative, and the mapping above is only
an export and import format.

## 5. Security

| Risk | Mitigation |
|---|---|
| Impersonating a Blobbi | The address includes the owner pubkey; actions on it require the owner's signature. Appearance is derived, not claimed. |
| Duplicated items across games | Items move only by spends (debits) against the owner's inventory, settled by event id (the specs' fold rules), and no transfers are invented. Local copies are never published as new balances by a non-writer app. |
| Replayed handoff | Nonce + expiry + signature; local delivery by default. |
| A game corrupting another game's state | Write only your own `d` context; never replace an inventory you are not the writer of. |
| Privacy | Care, bond, journal and world details are never published. Inventories in the specs are public, so publish only what the player chooses. |
| Key handling | Never handle private keys. NIP-07 or NIP-46 only. |

## 6. Path, each step needing approval

1. Export and import of the local inventory in the `31633` shape (files only, no network).
2. Read-only display of a player's existing `31632` and `31633` items from relays (no writes).
3. Handoff tokens delivered locally between this game and the Standalone.
4. Spends (`1416`) for portable items, once the item catalogue's issuer is agreed.

No new Nostr kinds. No change to the Blobbi identity contract. No change to the inventory protocol.
