# Specification: Audio

Design rationale: [Audio design](../game-design/AUDIO-DESIGN.md).

## 1. Purpose
Cozy synthesized sound: effects for every action, ambience that follows place and weather, and original generative
music by mood — safe (no clipping, no spam), respectful (silent until a gesture, muted when hidden) and adjustable.

## 2. Status
**IMPLEMENTED** (M6; M7 added `grow` and manta voices in play). **NOT TESTED by ear**: verified to run in Chrome and
measured offline only.

## 3. Player-facing behaviour
- Nothing sounds until the first key or click (browser rule). Hiding the tab suspends audio; showing it resumes.
- Effects: footsteps by surface, tools, farming, crafting, cooking, failures, recipes, UI clicks, quests,
  discoveries, the Blobbi, the Carrier, wildlife, teleport phases, island growth (59 effects).
- Ambience: sea (louder near the rim, swelling with the Carrier's breath), wind, rain, a muffled room indoors; birds by
  day, crickets and an owl at night, splashes, Carrier calls (turtle) or chimes and glides (manta). Event rates grow
  with island harmony.
- Music: six moods (day, night, rain, indoor, mystery, special); a new mood must hold 3 s before the music follows,
  except going indoors and special moments (discovery, friendship level, arrival, growth: 22 s).

## 4. Controls
Settings (Esc) → SOUND page (Tab): volume, music, effects, ambience (LEFT/RIGHT), music on/off, softer sound, mute
all; the GAME page's SOUND on/off.

## 5. Data structures
`SfxRecipe` (`src/audio/sfx.ts`): bus, anti-spam gap, voices (wave or noise, frequency glide, start, length, attack,
gain, filter). `composeBar(mood, bar, seed)` → notes (`src/audio/music.ts`). `AudioSettings` (`src/audio/engine.ts`).
`Listening` and `AmbientMix` (`src/audio/director.ts`).

## 6. State transitions
engine: no context → (gesture) running ⇄ suspended (hidden tab, sound off). Music: mood → (held 3 s) next mood, at the
next bar.

## 7. Persistence
The audio mix in `blobbi-pixel-lab:audio` (per browser); never in a save.

## 8. Edge cases
Effects over their gap or over the voice budget (14 effect voices, 24 music voices) are skipped, never queued; a
browser without Web Audio plays nothing and nothing breaks; muted means no voices are created.

## 9. Failure handling
`resume` and `suspend` errors are swallowed; the context is created once; offline levels are checked by
`scripts/audio-preview.ts` (no clipping).

## 10. Source files
`src/audio/sfx.ts`, `src/audio/music.ts`, `src/audio/engine.ts`, `src/audio/director.ts`, `src/ui/screens/settings.ts`,
`src/playground/main.ts` (unlock, visibility), `LiveWorld.sound`.

## 11. Automated tests
`tests/audio.test.ts` (fake AudioContext: unlock, no Web Audio, anti-spam and budgets, soft recipes, hook coverage,
settings, suspend and resume, music scheduling, beds; music determinism, key, range, form; director moods, mixes,
read-only world; SOUND page; UI sounds).

## 12. Known limitations
Not heard by a person; browser output is close to but not identical with the offline preview; no positional audio.

## 13. Extension points
New effects are recipe entries; new moods are `MOOD_DEFS` entries; species voices come from `SPECIES[...].sounds`.
