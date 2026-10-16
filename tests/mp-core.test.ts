import { describe, expect, it } from 'vitest';
import { HEARTBEAT_MS, MAX_MESSAGE_BYTES, SEND_HZ, decodeMessage, encodeMessage, worldRoom, type StateMessage } from '../src/game/multiplayer/protocol';
import { FADE_IN_MS, FADE_OUT_MS, INTERP_MS, RemotePlayers, SILENT_MS, SNAP_PX } from '../src/game/multiplayer/remote-players';
import { MultiplayerSession, type LocalState, type MpTransport, type TransportStatus } from '../src/game/multiplayer/session';
import { channelTransport, type ChannelLike } from '../src/game/multiplayer/channel-transport';

const WORLD = 'w-abc';
const hello = (id: string, world = WORLD) => ({ t: 'hello' as const, id, name: `n-${id}`, seed: `seed-${id}`, stage: 'adult' as const, world });
const state = (id: string, seq: number, x: number, y: number, extra: Partial<StateMessage> = {}): StateMessage => ({ t: 'state', id, seq, x, y, view: 'side', facing: 1, moving: true, face: 'happy', away: false, ...extra });

describe('the wire messages', () => {
  it('round-trips each kind and rounds positions to a tenth of a pixel', () => {
    expect(decodeMessage(encodeMessage(hello('alice')))).toEqual(hello('alice'));
    expect(decodeMessage(encodeMessage(state('alice', 3, 10.123, 20.987)))).toEqual(state('alice', 3, 10.1, 21));
    expect(decodeMessage(encodeMessage({ t: 'bye', id: 'alice' }))).toEqual({ t: 'bye', id: 'alice' });
    expect(decodeMessage('{"t":"left","id":"alice"}')).toEqual({ t: 'left', id: 'alice' });
  });

  it.each([
    ['not JSON', 'nope'],
    ['an array', '[1]'],
    ['an unknown type', '{"t":"buy","id":"alice"}'],
    ['a bad id', '{"t":"bye","id":"a b"}'],
    ['a NaN position', JSON.stringify({ ...state('alice', 1, 0, 0), x: 'NaN' })],
    ['an unknown face', JSON.stringify({ ...state('alice', 1, 0, 0), face: 'evil' })],
    ['a fractional seq', JSON.stringify({ ...state('alice', 1, 0, 0), seq: 1.5 })],
    ['a bad stage', JSON.stringify({ ...hello('alice'), stage: 'egg' })],
    ['oversized', JSON.stringify({ ...hello('alice'), name: 'x'.repeat(MAX_MESSAGE_BYTES) })],
  ])('drops %s', (_name, raw) => {
    expect(decodeMessage(raw)).toBeNull();
  });

  it('a state is small', () => {
    expect(encodeMessage(state('player-0123456789', 123456, 1234.56, 789.01)).length).toBeLessThan(200);
  });

  it('one room per world and generator; a code makes a private one', () => {
    expect(worldRoom('seed=1|kind=turtle', 'm6.0')).toBe(worldRoom('seed=1|kind=turtle', 'm6.0'));
    expect(worldRoom('seed=1|kind=turtle', 'm6.0')).not.toBe(worldRoom('seed=2|kind=turtle', 'm6.0'));
    expect(worldRoom('seed=1|kind=turtle', 'm6.0')).not.toBe(worldRoom('seed=1|kind=turtle', 'm6.1'));
    expect(worldRoom('seed=1|kind=turtle', 'm6.0', 'friends')).not.toBe(worldRoom('seed=1|kind=turtle', 'm6.0'));
    expect(worldRoom('x', 'y')).toMatch(/^w-[0-9a-z]+$/);
  });
});

describe('the other players: joining, smooth movement, leaving', () => {
  it('a player is drawn only after its hello and a state, fading in', () => {
    const r = new RemotePlayers('me', WORLD);
    expect(r.receive(state('bob', 1, 0, 0), 0)).toBe(false);
    expect(r.views(0)).toEqual([]);
    expect(r.receive(hello('bob'), 0)).toBe(true);
    expect(r.receive(hello('bob'), 1)).toBe(false);
    r.receive(state('bob', 2, 10, 10), 100);
    // Not drawn at all while it is fully transparent
    expect(r.views(100)).toEqual([]);
    expect(r.views(100 + FADE_IN_MS / 2)[0].alpha).toBeCloseTo(0.5);
    expect(r.views(100 + FADE_IN_MS)[0]).toMatchObject({ id: 'bob', name: 'n-bob', seed: 'seed-bob', alpha: 1, x: 10, y: 10 });
  });

  it('ignores itself and players of another world', () => {
    const r = new RemotePlayers('me', WORLD);
    expect(r.receive(hello('me'), 0)).toBe(false);
    expect(r.receive(hello('eve', 'w-other'), 0)).toBe(false);
    expect(r.size).toBe(0);
  });

  it('moves smoothly: drawn INTERP_MS behind, between the states around that moment', () => {
    const r = new RemotePlayers('me', WORLD);
    r.receive(hello('bob'), 0);
    r.receive(state('bob', 1, 0, 0), 1000);
    r.receive(state('bob', 2, 10, 0), 1100);
    r.receive(state('bob', 3, 20, 0), 1200);
    const xs = [1150, 1175, 1200, 1225, 1250, 1275, 1300, 1320].map((t) => r.views(t)[0].x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
    expect(r.views(1150)[0].x).toBeCloseTo(3);
    expect(r.views(1270)[0].x).toBeCloseTo(15);
    // Past the newest state it holds still, and stops walking
    expect(r.views(2000)[0]).toMatchObject({ x: 20, moving: false });
  });

  it('a late, older state is ignored; a long jump snaps instead of sliding', () => {
    const r = new RemotePlayers('me', WORLD);
    r.receive(hello('bob'), 0);
    r.receive(state('bob', 5, 0, 0), 0);
    r.receive(state('bob', 4, 999, 999), 10);
    expect(r.views(500)[0]).toMatchObject({ x: 0, y: 0 });
    r.receive(state('bob', 6, SNAP_PX * 3, 0), 1000);
    r.receive(state('bob', 7, SNAP_PX * 3, 0), 1100);
    expect(r.views(1000 + INTERP_MS / 2)[0].x).toBe(0);
    expect(r.views(1000 + INTERP_MS + 20)[0].x).toBe(SNAP_PX * 3);
  });

  it('a goodbye fades it out and removes it; so does the relay saying it left', () => {
    const r = new RemotePlayers('me', WORLD);
    for (const id of ['bob', 'cat']) {
      r.receive(hello(id), 0);
      r.receive(state(id, 1, 0, 0), 0);
    }
    r.receive({ t: 'bye', id: 'bob' }, 1000);
    r.receive({ t: 'left', id: 'cat' }, 1000);
    expect(r.views(1000 + FADE_OUT_MS / 2).map((v) => v.alpha)).toEqual([0.5, 0.5]);
    expect(r.views(1000 + FADE_OUT_MS)).toEqual([]);
    expect(r.size).toBe(0);
  });

  it('a silent player (a dropped connection) fades and is removed: no statue', () => {
    const r = new RemotePlayers('me', WORLD);
    r.receive(hello('bob'), 0);
    r.receive(state('bob', 1, 0, 0), 0);
    expect(r.views(SILENT_MS - 1)).toHaveLength(1);
    r.views(SILENT_MS + 1);
    expect(r.views(SILENT_MS + 1 + FADE_OUT_MS)).toEqual([]);
    expect(r.size).toBe(0);
  });

  it('away (teleporting, indoors) fades it out, and it fades back in where it reappears', () => {
    const r = new RemotePlayers('me', WORLD);
    r.receive(hello('bob'), 0);
    r.receive(state('bob', 1, 0, 0), 0);
    r.receive(state('bob', 2, 0, 0, { away: true }), 1000);
    expect(r.views(1000 + FADE_OUT_MS)).toEqual([]);
    expect(r.size).toBe(1);
    r.receive(state('bob', 3, 300, 300), 3000);
    expect(r.views(3000 + FADE_IN_MS)[0]).toMatchObject({ x: 300, y: 300, alpha: 1 });
  });

  it('a player back after leaving (a reconnect) is met again as a newcomer', () => {
    const r = new RemotePlayers('me', WORLD);
    r.receive(hello('bob'), 0);
    r.receive(state('bob', 1, 0, 0), 0);
    r.receive({ t: 'left', id: 'bob' }, 100);
    expect(r.receive(hello('bob'), 200)).toBe(true);
    r.receive(state('bob', 2, 5, 5), 200);
    expect(r.views(200 + FADE_IN_MS)[0]).toMatchObject({ x: 5, alpha: 1 });
  });
});

/** A pair of transports wired to each other, with a switch to cut and restore the line. */
function linkedPair() {
  const make = () => {
    const msg: ((t: string) => void)[] = [];
    const st: ((s: TransportStatus) => void)[] = [];
    const sent: string[] = [];
    let peer: { deliver(t: string): void } | null = null;
    let up = false;
    const t: MpTransport & { deliver(t: string): void; set(s: TransportStatus): void; sent: string[]; link(p: { deliver(t: string): void }): void } = {
      sent,
      send: (text) => {
        sent.push(text);
        if (up) peer?.deliver(text);
      },
      onMessage: (l) => void msg.push(l),
      onStatus: (l) => void st.push(l),
      close: () => t.set('closed'),
      deliver: (text) => {
        if (up) for (const l of msg) l(text);
      },
      set: (s) => {
        up = s === 'open';
        for (const l of st) l(s);
      },
      link: (p) => void (peer = p),
    };
    return t;
  };
  const a = make();
  const b = make();
  a.link(b);
  b.link(a);
  return { a, b };
}
const here = (x: number, y = 0, extra: Partial<LocalState> = {}): LocalState => ({ x, y, view: 'side', facing: 1, moving: true, face: 'neutral', away: false, ...extra });

describe('a session: two players meet, move and part', () => {
  it('two players join and each sees the other at once, before anyone moves', () => {
    let now = 0;
    const { a, b } = linkedPair();
    const alice = new MultiplayerSession({ transport: a, self: { id: 'alice', name: 'Alice', seed: 's-a', stage: 'adult', world: WORLD }, now: () => now });
    const bob = new MultiplayerSession({ transport: b, self: { id: 'bob-1', name: 'Bob', seed: 's-b', stage: 'baby', world: WORLD }, now: () => now });
    alice.tick(here(10, 10, { moving: false }), now);
    bob.tick(here(50, 50, { moving: false }), now);
    a.set('open');
    b.set('open');
    now = FADE_IN_MS + 200;
    expect(alice.views(now)).toMatchObject([{ id: 'bob-1', name: 'Bob', seed: 's-b', stage: 'baby', x: 50, y: 50 }]);
    expect(bob.views(now)).toMatchObject([{ id: 'alice', x: 10, y: 10 }]);
  });

  it('sends at most SEND_HZ while moving and a beat while still', () => {
    let now = 0;
    const { a } = linkedPair();
    const alice = new MultiplayerSession({ transport: a, self: { id: 'alice', name: 'A', seed: 's', stage: 'adult', world: WORLD }, now: () => now });
    a.set('open');
    const states = () => a.sent.filter((t) => t.includes('"state"')).length;
    for (now = 0; now < 2000; now += 16) alice.tick(here(now / 10), now);
    expect(states()).toBeLessThanOrEqual(2 * SEND_HZ + 1);
    expect(states()).toBeGreaterThanOrEqual(2 * SEND_HZ - 2);
    const before = states();
    for (now = 2000; now < 7000; now += 16) alice.tick(here(200, 0, { moving: false }), now);
    expect(states() - before).toBeLessThanOrEqual(5000 / HEARTBEAT_MS + 1);
  });

  it('a reconnect says hello again, so the others meet it afresh', () => {
    let now = 0;
    const { a, b } = linkedPair();
    const alice = new MultiplayerSession({ transport: a, self: { id: 'alice', name: 'A', seed: 's', stage: 'adult', world: WORLD }, now: () => now });
    const bob = new MultiplayerSession({ transport: b, self: { id: 'bob-1', name: 'B', seed: 's', stage: 'adult', world: WORLD }, now: () => now });
    alice.tick(here(1), now);
    bob.tick(here(2), now);
    a.set('open');
    b.set('open');
    // Alice's line drops: the relay tells Bob she left
    a.set('closed');
    b.deliver(JSON.stringify({ t: 'left', id: 'alice' }));
    now += FADE_OUT_MS + 10;
    expect(bob.views(now)).toEqual([]);
    a.set('open');
    for (let i = 0; i < 10; i++) {
      now += 50;
      alice.tick(here(3), now);
    }
    now += FADE_IN_MS + 200;
    expect(bob.views(now)).toMatchObject([{ id: 'alice', x: 3 }]);
    expect(alice.status).toBe('open');
  });

  it('leaving says goodbye and the other side fades it out', () => {
    let now = 0;
    const { a, b } = linkedPair();
    const alice = new MultiplayerSession({ transport: a, self: { id: 'alice', name: 'A', seed: 's', stage: 'adult', world: WORLD }, now: () => now });
    const bob = new MultiplayerSession({ transport: b, self: { id: 'bob-1', name: 'B', seed: 's', stage: 'adult', world: WORLD }, now: () => now });
    alice.tick(here(1), now);
    a.set('open');
    b.set('open');
    now = 1000;
    alice.dispose();
    expect(a.sent.at(-1)).toContain('"bye"');
    expect(bob.views(now + FADE_OUT_MS)).toEqual([]);
  });
});

describe('the tab transport (BroadcastChannel)', () => {
  it('opens, carries text between two tabs of the same room and closes', async () => {
    const hub = new Map<string, Set<ChannelLike>>();
    const make = (name: string): ChannelLike => {
      const ch: ChannelLike = {
        onmessage: null,
        postMessage: (data) => {
          for (const other of hub.get(name) ?? []) if (other !== ch) other.onmessage?.({ data });
        },
        close: () => void hub.get(name)?.delete(ch),
      };
      hub.set(name, (hub.get(name) ?? new Set()).add(ch));
      return ch;
    };
    const one = channelTransport('w-1', make);
    const two = channelTransport('w-1', make);
    const other = channelTransport('w-2', make);
    const got: string[] = [];
    const statuses: string[] = [];
    two.onMessage((t) => got.push(`two:${t}`));
    other.onMessage((t) => got.push(`other:${t}`));
    one.onStatus((s) => statuses.push(s));
    await Promise.resolve();
    one.send('hi');
    expect(got).toEqual(['two:hi']);
    one.close();
    one.send('after');
    expect(got).toEqual(['two:hi']);
    expect(statuses).toEqual(['open', 'closed']);
    two.close();
    other.close();
  });
});
