# Multiplayer prototype (pixel-mp/0)

**Status: a tested PROTOTYPE, for development only.** Two or more players in the same
generated world see each other's Blobbis walk. Nothing else is shared: no inventory,
no economy, no combat, and no matchmaking. Nothing is signed, published or kept.
There is no production server, and a production build never turns it on. It sits
beside [NOSTR-MULTIPLAYER.md](NOSTR-MULTIPLAYER.md) (designed only), and the
choices there that still need approval are listed below.

## Try it

```sh
npm run mp:relay              # the development relay on ws://127.0.0.1:5188
npm run dev                   # the game on http://127.0.0.1:5177
```

Open the same world in two browsers (or a normal and a private window), each with
`&mp=1` at the end of the link. For example, start a world, then copy its address
(it names the world in the hash) and add `&mp=1`. Each sees the other's Blobbi walk,
fading in on arrival and fading out on leaving.

- `&mp=tab` meets between tabs of one browser, with no relay at all
  (BroadcastChannel).
- `&mpcode=friends` makes a private room for the same world.
- `&mprelay=ws://192.168.1.20:5188` points at a relay elsewhere. For a phone on the
  same network, run `npm run mp:relay -- --host 0.0.0.0 --any-origin` and the dev
  server with `--host`.
- The dev handle `window.__blobbi.mp()` is the session: `status`, `sent`,
  `views(performance.now())`.

## How it works

| Part | File | What it does |
|---|---|---|
| Messages | `src/game/multiplayer/protocol.ts` | `hello` (id, name, seed, stage, world), `state` (seq, x, y, view, facing, moving, face, away), `bye`, `left`. JSON, at most 1 KiB, validated on receipt. A room is a hash of the world identity, the generator version and an optional code. |
| Other players | `src/game/multiplayer/remote-players.ts` | Drawn 120 ms in the past, interpolated between states. Late states are dropped. Jumps over 64 px snap. Players fade in (400 ms) and fade out (600 ms) on `bye`/`left`, on `away`, or after 6 s of silence. |
| Session | `src/game/multiplayer/session.ts` | Says `hello` on open and after every reconnect, answers a newcomer at once, sends `state` at most 10 Hz while it changes and once a second while still, and sends `bye` on leaving. |
| Transports | `src/nostr/mp-socket.ts`, `src/game/multiplayer/channel-transport.ts` | A WebSocket to the room relay, which reconnects with backoff (0.5 s doubling to 8 s); or a BroadcastChannel. The socket is in `src/nostr/` because that folder is the repository's network boundary, not because it is Nostr. |
| Relay | `scripts/mp-relay.ts` | Development only, with no dependencies. It forwards each text message to the rest of the room. It holds a socket to its first id, and says `left` when a socket closes. Limits: 1 KiB per message, 30 messages per second, 8 players per room, local origins, and 127.0.0.1 by default. |
| Drawing | `src/render/view-renderer.ts` (`remotes`, `blitAtFaded`) | The other Blobbis are drawn from their own seed and stage at this player's native size, in depth order around this player's Blobbi, under the foreground. A fade is an ordered dither. |
| Host | `src/playground/main.ts` (`stepMultiplayer`) | Joins the current world's room (again when the world or the Blobbi changes), sends this player's pose each frame (rate-limited by the session), shows "A friend arrived" or "A friend left", and leaves on `pagehide`. Indoors, teleporting or visiting counts as away. |

## Why not Nostr for movement

- **Persistent kinds (addressable or replaceable)** would store a stream of
  positions. That is ruled out.
- **An ephemeral kind (20000–29999)** is the right shape (see NOSTR-MULTIPLAYER.md
  §7 T1), but no kind exists for it, and inventing one needs approval. Every
  message would also need a signature: ten per second with a NIP-07 extension is
  ten prompts per second. It would need a session key, which is a change to the
  signing protocol that needs approval.
- The prototype therefore uses no Nostr at all. Identity on the relay is a random
  per-page id. A player's name and seed are self-declared and **unverified**.

## What it does not do (and what is needed first)

- **No authentication.** Anyone who can reach the relay can join a room and claim
  any name or seed. A real service needs a signed proof of the pubkey, such as a
  NIP-42-style challenge like the one blobbi-3d's Rumble server uses (kind 22242).
  That needs approval.
- **No hosting.** The relay is a development tool. Running one publicly needs a
  decision on where to host it, plus TLS, origin rules, abuse limits and logs.
- **No world modifications.** Each player sees their own copy of the world
  (buildings, felled trees). Only the generated base is shared. Sharing
  modifications is NOSTR-MULTIPLAYER.md §3 (world cards).
- **No interaction between players.** There is no shared inventory, economy or
  combat, by design for this slice.
- A remote V1/V2 "world form" Blobbi is drawn from its seed, not from its stored
  traits.

## Recommended next step (needs decisions)

1. Choose the transport for real play: a small hosted relay with NIP-42 auth
   (closest to this prototype), or Nostr ephemeral events with a session key.
2. Choose how a player proves their pubkey, and whether the Blobbi in `hello` must
   be one the pubkey owns (a 31124 the receiver can check).
3. Then: names over the Blobbis, emotes, and the "harbour" (NOSTR-MULTIPLAYER.md §6).

## Tests

- `tests/mp-core.test.ts`: the codec (each kind round-trips, malformed and oversized
  input is dropped); interpolation (monotone, held at the end, late states
  ignored, snaps); fade in and out on join, bye, left, silence, away and return;
  a reconnect met as a newcomer; two sessions meeting before anyone moves; the
  send rate; reconnect; goodbye; the tab transport.
- `tests/mp-relay.test.ts`: over real sockets on 127.0.0.1, rooms are isolated,
  `left` is sent on close, no spoofing, garbage and oversized messages are
  handled, the ninth player, bad room and foreign origin are refused, and a flood
  is limited. Two real sessions join, move and part. The relay dies and comes back
  on the same port, and both reconnect and meet again.
- `tests/mp-render.test.ts`: nothing changes without remotes; a remote is drawn,
  half of it at half alpha and none at zero; a different seed draws a different
  Blobbi; the fade stays in its box.
