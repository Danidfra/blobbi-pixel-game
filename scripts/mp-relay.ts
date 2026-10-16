/**
 * The multiplayer prototype's room relay, FOR DEVELOPMENT ONLY (`npm run mp:relay`). Never deployed: it has no
 * authentication, keeps nothing, and trusts every player to say who it is.
 *
 * A WebSocket server with no dependencies (Node's http plus the RFC 6455 framing a browser speaks): a client joins
 * a room with `ws://host:port/?room=<id>`, and every text message it sends is forwarded, as it is, to the other
 * sockets in that room. When a socket closes, the room hears `{"t":"left","id":…}` for the id it spoke as.
 *
 * Limits: a message is at most 1 KiB and must be a JSON object with a string `id` (the first id a socket uses is the
 * only one it may use, so one player cannot speak for another through this relay); 30 messages a second per
 * socket (more are dropped); 8 players a room; origins from this machine only unless `--any-origin`; it listens on
 * 127.0.0.1 unless `--host` says otherwise (a phone on the same network needs `--host 0.0.0.0 --any-origin`).
 */
import { createServer, type IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';

export const MAX_MESSAGE_BYTES = 1024;
export const ROOM_LIMIT = 8;
export const RATE_PER_SECOND = 30;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const ROOM = /^[0-9a-z-]{1,40}$/;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export interface RelayOptions {
  port?: number;
  host?: string;
  /** Which page origins may join (default: pages served from this machine, and clients that send none). */
  allowOrigin?: (origin: string | undefined) => boolean;
  log?: (line: string) => void;
}

export interface Relay {
  port: number;
  /** How many sockets each room holds now. */
  rooms(): Record<string, number>;
  close(): Promise<void>;
}

interface Client {
  socket: Duplex;
  room: string;
  id: string | null;
  buffer: Buffer;
  tokens: number;
  refilledAt: number;
  closed: boolean;
}

function frame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x80 | opcode, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
  return Buffer.concat([head, payload]);
}

export function startMpRelay({ port = 5188, host = '127.0.0.1', allowOrigin = (o) => !o || LOCAL_ORIGIN.test(o), log = () => {} }: RelayOptions = {}): Promise<Relay> {
  const rooms = new Map<string, Set<Client>>();
  const sockets = new Set<Duplex>();

  const send = (c: Client, text: string) => {
    if (!c.closed) c.socket.write(frame(0x1, Buffer.from(text, 'utf8')));
  };
  const shut = (c: Client, code = 1000) => {
    if (c.closed) return;
    c.closed = true;
    const b = Buffer.alloc(2);
    b.writeUInt16BE(code);
    try {
      c.socket.end(frame(0x8, b));
    } catch {
      /* gone */
    }
    const members = rooms.get(c.room);
    members?.delete(c);
    if (members && members.size === 0) rooms.delete(c.room);
    if (c.id && members) for (const other of members) send(other, JSON.stringify({ t: 'left', id: c.id }));
    log(`left ${c.room} ${c.id ?? '-'}`);
  };
  const onText = (c: Client, text: string) => {
    // The rate: a bucket of RATE_PER_SECOND tokens, refilled continuously
    const now = Date.now();
    c.tokens = Math.min(RATE_PER_SECOND, c.tokens + ((now - c.refilledAt) / 1000) * RATE_PER_SECOND);
    c.refilledAt = now;
    if (c.tokens < 1) return;
    c.tokens -= 1;
    let id: unknown;
    try {
      const v = JSON.parse(text) as { id?: unknown };
      id = v && typeof v === 'object' && !Array.isArray(v) ? v.id : undefined;
    } catch {
      return;
    }
    if (typeof id !== 'string' || id.length > 40) return;
    if (c.id === null) c.id = id;
    else if (c.id !== id) return;
    for (const other of rooms.get(c.room) ?? []) if (other !== c) send(other, text);
  };
  const onData = (c: Client, chunk: Buffer) => {
    c.buffer = Buffer.concat([c.buffer, chunk]);
    for (;;) {
      const b = c.buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let at = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE_BYTES)) return shut(c, 1009);
        len = Number(big);
        at = 10;
      }
      // A client must mask (RFC 6455 5.1); a message too long, or in pieces, is refused
      if (!masked) return shut(c, 1002);
      if (len > MAX_MESSAGE_BYTES) return shut(c, 1009);
      if (b.length < at + 4 + len) return;
      const mask = b.subarray(at, at + 4);
      const payload = Buffer.alloc(len);
      for (let i = 0; i < len; i++) payload[i] = b[at + 4 + i] ^ mask[i & 3];
      c.buffer = b.subarray(at + 4 + len);
      if (opcode === 0x8) return shut(c);
      if (opcode === 0x9) {
        c.socket.write(frame(0xa, payload));
        continue;
      }
      if (opcode === 0xa) continue;
      if (!fin || opcode === 0x0 || opcode === 0x2) return shut(c, 1003);
      if (opcode === 0x1) onText(c, payload.toString('utf8'));
    }
  };
  const refuse = (socket: Duplex, status: string) => {
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  };

  const server = createServer((_req, res) => {
    res.writeHead(426, { 'content-type': 'text/plain' });
    res.end('Blobbi Pixel multiplayer relay (development only): connect with a WebSocket.\n');
  });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const key = req.headers['sec-websocket-key'];
    const room = new URL(req.url ?? '/', 'http://relay').searchParams.get('room') ?? '';
    if (typeof key !== 'string' || req.headers.upgrade?.toLowerCase() !== 'websocket') return refuse(socket, '400 Bad Request');
    if (!allowOrigin(req.headers.origin)) return refuse(socket, '403 Forbidden');
    if (!ROOM.test(room)) return refuse(socket, '400 Bad Request');
    const members = rooms.get(room) ?? new Set<Client>();
    if (members.size >= ROOM_LIMIT) return refuse(socket, '503 Service Unavailable');
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const c: Client = { socket, room, id: null, buffer: Buffer.alloc(0), tokens: RATE_PER_SECOND, refilledAt: Date.now(), closed: false };
    members.add(c);
    rooms.set(room, members);
    log(`joined ${room} (${members.size})`);
    socket.on('data', (chunk: Buffer) => onData(c, chunk));
    socket.on('close', () => shut(c));
    socket.on('error', () => shut(c));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        port: typeof address === 'object' && address ? address.port : port,
        rooms: () => Object.fromEntries([...rooms].map(([r, m]) => [r, m.size])),
        close: () =>
          new Promise<void>((done) => {
            for (const s of sockets) s.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}

// Run directly: `npm run mp:relay -- [--port 5188] [--host 127.0.0.1] [--any-origin]`
if (process.argv[1] && /mp-relay\.ts$/.test(process.argv[1])) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const anyOrigin = process.argv.includes('--any-origin');
  startMpRelay({ port: Number(arg('--port') ?? 5188), host: arg('--host') ?? '127.0.0.1', allowOrigin: anyOrigin ? () => true : undefined, log: (l) => console.log(`[mp-relay] ${l}`) }).then((r) => {
    console.log(`[mp-relay] development relay on ws://${arg('--host') ?? '127.0.0.1'}:${r.port}/?room=<id> (no auth, keeps nothing; never deploy)`);
  });
}
