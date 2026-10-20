# Blobbi Pixel

A fully procedural, living top-down pixel-art game for the Blobbi ecosystem. Islands grow on the back of a
World Carrier (a turtle, a manta or a whale); a canonical pixel **Blobbi** lives there; the player gathers, crafts,
farms, builds a home, cooks, follows quests, listens to the Carrier, grows the island and visits other islands. Every
pixel is generated from a seed: no sprite packs, no downloaded or AI-generated raster assets.

**Play it:** <https://pixel.blobbi.pet>. The repository is also a lab (the package is named `blobbi-pixel-lab`): on a
development server, the sidebar's other tabs render worlds, Blobbis and growth stages from seeds.

## Blobbi Pixel and Nostr

A Blobbi is not owned by this game. It is a Nostr event (kind 31124) signed by its owner, defined by
[`@blobbi-kit/core`](https://github.com/Danidfra/blobbi-kit), and the same Blobbi appears in every Blobbi app:

- **Identity.** A player connects a Nostr account (NIP-07 browser extension) or plays as a guest with a key kept in
  this browser, with an optional password-locked backup. The account's own Blobbis are read from relays.
- **The same Blobbi everywhere.** Its look is derived from its Nostr address with the kit, gene for gene the same
  Blobbi as in [Blobbi Standalone](https://www.blobbi.pet) and Ditto ([portable identity](docs/architecture/NOSTR-IDENTITY.md)).
- **World Travel.** The Blobbi's current place is a World Location event on Nostr (kind 31126, the kit's
  experimental world travel protocol). A Blobbi playing here is away from its Standalone home, and the reverse; any
  device sees the same place ([World travel, Pixel's half](docs/architecture/WORLD-PRESENCE.md)).
- **Companion sync.** Choosing a Blobbi in this game can update the player's profile (`current_companion`, kind
  11125) so the other Blobbi apps follow the choice. It is signed by the account, only after the player's consent.

The island itself (its land, home, crafting and progress) is saved in this browser only, not on Nostr.

## Status

| What | Status |
|---|---|
| The game at pixel.blobbi.pet | In production |
| World Travel between Pixel and Blobbi Standalone | In production, validated publicly between the two apps |
| NIP-07 login, guest keys and backups, reading the account's Blobbis, companion sync | Implemented, automated tests |
| Island gameplay milestones (M4 onward) | Implemented; manual validation per [milestones](docs/milestones/README.md) and the [test plan](docs/testing/MANUAL-TEST-PLAN.md) |
| Islands saved on Nostr, multiplayer, items shared with other games (`@nostr-games/inventory`) | Designed only ([docs/architecture](docs/README.md)); not implemented |
| World Travel with Blobbi Island | Opening Pixel brings the account's Blobbi here by itself (one signed move once the relays confirm its place), and the World Travel menu (Y, or WORLDS in the menu bar) leaves for Blobbi Home or Blobbi Island with the move signed and published here before the page goes ([details](docs/architecture/WORLD-PRESENCE.md)); revised 2026-10-19, not yet validated publicly |
| World Travel with Nostr Farm or Blobbi Rumble | Not implemented (they do not read World Locations, so the menu does not list them) |

Event kinds 31124, 11125 and 31126 are Blobbi ecosystem conventions, not NIPs in the official registry.

## Quick start

```
npm install
npm run dev        # http://127.0.0.1:5177, open the Play tab
npm run check      # typecheck + tests + build
npm test           # vitest
npm run seeds      # many world seeds to PNG + a contact sheet
npm run perf       # headless frame-cost measurement
npx tsx scripts/check-docs.ts        # documentation links and source paths
npx tsx scripts/content-catalog.ts   # regenerate docs/game-design/CONTENT-CATALOG.md
```

Node 22+. Dev tools appear at the bottom of the Play panel on the dev server only.

The page is installable (a web app manifest and the icon family in `public/`, no service worker: a cached game would
be a stale game). `npm run icons` regenerates Pixel's icons from the game's own pixel Blobbi; `scripts/app-icons.ts`
also generates Blobbi Home's, Blobbi Island's and Nostr Farm's (`--family <dir>`), one family beside Rumble's icon.

A plain `npm run dev` or `npm run build` publishes nothing: World Travel is off and registration is a rehearsal.
World Travel is turned on at build time (`VITE_BLOBBI_WORLD_TRAVEL=nostr VITE_BLOBBI_PUBLISH=live npm run build`) or on
a development server with `#world-travel=nostr` in the page address; with it on, moves are signed and sent to public
relays ([details](docs/architecture/WORLD-PRESENCE.md)).

**Saves** live in this browser's localStorage (`blobbi-pixel-lab:save:*`). Use a new seed or dev tools → Test world
when experimenting; the sidebar's reset button deletes a save without asking
([known issues](docs/testing/KNOWN-ISSUES.md)).

## Documentation

Everything lives in [docs/](docs/README.md):

- [Game design](docs/game-design/GAME-DESIGN-DOCUMENT.md) · [gameplay systems and controls](docs/game-design/GAMEPLAY-SYSTEMS.md) · [content catalogue](docs/game-design/CONTENT-CATALOG.md)
- [System overview](docs/architecture/SYSTEM-OVERVIEW.md) · [saves](docs/architecture/SAVE-AND-PERSISTENCE.md)
- [Specifications](docs/README.md#specifications) · [manual test plan](docs/testing/MANUAL-TEST-PLAN.md)
- [Milestones and reports](docs/milestones/README.md) · [roadmap](ROADMAP.md)

The previous long README is archived at [docs/milestones/reports/README-BEFORE-DOCS-PASS.md](docs/milestones/reports/README-BEFORE-DOCS-PASS.md).

## License

MIT. See [LICENSE](LICENSE).
