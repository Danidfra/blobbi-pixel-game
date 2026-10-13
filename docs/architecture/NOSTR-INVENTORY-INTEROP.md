# Nostr inventory interoperability

**Status: AUDIT + DESIGN (M11A).** Not implemented. Labels: **VERIFIED**, **PROPOSED**, **UNKNOWN**. Repositories
(2026-10-13): `nostr-games-inventory` `main` `f1b39e7`, `nostr-farm` `seed-shop-integration` `8dfeab9` (with
uncommitted seed-shop work), `blobbi-island` `production` `1a6c3b6`, `nostr-pet` `feat/blobbi-v3` `b7916dc`.

## 1. The shared protocol (VERIFIED)

`@nostr-games/inventory` 0.5.0 (published; git tags stop at 0.4.0; CHANGELOG top still "Unreleased"). Specs in
`nostr-games-inventory/docs/`, all **draft, "NIP-XX"** (not in the official NIP registry). Constants in
`src/common/constants.ts:20-24`. The library is pure: it never signs, publishes or fetches.

| Kind | What | Signed by | Key rules |
|---|---|---|---|
| **31632** item definition (addressable) | `31632:<issuer>:<d>`, `d` like `<namespace>:<category>:<slug>` | the **issuer** | required `d`, `name`, `type`; content `{description, effects, metadata, visual}`; trust = which issuer pubkeys a game accepts |
| **31633** inventory (addressable) | `31633:<owner>:<d>`, `d` = app context (one owner, many) | the **owner** | items `["a","31632:<issuer>:<d>","<relay>","<qty>"]`; optional `grant`/`fold` e-tags, advisory `revision`; newest wins; preserve unknown tags; **public**; proves nothing about provenance |
| **31634** placement (addressable) | equipment/placement on a target | author | self-declared; does not consume |
| **1416** spend (regular) | debit one item from one inventory | the inventory **owner** | one inventory `a`, one item `a`, one `quantity`; ordered `(created_at, id)`; overdraw rejected whole |
| **1417** fold (regular) | folds applied spends into a new snapshot | owner | chain of `previous`; effective balance = snapshot − pending spends |

**Not defined** (VERIFIED, spend spec lines 65, 649, 802; inventory spec 422): **grants, transfers, reservations,
conversions, crafting, batch spends**. There is no protocol way to give an item to another player or to prove an item
was earned.

## 2. Who uses it (VERIFIED)

| App | Writes | Reads / consumes | Issuer(s) |
|---|---|---|---|
| Nostr Farm | its own 31633 `d="farm:main"` (credits with `["e",harvest,"","farm-harvest"]`), 1417 folds; 31415–31417 farm state | its four produce items only | Farm issuer `f47aaf2e…9fb4` (`src/inventory/constants.ts:28-29`): `farm:produce:{carrot,parsnip,pumpkin,strawberry}` |
| Blobbi Island | 31633 `d="blobbi:island"` (coins, arcade tickets, player-signed), 1416 spends, 31634 equipment | its official items + **Farm produce** as a partner issuer (`trusted-issuers.ts`, `external-inventory-state.ts:108`, `external-spend.ts:88`) | official `9efb8d30…63a9` (`constants.ts:22-23`) |
| nostr-pet | 1416 spends (+ 31124 republish with `blobbi_op`, + 1124 receipt) | **Farm produce** (`features/inventory/issuers.ts:35`, `sources.ts:21` `farm:main` → "Nostr Farm") | — |
| Blobbi Pixel | nothing | nothing; `src/game/inventory.ts` only *mirrors* the 31633 shape in comments | — |

So the **one verified cross-app path** is: Farm issues produce → the farm player's `farm:main` inventory → Blobbi
Island and nostr-pet read it and spend it (1416). Live relay interop (as opposed to code and tests) is **UNKNOWN**.
Nostr Farm's seeds are **not** Nostr items (nostr-farm's docs/seeds.md, uncommitted: "Seeds are not visible on Nostr").

## 3. Blobbi Pixel items (134; VERIFIED counts)

| Category | Count | Examples | Class |
|---|---|---|---|
| resource | 6 | stick, stone, seed, fibre, herb, shell | **A** local gameplay resource |
| material | 7 | wood, wheat, flowers, cloth, copper ore | **A** |
| seed | 10 | carrot, tomato, sunflower… | **A** (and Farm's seeds are not Nostr items either) |
| tool | 9 | axes, pickaxes, hoes, cans, rod | **D** not suitable yet (local progression) |
| food | 38 | crops (turnip, carrot, potato, pumpkin, strawberry…), 7 fish, meals | crops overlapping Farm produce: **consume B**; fish: **candidate B later**; meals **A** |
| furniture / placeables | 44 | bed, chest, flags, decorations | **D** (island-bound) |
| special | 20 | canoe, carrier stone, pages, sea glass, bottle… discoveries | discoveries: **C** issuer-backed collectible, later; canoe **D** |

## 4. Recommendations

| Decision | Recommendation | Evidence | Confidence | Open questions |
|---|---|---|---|---|
| Ordinary resources | **Stay local**, inside the island snapshot. Never one Nostr event per stick or stone. | §3; spam and no consumer | High | — |
| First interop | **Consume, don't issue**: Blobbi Pixel reads the connected player's **Nostr Farm produce** (`farm:main`, Farm issuer) and lets them use it on the island — e.g. "a basket from the Farm" usable in cooking — by publishing a **1416 spend** against `farm:main`, exactly as Blobbi Island and nostr-pet already do. | §2: the only verified working path; library helpers `resolveGameInventoryState`, `buildGameInventorySpendEvent` | Medium-high | Owner of Nostr Farm agrees to Pixel as a consumer; how a spent Farm carrot appears in the island bag (local copy credited after the spend is accepted) |
| One source of truth | A spent Farm item becomes an ordinary **local** item on the island; Pixel never writes the Farm inventory and never keeps a parallel balance of it. | protocol: one writer per context (convention) | High | — |
| Issuing Pixel items | **Not in the alpha.** A player-signed 31632/31633 is "an external item" with no provenance; trust needs an **issuer key** the ecosystem accepts (Blobbi official `9efb8d30…` or a Pixel issuer) and a decision on who holds it. | trust model, inventory spec 404/460 | High | Who would sign Pixel definitions; whether the Blobbi official issuer covers Pixel |
| First Pixel-issued items (later) | A **tiny** set of **definitions** (not balances) other apps can display: the seven fish and the sea finds (bottle, kelp, sea glass) as 31632 by an accepted issuer — only after a consumer app commits to showing them. | §3; no consumer today | Medium | Which app shows them first (Island's inventory browser shows external items: `InventoryBrowser.external.test.tsx`) |
| Transfers / trading | **Not possible** with the current protocol; do not simulate. | §1 | High | Needs a grant/transfer spec first |
| Scarcity | Client-signed inventories prove *who signed*, not *what was earned*. Nothing valuable may depend on them. | §1 | High | — |

## 5. Trust boundaries

| Data | Signed by | Proves | Safe use |
|---|---|---|---|
| Island snapshot | player | the player saved this | the player's own world only |
| Cosmetic progress, quests | player | nothing beyond that | personal display |
| Local resources | — (inside the snapshot) | nothing | never exported |
| Public achievements (later) | player | a claim | show as "the player's journal", never as proof |
| Farm produce spent in Pixel | Farm issuer (definition) + player (inventory, spend) | the item kind is the Farm's; the balance is the player's own declaration | low-value, fun use only |
| Issuer-backed collectibles (later) | an issuer key | the issuer vouches for the definition (not for who holds it) | display; anything valuable needs issuer-signed grants (not specified) |

Threats and alpha safeguards: forged balances (accept only accepted issuers; low stakes), replayed or duplicate
spends (library ordering + `(created_at,id)`; Pixel credits a local item once per spend id, recorded in the
snapshot), double spending (library overdraw rule), malformed or oversized events (validate with the library; size
caps), signer compromise (out of the game's control; local data is never deleted remotely).
