# M8 cinematic: the species-aware intro, and the turtle's small start

**Status: IMPLEMENTED — AWAITING MANUAL VALIDATION** (uncommitted, on top of M8 phase 0 and the growth-button fix).
Not attached to the production start of play (a later integration session).

- **Scope:** a reusable intro cinematic for the turtle, the manta and the whale, built on the existing renderers,
  animations, camera system, teleport and audio engine; a dev preview; frames; docs. After the first manual review
  (2026-10-11) the sequence was reworked into **the birth of a world**: the Carrier emerges bare, its island forms
  and comes alive, the Blobbi arrives by the existing teleport; and the turtle's **real starting island was made
  smaller** for new worlds (shell Variant S). Nothing else of M8 (no onboarding, no tutorial). See
  [Cinematic direction](../game-design/CINEMATIC-DIRECTION.md) and the [specification](../specifications/INTRO-CINEMATIC.md).
- **Implemented, cinematic:** `src/cinematic/` (`intro.ts`, `script.ts`, `layers.ts`, `sea.ts`, `audio.ts`,
  `preview.ts`): five scenes, about 32 s (whale 33 s; reduced motion 19.5 s); open water continued past the world's
  edge; the Carrier as a shape beneath the surface, surfacing bare in a species order behind a foam front; the
  island forming from a first patch outward (soil, then ground, then life sparkling in), deterministic from the
  seed, ending on the game's own pixels; the reveal framing the whole animal (the first manta wing-clipping fix:
  the old framing used the game's overview subject, which excludes the animated wing tips) and the submerged wings
  kept whole over the sea's bands round the disc (the second fix, after the second manual review: the compositor
  had painted every shore-band pixel as water, cutting each wing with a strip of sea just outside the disc while
  it was under the surface; the same rule now keeps a whale's fins and a turtle's flippers whole); the Blobbi
  absent until its
  island exists, then the existing teleport arrival on the cinematic's clock with the game's own camera lift,
  sounds and landing hop; a look each way, surprised at you, happy with a close-up-sized "hello!"; a handoff into
  the exploration camera's exact rest framing; skip by key, click and tap at any phase; reduced motion; safe cancel
  and dispose. Dev preview: dev tools buttons and `#mode=play&intro=<species>` (dev server only), on a preview world
  with no store.
- **Implemented, the small start:** shell **Variant S** (`src/carrier/types.ts`, id 4, coverage ≈ 40 %, island at
  72 % of the shell top's half-axes): the island is generated smaller in the same 704×480 frame and the shell fitted
  around it, so a new turtle is a giant animal carrying a small island; object sizes, the Blobbi, walkability,
  resources, farming and building are unchanged; growth over the wider free ring gives +29 % / +46 % / +77 % land
  by stage (36 % → 46 % → 52 % → 64 % of the shell top; Variant B was 63 % → 76 %), between the manta's and the
  whale's. `NEW_WORLD_SHELL_VARIANT` is used by the title's NEW ISLAND and by the intro preview;
  `DEFAULT_SHELL_VARIANT` stays Variant B for the generator's implicit default, the lab's default world and every
  existing world (the variant is in the world identity, so saves keep their geometry). Variants 0–3 are pinned
  byte-identical. Pictures and numbers: `examples/turtle-start/` (`npx tsx scripts/turtle-start.ts`).
- **Not changed:** the Blobbi, the turtle's anatomy and renderer, the manta, the whale, their animations, the
  terrain generator's rules, growth versions (the plan is unchanged; Variant S simply has more free ring), saves
  and their schema, the title's start flow, farming, building, quests. No new dependencies, no assets.
- **Visually inspected (by the author, on rendered frames and headless-Chrome passes, not by a person in play):**
  `examples/intro-cinematic/` for all three species (ocean, shadow, reveal, bare, first patch, half-formed land,
  complete land, life, island, arrival start, rebuild, arrived, looks, notices, hello, message, handoff; contact
  sheets; reduced-motion sets; `manta-wings.png`: the wings under the shadow, surfacing, half up, bare and before
  the zoom at 960×540 and 1280×800, whole from disc to tip); `examples/turtle-start/` (before and after, stages 0–3, the manta and the whale,
  a comparison sheet). In headless Chrome at 1280×800: full whale and turtle runs at 60 fps (16.6 ms frame
  interval), skip by Space, by click and by an emulated touch, a resize to 800×500 and back mid-run, a
  reduced-motion manta run, the title returning afterwards, audio unlocked by a key with the formation and arrival
  cues played, and no save key written.
- **Automatically tested:** `tests/cinematic.test.ts` (24) and `tests/turtle-start.test.ts` (7); see the
  specification §11. `npm run check` (typecheck, every test, build) passes.
- **Awaiting manual validation:** INTRO-01 … INTRO-12 and TSTART-01 … TSTART-05 in the
  [test plan](../testing/MANUAL-TEST-PLAN.md): the look at real speed, the feel of the timings (the formation and
  the arrival above all), the sound by ear, touch on a device, reduced motion by system preference, the message on
  small screens, and whether the small island plays well.
- **Known limitations:** [known issues](../testing/KNOWN-ISSUES.md) KI-19 … KI-26 (KI-26: the raised wing tip's
  flat face is the manta's own drawing, the same in play; nothing of the wing is clipped).
- **Preview:** `npm run dev`, Play tab, dev tools → **Intro cinematic** (Turtle / Manta / Whale, reduced motion
  checkbox), or open `http://127.0.0.1:5177/#mode=play&intro=whale` (`&reduced=1`). Frames:
  `npx tsx scripts/intro-cinematic.ts [turtle|manta|whale] [--reduced] [--size 1280x720]`; the small start:
  `npx tsx scripts/turtle-start.ts`.
