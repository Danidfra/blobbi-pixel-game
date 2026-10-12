# blobbi-pixel-lab

A fully procedural, living top-down pixel-art game prototype for the Blobbi ecosystem. Islands grow on the back of a
World Carrier (a turtle, a manta or a whale); a canonical pixel **Blobbi** lives there; the player gathers, crafts,
farms, builds a home, cooks, follows quests, listens to the Carrier, grows the island and visits other islands. Every
pixel is generated from a seed: no sprite packs, no downloaded or AI-generated raster assets.

It is a research prototype, not a package. **M1–M3 are committed; M4–M7 and the playable whale (M8 phase 0)
are implemented but await manual validation**, as are the intro cinematic (dev preview only) and the turtle's small
start for new worlds (see [milestones](docs/milestones/README.md)).

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

Node 22+. The only runtime dependency is `@blobbi-kit/renderer` (Blobbi identity); everything else is dev-only.
Dev tools appear at the bottom of the Play panel on the dev server only.

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
