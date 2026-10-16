/**
 * The multiplayer prototype's one network connection: a WebSocket to a room relay (PROTOTYPE; this folder is the
 * repository's network boundary, tests/boundaries.test.ts). Not Nostr: no event, no signature, no key, nothing
 * persistent. The relay is the development one (`npm run mp:relay`, scripts/mp-relay.ts); there is no production
 * server, and a production build's CSP would refuse this connection anyway.
 *
 * A dropped connection is retried with backoff (0.5 s doubling to 8 s, with a little jitter) until `close()`;
 * messages sent while it is down are dropped (the session's next beat says where the player is).
 */
import type { MpTransport, TransportStatus } from '../game/multiplayer/session';

export interface SocketOptions {
  /** Test seams. */
  WebSocketImpl?: typeof WebSocket;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  random?: () => number;
}

export const RECONNECT_MS = [500, 1_000, 2_000, 4_000, 8_000] as const;

/** The relay's address for a room: the relay's base URL (ws: or wss:) with the room in the query. */
export function roomUrl(base: string, room: string): string | null {
  try {
    const u = new URL(base);
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
    if (u.username || u.password) return null;
    u.searchParams.set('room', room);
    return u.toString();
  } catch {
    return null;
  }
}

export function socketTransport(url: string, { WebSocketImpl = WebSocket, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>), random = Math.random }: SocketOptions = {}): MpTransport {
  const messageListeners: ((text: string) => void)[] = [];
  const statusListeners: ((s: TransportStatus) => void)[] = [];
  let socket: WebSocket | null = null;
  let attempt = 0;
  let timer: unknown = null;
  let closed = false;
  const status = (s: TransportStatus) => {
    for (const l of statusListeners) l(s);
  };
  const connect = () => {
    timer = null;
    if (closed) return;
    status('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocketImpl(url);
    } catch {
      retry();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws || closed) return;
      attempt = 0;
      status('open');
    };
    ws.onmessage = (e) => {
      if (socket === ws && !closed && typeof e.data === 'string') for (const l of messageListeners) l(e.data);
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      if (closed) return;
      status('closed');
      retry();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  };
  const retry = () => {
    if (closed || timer !== null) return;
    const base = RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)];
    attempt++;
    timer = setTimer(connect, Math.round(base * (0.9 + random() * 0.2)));
  };
  // Connect after the session has subscribed
  timer = setTimer(connect, 0);
  return {
    send(text) {
      if (socket && socket.readyState === 1) socket.send(text);
    },
    onMessage: (l) => void messageListeners.push(l),
    onStatus: (l) => void statusListeners.push(l),
    close() {
      if (closed) return;
      closed = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      const ws = socket;
      socket = null;
      try {
        ws?.close();
      } catch {
        /* already closing */
      }
      status('closed');
    },
  };
}
