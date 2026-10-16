/**
 * The development room relay end to end, over real sockets on 127.0.0.1: players in a room hear each other and no
 * one else; a closed socket is announced; the limits hold; and the game's own socket transport, with two real
 * sessions on it, survives the relay going away and coming back (it reconnects and the players meet again).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_MESSAGE_BYTES, ROOM_LIMIT, startMpRelay, type Relay } from '../scripts/mp-relay';
import { roomUrl, socketTransport } from '../src/nostr/mp-socket';
import { MultiplayerSession, type LocalState } from '../src/game/multiplayer/session';
import { FADE_IN_MS } from '../src/game/multiplayer/remote-players';

const relays: Relay[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  for (const r of relays.splice(0)) await r.close();
});

async function relay(port = 0): Promise<Relay> {
  const r = await startMpRelay({ port });
  relays.push(r);
  return r;
}
const until = async (ok: () => boolean, ms = 5_000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};
function client(r: Relay, room: string, headers?: Record<string, string>) {
  const ws = new WebSocket(`ws://127.0.0.1:${r.port}/?room=${room}`, headers ? ({ headers } as unknown as string[]) : undefined);
  sockets.push(ws);
  const got: string[] = [];
  ws.onmessage = (e) => got.push(String(e.data));
  const open = new Promise<void>((ok, fail) => {
    ws.onopen = () => ok();
    ws.onerror = () => fail(new Error('refused'));
  });
  return { ws, got, open };
}

describe('the room relay (development only)', () => {
  it('forwards a message to the others in the room, never back, never to another room', async () => {
    const r = await relay();
    const a = client(r, 'w-1');
    const b = client(r, 'w-1');
    const c = client(r, 'w-2');
    await Promise.all([a.open, b.open, c.open]);
    a.ws.send('{"t":"hello","id":"alice"}');
    await until(() => b.got.length === 1);
    await new Promise((res) => setTimeout(res, 100));
    expect(b.got).toEqual(['{"t":"hello","id":"alice"}']);
    expect(a.got).toEqual([]);
    expect(c.got).toEqual([]);
    expect(r.rooms()).toEqual({ 'w-1': 2, 'w-2': 1 });
  });

  it('announces a closed socket to its room with the id it spoke as', async () => {
    const r = await relay();
    const a = client(r, 'w-1');
    const b = client(r, 'w-1');
    await Promise.all([a.open, b.open]);
    a.ws.send('{"t":"state","id":"alice"}');
    await until(() => b.got.length === 1);
    a.ws.close();
    await until(() => b.got.length === 2);
    expect(JSON.parse(b.got[1])).toEqual({ t: 'left', id: 'alice' });
    await until(() => r.rooms()['w-1'] === 1);
  });

  it('one socket cannot speak for another id; garbage goes nowhere; an oversized message closes the socket', async () => {
    const r = await relay();
    const a = client(r, 'w-1');
    const b = client(r, 'w-1');
    await Promise.all([a.open, b.open]);
    a.ws.send('{"t":"hello","id":"alice"}');
    a.ws.send('{"t":"hello","id":"mallory"}');
    a.ws.send('not json');
    a.ws.send('[1,2]');
    a.ws.send(JSON.stringify({ id: 'alice', pad: 'x'.repeat(MAX_MESSAGE_BYTES) }));
    await until(() => b.got.length === 2);
    // Only its first id's hello was forwarded; the oversized one never was: the relay closed that socket instead
    expect(b.got).toEqual(['{"t":"hello","id":"alice"}', '{"t":"left","id":"alice"}']);
  });

  it('refuses a ninth player, a bad room and a page from another site', async () => {
    const r = await relay();
    const members = Array.from({ length: ROOM_LIMIT }, () => client(r, 'w-full'));
    await Promise.all(members.map((m) => m.open));
    await expect(client(r, 'w-full').open).rejects.toThrow();
    await expect(client(r, 'BAD ROOM').open).rejects.toThrow();
    await expect(client(r, 'w-1', { origin: 'https://evil.example' }).open).rejects.toThrow();
    await client(r, 'w-1', { origin: 'http://127.0.0.1:5177' }).open;
  });

  it('drops a flood: no more than its rate gets through', async () => {
    const r = await relay();
    const a = client(r, 'w-1');
    const b = client(r, 'w-1');
    await Promise.all([a.open, b.open]);
    for (let i = 0; i < 200; i++) a.ws.send(`{"t":"state","id":"alice","seq":${i}}`);
    await new Promise((res) => setTimeout(res, 300));
    expect(b.got.length).toBeLessThan(60);
    expect(b.got.length).toBeGreaterThan(0);
  });
});

const here = (x: number): LocalState => ({ x, y: 0, view: 'side', facing: 1, moving: true, face: 'neutral', away: false });

describe('two players over the relay with the game\'s own transport', () => {
  it('join, move, see each other move, and part', async () => {
    const r = await relay();
    const url = roomUrl(`ws://127.0.0.1:${r.port}`, 'w-play')!;
    const self = (id: string) => ({ id, name: id, seed: `seed-${id}`, stage: 'adult' as const, world: 'w-play' });
    const alice = new MultiplayerSession({ transport: socketTransport(url), self: self('alice'), now: () => Date.now() });
    const bob = new MultiplayerSession({ transport: socketTransport(url), self: self('bob-1'), now: () => Date.now() });
    alice.tick(here(0), Date.now());
    bob.tick(here(100), Date.now());
    await until(() => alice.status === 'open' && bob.status === 'open');
    await until(() => bob.views(Date.now()).length === 1 && alice.views(Date.now()).length === 1);
    for (let x = 0; x <= 40; x += 2) {
      alice.tick(here(x), Date.now());
      await new Promise((res) => setTimeout(res, 25));
    }
    await until(() => (bob.views(Date.now())[0]?.x ?? 0) >= 39);
    alice.dispose();
    await until(() => bob.views(Date.now()).length === 0);
    bob.dispose();
  }, 20_000);

  it('the relay going away and coming back: both reconnect and meet again', async () => {
    const first = await relay();
    const port = first.port;
    const url = roomUrl(`ws://127.0.0.1:${port}`, 'w-play')!;
    const self = (id: string) => ({ id, name: id, seed: `seed-${id}`, stage: 'adult' as const, world: 'w-play' });
    const statuses: string[] = [];
    const ta = socketTransport(url);
    ta.onStatus((s) => statuses.push(s));
    const alice = new MultiplayerSession({ transport: ta, self: self('alice'), now: () => Date.now() });
    const bob = new MultiplayerSession({ transport: socketTransport(url), self: self('bob-1'), now: () => Date.now() });
    alice.tick(here(5), Date.now());
    bob.tick(here(6), Date.now());
    await until(() => bob.views(Date.now()).length === 1);
    // The relay dies
    await first.close();
    relays.splice(relays.indexOf(first), 1);
    await until(() => alice.status !== 'open' && bob.status !== 'open');
    // ... and comes back on the same port
    await relay(port);
    await until(() => alice.status === 'open' && bob.status === 'open', 15_000);
    await new Promise((res) => setTimeout(res, FADE_IN_MS + 300));
    for (let i = 0; i < 5; i++) {
      alice.tick(here(7 + i), Date.now());
      bob.tick(here(8), Date.now());
      await new Promise((res) => setTimeout(res, 120));
    }
    await until(() => bob.views(Date.now()).length === 1 && alice.views(Date.now()).length === 1, 5_000);
    expect(statuses).toContain('closed');
    expect(statuses.filter((s) => s === 'open').length).toBeGreaterThanOrEqual(2);
    alice.dispose();
    bob.dispose();
  }, 30_000);

  it('roomUrl accepts only ws: and wss: without credentials', () => {
    expect(roomUrl('ws://127.0.0.1:5188', 'w-1')).toBe('ws://127.0.0.1:5188/?room=w-1');
    expect(roomUrl('wss://relay.example/mp', 'w-1')).toBe('wss://relay.example/mp?room=w-1');
    expect(roomUrl('http://127.0.0.1:5188', 'w-1')).toBeNull();
    expect(roomUrl('ws://u:p@127.0.0.1', 'w-1')).toBeNull();
    expect(roomUrl('nonsense', 'w-1')).toBeNull();
  });
});
