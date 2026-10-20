# World travel (Pixel's half)

World travel on Nostr (M16) is the **only** model of where the account's
Blobbi is. It is off by default; with it off, the Blobbi simply walks on its
island, and nothing about its place is read, kept, signed or published.

> **World presence v1 was removed.** It was a first-party cookie lease shared
> with the Blobbi home on `*.blobbi.pet` (`world-presence.ts`,
> `presence-page.ts`, `presence-host.ts` and shared test vectors). No cookie and
> no other channel says where a Blobbi is any more. Its code is in the git
> history, before the commit that removed it.

## World travel on Nostr (M16)

**Status: implemented, off by default (the kinds are experimental, `@blobbi-kit/core` 0.11.0).** With it
on, the Blobbi's place is its **World Location** on Nostr (kind 31126; the
protocol is `@blobbi-kit/core`'s world travel, specified in the kit's
`packages/blobbi-core/WORLD-TRAVEL.md`). The place is the same on every
device and browser. With it off, there is no host, no network module, no
session and no signature: play's entry always has the Blobbi here.

**Turning it on.** Either of these works:

- a public beta build:
  `VITE_BLOBBI_WORLD_TRAVEL=nostr VITE_BLOBBI_PUBLISH=live npm run build`.
  World travel signs and publishes the experimental kinds to the public travel
  relays, so it only ships in a LIVE build (which also publishes registration
  live: a rehearsal build promises that nothing leaves the device). The build
  says `World travel: ON in this build…`. The travel flag without
  `VITE_BLOBBI_PUBLISH=live`, or an unknown value (`on`, `true`, a typo),
  **stops the build** with the reason (`src/game/travel-build.ts`, checked by
  `vite.config.ts`), so it is never quietly off; the page applies the same
  rule at run time (`worldTravelMode`);
- a development server with `#world-travel=nostr` in the page address, or
  `localStorage['blobbi:world-travel:v1'] = 'nostr'`. A production build
  ignores both page flags.

On a development server the page switches are independent of the
registration's publish mode (rehearsal stays rehearsal for registration), and
the server warns when `VITE_BLOBBI_WORLD_TRAVEL=nostr` makes moves go to the
PUBLIC travel relays.

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
- **Opening the game brings it here (revised 2026-10-19).** Opening a
  world is the player's intention to take the Blobbi there; no interaction
  is counted any more. Once play is on and the kit's resolution is
  `confirmed`, an away Blobbi is moved here with the kit's own explicit move
  (`session.travel({ explicit: true })`: one signed World Location naming
  `blobbi-pixel`, `prev` the canonical one), and the teleport's arrival
  follows. A Blobbi already here moves nothing. The decision is made ONCE
  PER PAGE LOAD per Blobbi (`ArrivalIntent` in
  `src/game/world-travel-departure.ts`, `autoArrivalDecision`): never again
  on a frame, a refresh, a reconnect, a relay update or a focus change; a
  tab opened hidden decides the first time it is seen; a reload is a new
  page and may move again; a tab that already decided never reclaims the
  Blobbi by itself, so two tabs cannot ping-pong. The decision is also made
  only while the page is still being opened: within five minutes of its
  navigation start (`ARRIVAL_INTENT_TTL_MS`, `performance.now()`) and while
  it is visible, so an old background tab shown again, or a page left signing
  in for longer, moves nothing by itself (a back/forward-cache restore keeps
  the page's state, so its decision stands). The kit's move waits for the
  signer without a limit, so the page gives it a bounded one
  (`boundedSigner`, 60 s): a prompt left open ends the move as declined, and
  a late approval is dropped before it reaches the kit, so it is never
  published and never a second arrival. A refusal, a timeout or
  unreachable relays move nothing and say so; **Settings > Account > Call
  {name} here** is the explicit retry. An extension that has not confirmed
  the account yet is asked again (`askSignerAgain`) and the move follows once
  it answers, never in silence. Presses in play are activity only (Active
  Presence).
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
  game's moment ends (`presenceBusy`, `presencePaused` in `main.ts`).
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

## The departure: leaving for another world (revised 2026-10-19)

The World Travel menu (Y, WORLDS) lists Blobbi Home and Blobbi Island
(`src/game/blobbi-worlds.ts`). On VISIT, Pixel is the ORIGIN and moves the
Blobbi itself (`src/game/world-travel-departure.ts`, `departTo`, the same
file as Island's and Home's): a fresh read of the canonical location, nothing
when the destination already holds it, else ONE World Location naming the
destination (`buildWorldLocationTemplate`, `departureWindowS: 0`) signed by
the account's own signer (the vault silently, the extension with its prompt)
and published to the travel relays, under the kit's lock name, never over a
newer location (a slow signature re-reads; a newer place is `stale`), moved
once one relay accepted. Meanwhile the teleport departure plays
(`src/game/travel-departure.ts`); the page goes to the destination's PLAIN
address once both are over. A refusal, a timeout or unreachable relays still
go: the destination treats being opened as the same intention and moves the
Blobbi when it loads. Nothing rides in a URL; an old link's
`#blobbi-travel=` fragment is removed unread (`dropLegacyHandoff`), and the
ids older builds kept are deleted (`dropLegacyHandoffStore`). Tests:
`tests/world-travel-departure.test.ts`, `tests/travel-departure.test.ts`,
`tests/travel-menu.test.ts`; browser: `scripts/travel-menu-browser.ts`.

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
  - The session itself (kit 0.11.0) still hears a relay slower than its
    timeout, and backs off its retries (5, 10, 20, 40 and 60 s). An
    `unreachable` place turns into `confirmed` by itself, shown as history.
