# World presence v1 (Pixel's half)

**Status: implemented, local to one browser.** While the player plays in Pixel,
their account's Blobbi is here. When they play in the Blobbi home (Blobbi
Standalone) instead, it goes home. A Pixel tab that is closed gives the Blobbi
back at once, and a hidden or idle one lets it drift home within about 45 s.
Nothing is published, no kind is added, and the companion choice is untouched.

The full specification is the Standalone's `src/features/presence/README.md`. These
two files and the test vectors are byte-identical in both repos; keep them so:

- `src/game/world-presence.ts`: the pure rules (`decide`, `reconcile`, the codec)
- `src/game/presence-page.ts`: the first-party cookie lease, the page, `syncPresence`
- `tests/world-presence.vectors.json`

Pixel's own part:

- `src/game/presence-host.ts`: only a connected account's own walking Blobbi takes
  part. The journeys are the game's teleport (`leaveBlobbi` / `enterBlobbi`).
- A departure waits for the game's moment: a menu, a speech, a timed action,
  building.
- The game's own journeys come first: the title, an intro, a visit's handoff, a
  change of Blobbi.
- `src/playground/main.ts` ("World presence"):
  - the host follows the account from the first frame, so the presses that start
    play claim the Blobbi;
  - HUD notices: "Brook went home" (press a key or tap to call it back) and
    "Brook is back!".
- Off in a browser with `localStorage['blobbi:world-presence:v1'] = 'off'`.

Production needs Pixel on a `*.blobbi.pet` host, because the cookie uses
`Domain=blobbi.pet`. On any other host, each app keeps the Blobbi by itself, as
before.
