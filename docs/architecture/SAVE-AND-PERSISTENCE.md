# Save and persistence

**IMPLEMENTED.** Source: `src/game/persistence.ts` (format, load and migration), `LiveWorld.save()` in
`src/sim/live-world.ts` (writing), `src/game/worlds.ts` (listing, read-only). Tests: `tests/crafting.test.ts`,
`tests/building.test.ts`, `tests/mining.test.ts`, `tests/identity.test.ts`, `tests/camera.test.ts`,
`tests/living-island.test.ts`, `tests/carrier.test.ts`, `tests/growth.test.ts`, `tests/manta-world.test.ts`.

> Maintenance rule: **whenever the save schema changes, update this page** (the field table and the version
> history) in the same change.

## 1. Where and how

- One JSON record per **world identity**, under `blobbi-pixel-lab:save:v1:<identity>` in a key-value store
  (`localStorage` in the playground, a `Map` in tests). The `v1` in the key is the namespace, not the schema version.
- The world identity is the generation inputs: `seed=…|kind=turtle|turtle=…|variant=…|WxH|scale=…|palette=…|density=…|islands=…`
  (`variant` is the turtle's shell variant, 0–4: a turtle world made before 2026-10-11 keeps Variant B and regenerates
  byte for byte; a new one is Variant S, the small start, under its own identity)
  for a turtle, `…|kind=manta|carrier=…|…` for a manta (`worldIdentity`). A world made by NEW ISLAND since M8 ends
  in `|house=none` (no generated cottage, see [procedural generation](PROCEDURAL-GENERATION.md)); older identities
  have no such field. Anything that would regenerate a different world is a different save.
- The record is the local world's (`owner: 'local-world'`), never a Blobbi's: choosing another Blobbi never changes
  which bag, buildings or progress are shown.
- Autosave every 10 simulated seconds, and after every lasting action (collect, craft, build, plant, …), and on page
  hide or unload.
- Nothing is published or sent anywhere.

## 2. Fields (schema 10)

| Field | Since | What |
|---|---|---|
| `version`, `owner`, `world` | 1 / 5 / 1 | schema version; `'local-world'`; the identity (repeated as a guard) |
| `collected`, `collectedAt` | 1 / 4 | resource node ids taken, and when (for regrowth) |
| `inventory` | 1 | `{ version: 1, context, revision, items: [{ item, quantity }] }` (shaped like a kind 31633 inventory, no protocol) |
| `equipped` | 2 | the tool in hand |
| `trees`, `rocks` | 2 / 4 | chopping and mining state per placement index |
| `worldTime` | 2 | simulated seconds the world has lived |
| `buildings` | 3 | placed buildings and decorations, in island-frame coordinates |
| `plots`, `care`, `tally`, `objectives` | 6 | farm plots and crops; needs; what the player did; quests, request, lore found |
| `companion`, `found`, `interiors`, `containers`, `producers` | 7 | friendship and tasted foods; discoveries found; house interiors; chest contents; producer timers |
| `carrier`, `places` | 8 | Carrier bond, observations, likes found, counts; named places visited |
| `growth`, `species`, `generator` | 9 | `{ stage, version, history: [{ stage, worldTime, version }], regions }`; `'turtle'`/`'manta'`/`'whale'`; base generator version (`m6.0`) |
| `name`, `intro`, `tutorial` | 10 | the island's own name or null; `{ state: 'pending' \| 'done' \| 'skipped', at }`; `{ done: [step ids], skipped }` |

## 3. Loading and migration

`loadSave(store, identity)`:

1. Reads the record; malformed JSON, an unknown or future version, a different `world`, or (from schema 5) a
   different owner → `null` (the world starts fresh **in memory**).
2. Migrates any version 1–9 forward: each field added later gets a safe default, and some are derived from what the
   record shows (for example a schema-5 tally seeded from collected, felled, mined and built counts).
3. Sanitises every field (unknown ids dropped, numbers checked, lists deduplicated).

Guarantees (tested):

- Older saves load with their bag, buildings, plots, quests and progress intact.
- **A migration never grows an island**: every record older than 9 loads at growth stage 0, even with a stray
  `growth` field.
- An unknown **growth** version makes the world read-only for that session (no store), so it is neither regrown
  differently nor overwritten.
- Quest rewards are never granted twice after a migration (quest ids are stable).
- **A world from before schema 10 never plays the intro** (its `intro` loads as seen), has no name (it keeps its
  generated one) and has tips off (`tutorial.skipped`), because it is already under way.
- A new island is saved the moment it is made, with `intro: pending`: if the page goes away during its intro, the
  island is kept and its intro plays again the next time it is opened (`tests/onboarding.test.ts`).

Known risk (pre-existing, documented in [known issues](../testing/KNOWN-ISSUES.md)): a record whose **schema**
version is newer than the code is ignored and the world starts fresh; autosave would then write a new record over
it. This only happens when an older build opens a newer save.

## 4. Writing

`LiveWorld.save()` writes the whole record at once (no partial writes). Leaving the page saves only a world that has
been played (or a new island): an island shown behind the title but never played is never written, so opening the
game never creates a save by itself. Not saved: presence (teleport), the camera,
UI state, the visit session, particles, the brain's plan. A visitor (`LiveWorld({ visitor: true })`) has no store
and never writes.

## 5. Other per-browser keys (never part of a save)

| Key | What | Source |
|---|---|---|
| `blobbi-pixel-lab:selected-blobbi` | the chosen Blobbi (V3 address, V3 seed or demo seed) | `src/game/blobbi-selection.ts` |
| `blobbi-pixel-lab:settings` | game settings | `src/playground/main.ts` |
| `blobbi-pixel-lab:audio` | the audio mix | idem |
| `blobbi-pixel:camera-mode` | the camera mode | idem |
| `blobbi-pixel-lab:worlds` | last-played time per world (orders CONTINUE) | `src/game/worlds.ts` |
| `blobbi-pixel-lab:owners` | which local player first played each world | `src/game/visiting.ts` |
| `blobbi-pixel-lab:player` | the local player id (`local:<random>`) | idem |

## 6. Safety rules for development

- Never open a player's world in a dev build on an origin whose storage holds a save you must not touch: opening a
  world migrates and autosaves its record. Use the dev tools' **Test world** or a separate port.
- New worlds (title NEW ISLAND, dev "Make visit test worlds") never reuse an identity that already has a save.
- Two things delete a save, and both ask first (`ConfirmGate` in `src/game/world-delete.ts`: the question names the
  island, and its confirming answer is refused for 0.6 s after it appears):
  - the playground sidebar's "Delete this island's progress…" (`#progress-reset` → confirmation →
    `LiveWorld.resetProgress`);
  - MY ISLANDS on the title (a row's DELETE, or X / Delete) → the DELETE THIS ISLAND? page → `deleteWorld`, which
    removes that world's save and its entries in `blobbi-pixel-lab:worlds` and `blobbi-pixel-lab:owners`, nothing
    else. If it was the world behind the title, that world stops writing (`LiveWorld.detachStore`).
