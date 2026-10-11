# Nostr multiplayer: architecture (research and design)

**Status: DESIGNED ONLY** for anything networked. No event is signed, published or fetched by this repository, and
no Nostr kind is created (enforced by `tests/boundaries.test.ts`). Every protocol choice below is a labelled
**proposal** that needs protocol review and explicit approval before any code.

> **Status update (M7).** A *local* prototype of visiting now exists (**IMPLEMENTED**, single browser, no network):
> `src/game/visiting.ts` separates `WorldRef`, `PlayerId` (a local id), the Blobbi, ownership (an owners index),
> `VisitorPermissions` (read-only by default) and a `VisitTransport` interface whose only implementation
> (`LocalVisitTransport`) reads this browser's saves through a read-only store; `VisitSession` hands over between
> worlds with the teleport. The WORLDS screen (`src/ui/screens/worlds.ts`) is the discovery UI a network transport
> would fill. This is step 1 of §10 in local form. See [World visiting](../specifications/WORLD-VISITING.md).
> Island growth (M7) adds `growth` (stage, version, history) to what a world card would carry (§3).

Sources:

- NIP knowledge as of mid-2026, from the published NIPs repository. Draft or unmerged items are marked
  *(draft, verify)*.
- `~/Developer/nostr-games-inventory` v0.5.0, read only: the Game Item, Inventory, Placement and Spend specs that
  Blobbi games already use.

## 1. Goals and non-goals

**Goals:**

- Visit a friend's island.
- Share an island so others can see it.
- Discover islands.
- Play together gently, in real time, in small groups.
- Keep every player's world, Blobbi and inventory theirs.

**Non-goals (v1):**

- Competitive play, economies or trading. Transfers are not defined by the inventory specs, and inventing them here
  would compete with them.
- Global shared persistent worlds.
- Server authority.
- Anything that can damage someone else's island.

## 2. Identities — reuse, never redefine

| Thing | Identity | Defined by |
|---|---|---|
| Player | Nostr pubkey (NIP-01), signed through NIP-07 (browser) or NIP-46 (remote signer) | NIP-01/07/46 |
| Blobbi | V3 address: owner pubkey + `d` → seed (`deriveBlobbiV3Seed`) | `@blobbi-kit/core`; this repo only resolves it (`src/blobbi/source.ts`) |
| World Carrier | `CarrierRef` `species:seed@generator` (`src/game/archipelago.ts`) | this repo (local data model) |
| Island (world) | world identity string (`worldIdentity`, generation options) + owner pubkey | this repo |
| Items, inventory | `31632:<issuer>:<d>`, `31633:<owner>:<d>` | nostr-games-inventory |

The Blobbi identity is never re-derived or re-encoded here. A multiplayer layer carries the V3 address as given.

## 3. Procedural sharing: send seeds, not worlds

An island is a deterministic function of its inputs. Sharing it means sharing those inputs, plus the player's
changes:

| Part | Size | Notes |
|---|---|---|
| Generator version | short string | `GENERATOR_VERSION` (`m6.0`); a visitor needs the same generator to regenerate pixel-identically |
| World identity | about 120 B | seed, kind, Carrier seed, shell variant, size, scale, palette, density |
| Species | enum | turtle today |
| Growth history | a few numbers | the stage and when it was applied (none applied in M6) |
| Modifications | a few KB | buildings, interiors, plots, felled trees, mined rocks, collected nodes: exactly the local save's world parts (schema 8) minus private state |

**Private by default.** These stay local unless the player chooses otherwise:

- care and needs;
- the Carrier bond;
- the journal;
- inventory contents (those belong to the inventory specs);
- found secrets.

A **world card** would carry the identity, the generator version and the modification set, plus a hash of the
deterministic regenerated base, so a visitor can detect a generator mismatch.

- **Proposal P1 (existing kind).** Publish the world card as NIP-78 application-specific data (kind 30078,
  addressable) with `d = blobbi-pixel:world:<short-hash(identity)>`, and the content as JSON.
  - *Pro:* no new kind; one replaceable record per island.
  - *Con:* NIP-78 data is meant for an app's own settings, and other clients won't understand it, so discovery is
    weak.
- **Proposal P2.** A dedicated addressable kind for "procedural world card". This needs a NIP discussion, so it is
  **not proposed for implementation**; it is listed only to compare.
- **Recommendation:** P1 for private sharing (send the address to friends). Defer public discovery (§4) until the
  community has a convention for game worlds.

## 4. Discovery

| Option | Mechanism | Notes |
|---|---|---|
| D1, friends | follow list (NIP-02) → fetch their world cards (P1) | private-ish, simple |
| D2, curated | a NIP-51 list of island addresses (a "bookmark set") | people share collections |
| D3, public | NIP-89 handler announcements so clients can open `30078` world cards with this app | discovery through the app |
| D4, nearby | `neighbours(home)` from the archipelago model, deterministic: no relay needed for *procedural* neighbours (they are not other players) | already implemented as data |

**Recommendation:** D1 and D4 first. D2 is cheap. D3 only if the world card becomes a widely-used convention.

## 5. Visiting permissions

The default is **read-only visiting**:

- the visitor regenerates the island from the card and walks around with their own Blobbi;
- nothing they do changes the host's island;
- they may leave a gift or a note through a separate, opt-in mechanism (below).

| Level | What a visitor can do | How it is enforced |
|---|---|---|
| look | walk, look, listen to the Carrier | nothing is written; the visitor's client is local |
| greet | leave a visible note or sign | **Proposal:** a NIP-17 private message to the host (gift-wrapped, NIP-59 + NIP-44), or a public NIP-22 comment on the world card; the host chooses to place it |
| play together | real-time presence (§7) | the host's client is authoritative for its island; it ignores edits from others |
| co-build | guests propose placements; the host accepts | proposals as messages; only the host publishes the world card |

- **Allow list.** The host keeps an allow list (NIP-51 people list, or a local list) of who may "play together".
  Everyone else can only look.
- **Moderation.** Muting (NIP-51 mute list) is respected everywhere.

## 6. Shared spaces

- **v1:** a "harbour" scene is just another procedural island with a public seed. Everyone regenerates it locally,
  and only presence is shared. No shared persistence, so nothing to grief.
- **Later:** relay-based groups (NIP-29) for a club's island. The group's admin is the single publisher of its world
  card, matching the inventory specs' "one replacement writer per context" convention.

## 7. Real-time transport

| | WebRTC data channels | Relays (ephemeral events) |
|---|---|---|
| Latency | lowest (P2P) | relay round-trip, 50–300 ms |
| Setup | needs signaling; NAT traversal may need TURN (a server someone runs) | none beyond relays |
| Privacy | exposes IP addresses to peers | relay sees metadata; IPs hidden from peers |
| Fit | movement at 10–20 Hz in small groups | presence, chat, low-rate state (1–2 Hz) |

- **Proposal T1 (recommended for v1).**
  - Relay presence: ephemeral events (kind range 20000–29999, which relays do not store) carry low-rate position,
    animation state and emotes. The specific ephemeral kind must be chosen with protocol review *(no kind is
    claimed here)*.
  - Interpolate on receipt.
  - Use NIP-42 AUTH relays for private groups.
- **Proposal T2 (later).** WebRTC data channels, with signaling exchanged as NIP-17/NIP-59 private messages.
  - There is a draft NIP for WebRTC signaling over Nostr *(draft, verify)*; prefer it over inventing one.
  - Fall back to T1 when P2P fails.
  - Make the IP exposure explicit to players.

**Simulation model.** Each client runs its own deterministic world. Only player intents and positions travel. The
host's client resolves anything that touches its island. The world's fixed-step clock (`SimClock`, dt 1/60) already
makes this tractable.

## 8. Threat model

| Threat | Mitigation |
|---|---|
| Griefing someone's island | Visitors never write the host's state. Only the owner signs the world card (P1 is addressable under the owner's pubkey). |
| Forged world card | Signature check (NIP-01). The base hash detects a generator mismatch. Placements are validated with the same rules as local play (`checkPlacement`). |
| Oversized or malicious content | Size limits; schema validation like `loadSave` (unknown fields ignored, malformed ones dropped); never execute content. |
| Spam presence and harassment | Allow lists, NIP-51 mutes, AUTH relays for private sessions, rate limits per pubkey. |
| IP leak (WebRTC) | Opt-in, relay-only by default, TURN optional. |
| Item duplication or theft | Out of scope: items stay in the inventory specs. A visit never moves items. Gifts, if ever, use whatever transfer kind those specs define. |
| Replay of old cards | Addressable replacement (newest wins, NIP-01 tie-break), plus a revision in content (advisory, as in 31633). |
| Privacy of play habits | World cards are opt-in. Care, bond and journal never leave the device. |

## 9. NIP research summary

| NIP | Use here |
|---|---|
| 01 | events, signatures, kind ranges (regular, replaceable, ephemeral, addressable), tie-break |
| 02 | follow list → friends' islands |
| 07, 46 | signing in the browser or remotely (no keys in the app) |
| 09 | deleting a world card |
| 17, 44, 59 | private notes, invitations, WebRTC signaling |
| 19, 21 | sharing addresses as `naddr` links |
| 22 | public comments on a world card (if the host allows) |
| 29 | relay-based groups for shared club islands |
| 42 | AUTH for private sessions |
| 40 | expiration for invitations |
| 51 | lists: allowed visitors, bookmarked islands, mutes |
| 65 | relay list metadata (where to find someone's world card) |
| 78 | application-specific data (P1 world card) |
| 89 | app handlers (open a world card in this app) |

## 10. Path, each step needing approval

1. **Local "visit" (no network).** Load a world card from a file or link, regenerate, walk. Proves determinism
   across machines.
2. **P1 world cards** with NIP-07 signing, a share link (`naddr`), and read-only visits.
3. **T1 relay presence** in small allow-listed sessions.
4. Only then consider co-building, T2, shared spaces.

No kind numbers are claimed, and no events are published, until each step is reviewed and approved.
