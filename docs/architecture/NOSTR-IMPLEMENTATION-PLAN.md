# Nostr implementation plan

**Status: PLAN (M11A).** Nothing here is implemented or approved. Each milestone is independently testable and
needs the owner's approval before it starts. Design details live in [identity](NOSTR-IDENTITY.md),
[world persistence](NOSTR-WORLD-PERSISTENCE.md) and [inventory interop](NOSTR-INVENTORY-INTEROP.md).

**Order chosen and why.** The audit changes the suggested order: reading a player's existing Blobbi needs only a
signer and *no writes*, so it comes before anything that publishes; island persistence (the riskiest: guest claiming,
conflicts) comes after the plumbing is proven; inventory interop last, because it depends on a partner app.

| Milestone | Publishes? | Depends on |
|---|---|---|
| M11B Signer connection (read-only) | no | — |
| M11C Canonical Blobbi on the island | no | M11B |
| M11D Island persistence and guest claiming | yes (30078) | M11B, schema 13 |
| M11E Farm produce on the island (inventory interop) | yes (1416) | M11B, M11D (credits live in the snapshot) |
| M12 Public alpha hardening | — | all |

Cross-cutting rules: no secret keys entered or generated in the game; no network in the simulation; all Nostr code in
one module (`src/nostr/`), the only place `tests/boundaries.test.ts` allows network and signing (the test is narrowed
deliberately, never removed); the game remains fully playable with no account and offline.

---

## M11B — Signer connection (read-only)

> **Done in M11B (2026-10-13), with one change:** NIP-07 only. NIP-46 was left out because it needs a client
> session key made by the game and request events published to a relay, both outside M11B's rules (KI-64). See
> [M11B](../milestones/M11B.md).


- **Objective:** a player can connect an existing signer and the game knows their pubkey; nothing is published.
- **Scope:** NIP-07 (`window.nostr`) and NIP-46 (`bunker://` paste and `nostrconnect://` QR) via `@nostrify/nostrify`
  `NBrowserSigner` / `NConnectSigner`; a small login record (`blobbi-pixel-lab:account`, pubkey + method + NIP-46
  client keys stored the way NIP-46 requires — *the client's* ephemeral key, never the user's); disconnect;
  Settings UI "Your Blobbi account"; relay pool (`NPool`/`NRelay1`) with the ecosystem defaults
  (`wss://relay.ditto.pub`, `wss://relay.primal.net`) and read timeouts.
- **Modules:** src/nostr/signer.ts (proposed), src/nostr/relays.ts (proposed), src/nostr/account.ts (proposed), src/ui/screens/account.ts (proposed).
- **Reuse:** `@nostrify/nostrify` (same major as the other apps: 0.55.x), nostr-tools (via Nostrify), the M10 phase C
  Settings screen.
- **Protocol decisions:** none (no events written). Dependency approval needed (adds the first runtime network deps).
- **Migration:** none (new local key only).
- **Automated tests:** signer adapters with fakes; boundaries test narrowed to `src/nostr/`; no relay in tests (a fake
  `NRelay`).
- **Manual tests:** connect with a NIP-07 extension; with a NIP-46 signer (bunker URI and QR); reload keeps the
  connection; disconnect keeps all local islands; playing never waits for the signer.
- **Acceptance:** pubkey shown (as a friendly name from kind 0 if present), zero events published (verified by a fake
  relay counting writes), all M10 tests still pass.
- **Risks:** NIP-46 UX on phones; signer popups while playing (request only on explicit actions).
- **Non-goals:** account creation, nsec entry, publishing anything.

## M11C — The player's canonical Blobbi on the island

- **Objective:** a connected player chooses one of *their own* V3 Blobbis to live on the island.
- **Scope:** fetch 31124 (`authors:[pk]`, `#b:["blobbi:ecosystem:v1"]`) and 11125/31125; validate with
  `@blobbi-kit/core` (`isModernBlobbiEvent`, `classifyBlobbiEvent`); **re-check `event.pubkey`**; V3 only
  (`visual_generation` = `v3`), V1/V2 listed as "not here yet"; default to `current_companion`; store as the existing
  `v3-address` source (`src/game/blobbi-selection.ts`). Guests keep the demo Blobbi, named as a visitor.
- **Modules:** src/nostr/blobbis.ts (proposed), chooser screen; `src/blobbi/source.ts` unchanged.
- **Reuse:** kit validators and `deriveBlobbiV3Seed` (already used); kit vectors as test fixtures.
- **Protocol decisions:** none (read-only); confirm with the kit owner that Pixel never writes 31124/11125 in the alpha.
- **Migration:** none (selection format unchanged).
- **Automated tests:** fixtures of V1/V2/V3/legacy/foreign-author events; the chosen V3 Blobbi renders identically to
  `cross-app-v3` fixtures (same seed); a foreign-author event is rejected.
- **Manual tests:** a player with several Blobbis picks one; a V2 Blobbi is listed but not selectable; the island's
  progress is unchanged after switching.
- **Acceptance:** the same Blobbi as in nostr-pet (same seed and genes), no events written.
- **Risks:** players whose only Blobbis are V1/V2 see none usable (product message needed).
- **Non-goals:** adopting, hatching, caring (1124), writing profiles.

## M11D — Island persistence and guest claiming

- **Objective:** a connected player's islands are saved to their account and recovered on another device, without
  ever losing local progress.
- **Scope:** schema 13 (`islandId`, `sync` block); 30078 island events (`d` = `blobbi-pixel/island/<islandId>`) and
  the index (`d` = `blobbi-pixel/islands`), NIP-44 to self (fallback decision below); publish/fetch policy and the
  four claiming scenarios ([world persistence](NOSTR-WORLD-PERSISTENCE.md) §5–6); a backup before any remote state
  replaces local; conflict screen.
- **Modules:** src/nostr/island-sync.ts (proposed) (pure: decide adopt / publish / conflict from local + remote), src/nostr/island-events.ts (proposed) (build / parse / validate), src/ui/screens/claim.ts (proposed).
- **Reuse:** `loadSave`/`saveStatus`/`backupRecord` (validation and safety), `listWorlds`/`activeWorld`.
- **Protocol decisions needed:** kind 30078 vs a dedicated kind (recommend 30078); **encryption**: NIP-44 required, or
  allow public snapshots when the signer cannot encrypt (recommend: require NIP-44; without it, stay local and say
  so); the `d` prefix.
- **Migration:** 12 → 13 adds `islandId` (random, made on load for existing islands) and `sync: null`.
- **Automated tests:** the decision function over every case (A–D, older/newer/both-changed, foreign author, bad
  payload, oversize); round trip local → event → local byte-identical; never deletes a local record.
- **Manual tests:** guest → connect → save; second device recovers; two devices diverge → conflict screen; wrong
  account → nothing moves; offline play then reconnect.
- **Acceptance:** no scenario loses or silently overwrites an island; ≤ 1 event per island per 5 minutes of play.
- **Risks:** signer without NIP-44; relay content limits; clocks (use `revision`, not wall time, to compare).
- **Non-goals:** public world cards, visiting other players, deltas/journals, multiple *active* islands.

## M11E — Farm produce on the island (first inventory interop)

- **Objective:** a player's Nostr Farm harvest can be brought to the island — the first real cross-app item path.
- **Scope:** read `31633:<pk>:farm:main` and 1416/1417 with `@nostr-games/inventory` `resolveGameInventoryState`;
  accept the Farm issuer `f47aaf2e…9fb4` only; "A basket from the Farm" lets the player bring N produce: publish one
  **1416 spend** per item kind (the library's builder), then credit local items once per spend id (recorded in the
  snapshot); map `farm:produce:carrot|pumpkin|strawberry` to Pixel's crops, `parsnip` to a new local food (or not
  offered).
- **Modules:** src/nostr/farm-basket.ts (proposed), a basket screen.
- **Reuse:** the library (same version as island and nostr-pet: ^0.5.0); island/nostr-pet's spend flow as reference.
- **Protocol decisions:** none new (existing kinds); the Farm owner's agreement to Pixel as a consumer.
- **Migration:** snapshot gains `farmSpends` (credited spend ids).
- **Automated tests:** fixtures from the library tests; overdraw refused; a spend credited once even if seen twice;
  untrusted issuer ignored.
- **Manual tests:** harvest in Nostr Farm, open Pixel, bring a carrot, cook it; Farm shows "Used in Blobbi Pixel".
- **Acceptance:** Farm's balance drops by exactly what Pixel credited; no Pixel-issued items.
- **Risks:** relay disagreement on the latest fold; the Farm's uncommitted seed-shop branch changing its inventory.
- **Non-goals:** issuing Pixel items, transfers, trading, coins.

## M12 — Public alpha hardening

Relay health and retry UX, payload size budgets, telemetry-free diagnostics page ("Your account and saves"), privacy
review of every published field, NIP-44 failure paths, a recovery guide, real-device tests (phones, a low-end
laptop), and the manual test plan run by people. Non-goals: payments, marketplace, multiplayer, agents.

## The safest first step

**M11B, read-only signer connection**, with the boundaries test narrowed to `src/nostr/` and a fake relay that counts
writes (must be zero). It proves the plumbing in a canvas app without any risk to saves or other apps' data.
