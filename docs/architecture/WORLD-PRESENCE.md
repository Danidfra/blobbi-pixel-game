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

- a build with `VITE_BLOBBI_WORLD_TRAVEL=nostr` **and** `VITE_BLOBBI_PUBLISH=live`
  (M16.2). World travel signs and publishes the provisional kinds to the
  public travel relays, so a rehearsal build never runs it, whatever the
  travel flag says. A build with only the travel flag compiles it off;
  checked in the built bundle;
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
- **Three interactions call it over (M16.1).** Each meaningful input in play
  (a trusted press or key, in a visible, focused page, play started, not
  paused by the game's own journeys) is passed to the kit's
  `session.interact({ repeat })`. While the Blobbi is elsewhere, the kit
  counts them. The **third within a rolling 20 s window** starts a casual
  move: it signs one World Location and publishes it, and the arrival
  follows. The threshold is the kit's default; Pixel has no setting for it.
  - A held key's auto-repeat (`KeyboardEvent.repeat`) is never counted.
    Inputs less than 1 s apart are one gesture, so walking with a held key
    is one interaction, and walking by taps counts one per burst. Frames,
    timers, focus, visibility, loading and scripts' (untrusted) events never
    count.
  - The first counted interaction may show a short notice, "{name} noticed
    you", but only when no other notice is showing. At the spot where the
    Blobbi would stand, one or two faint motes rise while the count runs (the
    *noticed* cue).
  - A move within 5 s of a move elsewhere does not undo it (`contended`).
  - A refusal by the signer suspends casual following for the session
    (`snapshot.follow.suspended`). Only an explicit request moves it then,
    and a successful one resumes following.
  - **Settings > Account > Call {name} here** is explicit and immediate
    (`session.travel({ explicit: true })`).
  - A new account or a new walking Blobbi is a new session, so its count
    starts at zero.
- **The press that starts play** (NEW ADVENTURE WITH BAMBU, CONTINUE, an island
  opened from the list) counts as **one** interaction, never as a move by
  itself: play beginning within 2 s of a trusted press calls `interact` once.
  On a fresh device the place is not known yet, so that interaction is held
  until it is (at most 10 s) rather than lost. Play that begins with no press,
  such as a startup that goes straight into an island, never counts. A Blobbi
  already known to be elsewhere skips the entry arrival, so it never appears
  and then vanishes.
- **A new island's birth intro is explicit.** The intro is a cinematic of this
  very Blobbi, so the trusted press that starts it (NEW ADVENTURE WITH {name})
  calls it here at once (`playStartExplicit`), never as one interaction. An
  intro with no press moves nothing. A Blobbi not known to be here is absent
  from the intro's first frame, so only the intro's own arrival brings it in.
  If the call is refused or fails, the Blobbi leaves with its journey when the
  intro ends. (Found in the cross-device browser run: with only a count, the
  intro showed a Blobbi that belonged elsewhere, then took it away.) The kit
  (m16.3) also keeps a Blobbi that is already shown while a move here is
  under way.
- **Loading: the place not known yet (M16.2).** The kit's
  `snapshot.resolution` is `pending` while the first look is under way and
  this device kept no location. Pixel also treats "world travel on, an
  account connected with its own walking Blobbi, but no session yet" (the
  network module loads lazily) as not known. While it is not known:
  - play's entry arrival is **held** (`entryDecision` in `travel-host.ts`).
    The Blobbi is neither shown here nor sent away, and the travel sync is
    paused;
  - a small **"looking for {name}..."** cue shows at the spot: three faint
    motes twinkling in turn, with a one-line caption under them. There is no
    overlay, and menus and the rest of the game work as usual;
  - nothing counts and nothing signs.

  The hold ends once the place is known, and never later than
  `ENTRY_HOLD_MAX_MS` (6 s: the relays' 4 s timeout plus the module's load).
  - **Here** (`confirmed` or `cached`): the Blobbi arrives with the game's
    usual entry teleport, from the spot the cue marked. Entering play is the
    game's own journey, so it reads as "found it, here it comes" rather than
    a pop.
  - **Elsewhere:** the entry is skipped, and the away notice says where.
  - **No relay answered** (`unreachable`): the kept location stands, or the
    protocol's default place (Blobbi Home) if there is none. A notice says
    so honestly: "The relays did not answer...". It never loads forever.
  - **No session could start in time:** the Blobbi walks freely, as with
    world travel off.

  A reload shows the kept location at once (`cached`), so the entry does not
  wait.
- **Arrival timing (M16.2).** Pixel passes `arrivalLeadMs` = 1900 ms (1140
  with reduced motion, which runs the teleport at 0.6). That is
  `ARRIVE.rebuildStart` in `src/game/teleport.ts`: the pixels fall from the
  sky for 1.9 s, and then the body starts to rebuild, which is the moment the
  Blobbi is first seen. The kit starts the arrival that much early, so the
  falling pixels overlap the 2 s departure window instead of adding to it.
  The Blobbi forms at the kit's `formAt`, no sooner than its 1.5 s minimum
  after the act. While a move is under way (the kit's `travelView` says
  `coming`: checking, signing, publishing, or waiting for the arrival), a
  **calling** cue plays at the spot: bright motes rising in a small column
  over a pale glint on the ground. The teleport's own arrival then takes
  over. So each transfer reads as cue, then arrival. The cue is drawn only
  while the Blobbi is absent, and both are pure functions of time, so there
  is nothing to replay and no loop after a reconnect.
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
installed: `{ mode, snapshot(), shown(), callHere(), looking(), coming(),
held(), cue() }`. `snapshot()` includes `resolution` and `follow`. `looking()`
means the "looking for" state (the place not known). `coming()` is the kit's
`coming` view. `held()` means play's entry is held, and `cue()` names the cue
drawn now (`looking`, `noticed`, `calling` or null). A test pins it behind
`import.meta.env.DEV`, and the production build does not contain it.

Tests: `tests/world-travel.test.ts`.

## M16.2: slow relays

- **Reading the account's Blobbi** (`src/nostr/relays.ts`,
  `current-blobbi.ts`):
  - The 1.5 s grace starts only after an answer that contains events. A relay
    that never saw the player answers first, and empty. Before this fix that
    empty answer cut off the slower relays holding the profile, so a fresh
    device read "no profile" and NEW ADVENTURE hatched a new local Blobbi
    instead of the account's own.
  - "No profile" from only some of the relays is now `unavailable`: nothing is
    decided.
- **Play's entry** (`entryHere` in `main.ts`):
  - An account's own Blobbi is here only once its world-travel session says
    so. With no session yet (the network module still loading, or failed),
    the Blobbi is never shown here by default. When the wait ends with no
    session, a notice says its place could not be checked.
  - The session itself (kit 0.11.0-m16.4) still hears a relay slower than its
    timeout, and backs off its retries (5, 10, 20, 40 and 60 s). An
    `unreachable` place turns into `confirmed` by itself, shown as history.
