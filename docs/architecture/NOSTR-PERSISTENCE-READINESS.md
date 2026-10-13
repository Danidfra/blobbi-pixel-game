# Nostr persistence readiness: state boundaries and open decisions

**Status: ASSESSMENT ONLY.** Nothing in this repository signs, publishes or fetches a Nostr event, defines a Nostr
kind, holds a key, or needs a relay or a server (`tests/boundaries.test.ts` enforces it). This page records, as of
M10 phase C, what the local save already holds, where its boundaries are, what is missing before an island could be
synchronised across devices, and the decisions that are still open. Protocol ideas live, clearly labelled as
proposals, in [Nostr multiplayer](NOSTR-MULTIPLAYER.md); none of them is established here.

The next milestone is a dedicated audit of the existing Blobbi/Nostr ecosystem; this page is its starting point.

## 1. What a player owns today (local only)

- **One active island per player** in the product (M10 phase C), but not in the data: every island has its own
  identity and save, a browser may hold several (older versions made several), the title's ISLANDS page lists them
  all, and `blobbi-pixel-lab:active-world` only remembers which one CONTINUE plays (`src/game/worlds.ts`).
- **The island record** (`src/game/persistence.ts`, schema 12): one JSON value per island under
  `blobbi-pixel-lab:save:v1:<identity>`, owned by `local-world` (never keyed by a Blobbi).
- **The Blobbi**: never saved. Its identity is a V3 address or seed resolved by `src/blobbi/source.ts`
  ([Blobbi identity](BLOBBI-IDENTITY.md)); the island keeps only the companion state a visiting Blobbi has there.

## 2. The record, by boundary

| Boundary | Fields (schema 12) | Notes for synchronisation |
|---|---|---|
| **Identity and generation** | `world` (the identity string), `species`, `generator`, `growth` (stage, version, per-stage history) | The identity is the generation input (seed, kind, Carrier seed, shell variant, frame, scale, palette, density, `house=none`); with the generator version it regenerates the base world exactly. Unique in practice (new seeds are random and never reuse a saved identity) but not opaque and not owner-bound. |
| **World modifications** (deterministic replay over the regenerated base) | `buildings` (island frame), `interiors`, `plots`, `trees`, `rocks`, `cleared`, `collected` + `collectedAt`, `planted`, `boat`, `containers`, `producers` | All in island-frame coordinates or by stable object index / node id, so growth never invalidates them. Timers are world time (simulated seconds that pass only while playing). |
| **Progress** | `objectives` (completed with world time, requests, lore), `tally`, `found`, `places`, `caught`, `carrier` (bond, observations), `tutorial`, `intro`, `pinnedQuest` | Lifetime counts and sets: merge-friendly (a union / a max), except the request in progress. |
| **Companion (Blobbi on this island)** | `care`, `companion` (friendship, foods tried) | Belongs to the island, not to the Blobbi's identity (M5 decision); would stay private. |
| **Inventory** | `inventory` (an `InventorySnapshot`, shape mirrored from `@nostr-games/inventory`), `equipped` | Today all items are the island's own. A future Nostr-issued item would be a different kind of entry; see §4. |
| **Presentation / device** | not in the record: camera, settings, the active-world pointer, the world index | Device-local by design. |
| **Name** | `name` | The player's own name for the island (sanitised); null means the generated one. |

Sizes measured in M10 phase C: a new island's record is about 1.5 KB; after the whole scripted story (both chapters,
a furnished home, farming, cooking) about 9 KB, the largest parts being the inventory, interiors, collection times,
quests and buildings. The terrain itself is never stored (it is regenerated).

## 3. What already helps

1. **Stable island identity**: the identity string and the save key never change once made; growth, upgrades and
   migrations keep it.
2. **World-generation metadata**: identity + `generator` + `growth.version`/history regenerate the world exactly; an
   unknown growth version is refused rather than regrown differently (`growthError`).
3. **Compact snapshots**: the record is a few KB and holds only what the player changed.
4. **Versioned serialization**: `SAVE_VERSION` (12) with a migration for every older schema (1–11), tested.
5. **Safe failure (M10 phase C)**: a record from a newer version, or one that cannot be read, is never overwritten — it
   is copied aside (`blobbi-pixel-lab:backup:v1:<identity>`) and the world plays without saving, saying why; a failed
   write never stops play and is retried.
6. **Owner separation**: the record states its owner (`local-world`); visitors read through a read-only store
   (`src/game/visiting.ts`) and can never write.

## 4. Gaps (not implemented, on purpose)

| Gap | Why it matters for sync | Smallest step when it is needed |
|---|---|---|
| **No change tracking** | Sync needs to know what changed since a known version, or to compare snapshots. Today a save is a whole snapshot. | A monotonically increasing revision (or a content hash) on the record, bumped on every save. Not added now: nothing reads it yet. |
| **Identity is not owner-bound** | Two devices of one player must agree which island is "the" island; two players must never collide. | Bind the identity (or a short hash of it) to the owner's pubkey when the owner exists. |
| **Last-writer-wins only** | Offline play on two devices would diverge. | Field-wise merge rules (sets union, counts max, buildings by id) — the data is mostly merge-friendly (§2). |
| **Inventory is local** | Interoperable items would be issued and owned on Nostr (`31632`/`31633` in the inventory specs), not by the island. | Keep island-local items and issued items apart: the record would reference issued items, never copy them. |
| **Timers in world time** | World time passes only while playing on one device; another device's clock is unrelated. | Sync world time with the record (it is already in it); never use wall-clock time for regrowth. |

## 5. Open decisions (need the ecosystem audit first)

1. Is an island a separate addressable record per island, or part of a player's game state? (Several islands per
   player must stay possible.)
2. Which parts are public (a visitor needs the identity, generator, growth and modifications) and which stay private
   (companion, inventory, progress)? Today the default is private.
3. Who may write an island — only its owner's signing key? How are visitors' read-only views served?
4. How do interoperable items (issued by others) enter an island's bag without the island owning them?
5. Conflict policy for offline edits on two devices.
6. Generator compatibility across game versions: a visitor with an older generator must refuse, not mis-render.
7. Where the active-island choice lives (device, or the player's account).

## 6. Rules that stay

- Game-first: no relay, key, npub or event kind is ever shown to a player who has not asked.
- Playable offline, always; the local record stays the source of truth on the device.
- Never invent a Nostr kind or protocol here; reuse what the ecosystem defines, after review.
