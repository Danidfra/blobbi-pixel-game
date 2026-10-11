# Audio design

Status: **IMPLEMENTED** (M6 Batch 2; M7 added the `grow` effect and the manta's voices in play) — **NOT TESTED** by
ear. All sound is synthesized live with Web Audio from original recipes. There are no samples and no third-party
audio. This is the design rationale; the behaviour-level specification is [Audio](../specifications/AUDIO.md).

## Goals

- **Cozy, never harsh.** Soft attacks, short tails, mid frequencies, pentatonic pitches for anything musical.
  Nothing clips; nothing shrill.
- **Readable.** Every action the player takes has a sound that says what happened (a pickup chimes up, a failure
  steps down).
- **Calm under load.** A burst of events can never pile up into noise.
- **Respectful.** Silent until the first gesture. Muted when the tab is hidden. Separate volumes, with music
  independent of effects. A softer mode.

## Architecture

```
world sound hooks ─┐
UI sounds ─────────┼─► GameAudio (director) ─► AudioEngine
ambient decisions ─┘     moodFor / ambientMix     buses: sfx · ui · ambient · music(+echo) → master → compressor
```

| Module | Role |
|---|---|
| `src/audio/sfx.ts` | 59 effects as data: a few voices each (oscillator or filtered noise, pitch glide, soft envelope), an anti-spam gap per effect |
| `src/audio/music.ts` | the generative score: `composeBar(mood, bar, seed)` is pure |
| `src/audio/engine.ts` | buses, settings, unlock and suspend/resume, voice budgets (14 for effects, 24 for music), lazy noise beds, music scheduling with lookahead |
| `src/audio/director.ts` | reads the world (never writes it), picks the mood, steers beds and ambient life, plays the hooks |

## Effects

| Group | Effects |
|---|---|
| Movement | footsteps by surface (grass, path, sand, wood, shallow), every 7 px walked; door |
| Tools, farming | chop, mine, till, plant, water, harvest, cast, bite, catch |
| Crafting, cooking | craft, cook, fail, recipe discovery |
| Inventory | pickup, place, store, take |
| UI | open, close, select, confirm, deny |
| Story | quest, discover, friend |
| Blobbi | eat, pet, happy, curious, sleep, wake |
| World Carrier | hum, carrier-call, carrier-breath (every 9 s, under everything) |
| Life | bird, cricket, owl, splash |
| Teleport | gather, dissolve, whoosh, gone, incoming, rebuild, arrived, cancelled, reversed |
| Island growth (M7) | grow (a swell and chimes; starts the special mood) |
| Other species | manta-call, manta-glide (played on manta worlds since M7); whale-song, whale-blow (prototype preview only) |

Tests check that every effect has at most 10 voices, peak gain ≤ 0.2, attack > 0, length ≤ 3.5 s and pitches in
20–8000 Hz. They also check that every hook the world emits has an effect.

## Music

Six moods, each its own key, tempo and orchestration:

| Mood | Key | Tempo | When |
|---|---|---|---|
| day | F major | 84 | outdoors, daytime |
| night | A aeolian | 62 | 20:30–5:30 |
| rain | D dorian | 70 | rain above 0.45 |
| indoor | C major (music box) | 76 | inside a house |
| mystery | E lydian | 58 | near the Carrier's head or something hidden |
| special | G major | 88 | 22 s after a discovery, a friendship level, an arrival or a growth |

- **Form.** 16-bar cycles (A A' B A''), with a density arc so the music breathes.
- **Melody.** One seeded motif per cycle, answered and recalled. The lead snaps to chord tones on strong beats and
  rests often.
- **Instruments.** Pad, bass, pluck arpeggio, lead and bells. The lead and bells are folded into sweet ranges (at
  most MIDI 86 and 93).
- **Mood changes.** A new mood must hold for 3 s before the music follows (walking past a secret is not a scene
  change). Going indoors and special moments switch at once, at the next bar.

## Ambience

- **Noise beds.** Ocean (louder toward the rim, swelling with a 9 s Carrier breath), wind, rain, and a muffled
  room tone indoors.
- **Life.** Birds by day, crickets and an owl at night, splashes near the rim, and Carrier calls (more often at
  night).
- **Harmony.** Event rates rise with island harmony (+15 % per level). Softer sound halves them.

## Levels

`OUTPUT_GAIN = 3`, from offline measurement with `scripts/audio-preview.ts`, which renders WAVs and prints peak and
RMS levels:

- music: about −24 dBFS RMS, peaks about −10;
- effects: peaks −10 to −30;
- no clipping.

The browser output is close to, but not bit-identical with, the offline synth.

## Settings

Stored per browser (`blobbi-pixel-lab:audio`), never in a save:

- volume, music, effects and ambience, each 0–100 %;
- music on/off;
- softer sound (effects ×0.6, smoother attacks, filters ≤ 3 kHz, fewer events);
- mute all;
- the game's SOUND on/off.

## Validation status

- **Verified:** in Chrome, a real click created and unlocked the context, the game scheduled music, played effects
  and brought up the beds; levels measured offline.
- **Not verified by listening:** nobody has heard it yet. Whether it sounds good needs a person (the WAVs that
  `npx tsx scripts/audio-preview.ts` writes to `out/audio-preview/` are made for that).
