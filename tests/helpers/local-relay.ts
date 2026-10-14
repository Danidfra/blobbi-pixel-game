/**
 * M11D.6, A DISPOSABLE LOCAL RELAY for tests: a tiny NIP-01 relay on 127.0.0.1 (node's own http server and a
 * minimal WebSocket framing, no package), so the game's REAL relay code (`relayPublisher`, Nostrify `NRelay1`) can be
 * exercised end to end without any public relay. Nothing it holds leaves the test process.
 *
 * It verifies signatures, keeps replaceable events as NIP-01 says (newest created_at, lowest id on a tie), answers
 * REQ with EVENTs and EOSE, and can misbehave on purpose:
 *   ok        accepts and keeps (the default)
 *   refuse    OK false "blocked: ..."
 *   silent    never answers an EVENT (a timeout)
 *   forget    OK true, but keeps nothing (a relay that loses events)
 */
import { createServer, type IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';
import type { AddressInfo } from 'node:net';
import { verifyEvent, type NostrEvent } from 'nostr-tools/pure';

export type RelayBehaviour = 'ok' | 'refuse' | 'silent' | 'forget';

export interface LocalRelay {
  url: string;
  events: NostrEvent[];
  /** Every EVENT message received (also refused ones). */
  received: NostrEvent[];
  behaviour: RelayBehaviour;
  close(): Promise<void>;
}

interface Filter {
  kinds?: number[];
  authors?: string[];
  '#d'?: string[];
  limit?: number;
}

const matches = (e: NostrEvent, f: Filter) => (!f.kinds || f.kinds.includes(e.kind)) && (!f.authors || f.authors.includes(e.pubkey)) && (!f['#d'] || e.tags.some((t) => t[0] === 'd' && f['#d']!.includes(t[1])));
const keyOf = (e: NostrEvent) => (e.kind === 0 || (e.kind >= 10000 && e.kind < 20000) ? `${e.kind}|${e.pubkey}` : e.kind >= 30000 && e.kind < 40000 ? `${e.kind}|${e.pubkey}|${e.tags.find((t) => t[0] === 'd')?.[1] ?? ''}` : e.id);

/** One text frame, server to client (never masked). */
function frame(text: string, opcode = 1): Buffer {
  const data = Buffer.from(text);
  const head = data.length < 126 ? Buffer.from([0x80 | opcode, data.length]) : data.length < 65536 ? Buffer.from([0x80 | opcode, 126, data.length >> 8, data.length & 255]) : Buffer.concat([Buffer.from([0x80 | opcode, 127]), Buffer.from(new BigUint64Array([BigInt(data.length)]).buffer).reverse()]);
  return Buffer.concat([head, data]);
}

export async function startLocalRelay(behaviour: RelayBehaviour = 'ok'): Promise<LocalRelay> {
  const relay: LocalRelay = { url: '', events: [], received: [], behaviour, close: async () => {} };
  const sockets = new Set<Duplex>();
  const server = createServer((_req, res) => res.writeHead(426).end());
  server.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
    const key = req.headers['sec-websocket-key'];
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
    const send = (msg: unknown[]) => socket.writable && socket.write(frame(JSON.stringify(msg)));
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        const opcode = buf[0] & 15;
        let len = buf[1] & 127;
        let at = 2;
        if (len === 126) {
          if (buf.length < 4) return;
          len = buf.readUInt16BE(2);
          at = 4;
        } else if (len === 127) {
          if (buf.length < 10) return;
          len = Number(buf.readBigUInt64BE(2));
          at = 10;
        }
        const masked = (buf[1] & 128) !== 0;
        const mask = masked ? buf.subarray(at, at + 4) : null;
        if (masked) at += 4;
        if (buf.length < at + len) return;
        const payload = Buffer.from(buf.subarray(at, at + len));
        if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        buf = buf.subarray(at + len);
        if (opcode === 8) {
          socket.write(frame('', 8));
          socket.end();
          return;
        }
        if (opcode === 9) socket.write(frame(payload.toString(), 10));
        if (opcode === 1) handle(JSON.parse(payload.toString()) as unknown[], send);
      }
    });
  });
  const handle = (msg: unknown[], send: (m: unknown[]) => unknown) => {
    if (msg[0] === 'EVENT') {
      const e = msg[1] as NostrEvent;
      relay.received.push(e);
      if (relay.behaviour === 'silent') return;
      if (!verifyEvent(e)) return void send(['OK', e.id, false, 'invalid: bad signature']);
      if (relay.behaviour === 'refuse') return void send(['OK', e.id, false, 'blocked: not on this relay']);
      if (relay.events.some((x) => x.id === e.id)) return void send(['OK', e.id, true, 'duplicate: already have this event']);
      if (relay.behaviour === 'ok') {
        const i = relay.events.findIndex((x) => keyOf(x) === keyOf(e));
        if (i < 0) relay.events.push(e);
        else if (relay.events[i].created_at < e.created_at || (relay.events[i].created_at === e.created_at && e.id < relay.events[i].id)) relay.events[i] = e;
      }
      return void send(['OK', e.id, true, '']);
    }
    if (msg[0] === 'REQ') {
      const [, sub, ...filters] = msg as [string, string, ...Filter[]];
      for (const f of filters) {
        const found = relay.events.filter((e) => matches(e, f)).sort((a, b) => b.created_at - a.created_at);
        for (const e of found.slice(0, f.limit ?? found.length)) send(['EVENT', sub, e]);
      }
      send(['EOSE', sub]);
    }
  };
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  relay.url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  relay.close = () =>
    new Promise<void>((r) => {
      for (const s of sockets) s.destroy();
      server.close(() => r());
    });
  return relay;
}
