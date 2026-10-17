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

## World travel on Nostr (M16)

**Status: implemented, off by default (the kinds are provisional).** With it
on, the Blobbi's place is its **World Location** on Nostr (kind 31126; the
protocol is `@blobbi-kit/core`'s world travel, specified in the kit's
`packages/blobbi-core/WORLD-TRAVEL.md`). The place is the same on every
device and browser. The v1 cookie lease above is then **never read or
written**. With it off, v1 runs exactly as before.

**Turning it on.** Either of these works:

- a build with `VITE_BLOBBI_WORLD_TRAVEL=nostr`;
- a development server with `#world-travel=nostr` in the page address, or
  `localStorage['blobbi:world-travel:v1'] = 'nostr'`. A production build
  ignores both page flags.

This is independent of the registration's publish mode: rehearsal stays
rehearsal for registration.

**Who travels.** Only the connected account's own walking Blobbi, at
`31124:<pubkey>:<d>`. A guest or a local Blobbi has no session and walks
freely. The network module (`src/nostr/world-travel.ts`) loads only in this
mode, and a session starts only once it has loaded. The first screen still
loads no network library.

**Flow** (`src/game/travel-host.ts`):

- **Load.** The place is read (relays, the live stream, and the last signed
  location kept in localStorage). If it is elsewhere, the Blobbi is simply
  not there (`LiveWorld.settleBlobbi`, no departure replayed), and a notice
  says where it is.
- **The player's first press or key in play** (trusted, visible, focused,
  play started, not paused by the game's own journeys) calls it over. That
  signs one World Location and publishes it, and the arrival plays after the
  departure window. If it is already here, nothing is published. A press
  within 5 s of a move elsewhere does not undo it. After a refusal, presses
  ask nothing again for a minute. **Settings > Account > Call {name} here**
  is the explicit request.
- **A move made elsewhere** (Blobbi Home on any device) arrives on the stream
  or the next look. The Blobbi departs with the game's teleport once the
  game's moment ends (the same busy and paused rules as v1).
- Nothing travels on load, focus, visibility or a timer, and an old tab
  never takes the Blobbi back.

**Signers.**

| Account | Signer mode | How it signs |
|---|---|---|
| `vault` | `silent` | The key vault, via `IdentityService.signAsAccount` |
| `nip07` | `prompt` | The browser extension. It must be verified (it answered with this very key), and every signature may show its prompt. Notice: "Approve in your signer". |

A signer answering for another key is refused. With no present signer the
session is read-only.

**Relays and the live stream.**

- Reads and writes go to the kit's `BLOBBI_WORLD_TRAVEL_RELAYS`
  (relay.ditto.pub, relay.primal.net). Blobbi Standalone uses the same two.
- Reads use one connection per request. Writes go through
  `publisher.ts`'s `sendToRelay`.
- The **one narrow exception** to "no background sockets": while world
  travel is on, an account's session exists and the page is visible, there
  is one REQ-only subscription per relay. It is closed when the page is
  hidden, reopened (with a fresh look) when it shows, and reopened with
  backoff after a drop.

**Active Presence** (kind 21124, ephemeral):

- Off by default. **Settings > Account > Show when I play** turns it on, kept
  per account in `blobbi:active-presence:v1:<pubkey>`.
- It is sent at most once a minute, only while the Blobbi is here and the
  game was played in the last two minutes.
- With the extension, the first one waits for a press (never a timer). A
  signature that asked the player pauses it for the session (a notice says
  so), and a refusal stops it. The row shows "paused" or "refused". It never
  moves the Blobbi.

**Development aid.** On a dev server only, `window.__blobbiWorldTravel` is
installed: `{ mode, snapshot(), shown(), callHere() }`. A test pins it behind
`import.meta.env.DEV`, and the production build does not contain it.

Tests: `tests/world-travel.test.ts`.
