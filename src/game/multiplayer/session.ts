/**
 * One player's multiplayer session (PROTOTYPE): says hello when the transport opens (and again after a reconnect),
 * answers a newcomer's hello so it sees this player at once, sends this player's state at most SEND_HZ while it
 * changes and a beat while it is still, and keeps the other players (`RemotePlayers`). No network of its own: the
 * transport is handed in (a WebSocket to a room relay, src/nostr/mp-socket.ts; or a BroadcastChannel between tabs,
 * channel-transport.ts). Pure apart from what the transport does: the time is passed in.
 */
import { HEARTBEAT_MS, SEND_HZ, decodeMessage, encodeMessage, type HelloMessage, type MpMessage, type StateMessage } from './protocol';
import { RemotePlayers, type RemoteView } from './remote-players';

export type TransportStatus = 'connecting' | 'open' | 'closed';

export interface MpTransport {
  send(text: string): void;
  onMessage(listener: (text: string) => void): void;
  onStatus(listener: (status: TransportStatus) => void): void;
  close(): void;
}

/** What this player shows of itself each frame; null while there is no world in play. */
export type LocalState = Omit<StateMessage, 't' | 'id' | 'seq'>;

export interface SessionOptions {
  transport: MpTransport;
  self: Omit<HelloMessage, 't'>;
  now: () => number;
}

const MIN_GAP_MS = 1000 / SEND_HZ;

export class MultiplayerSession {
  readonly remotes: RemotePlayers;
  status: TransportStatus = 'connecting';
  /** How many messages this player has sent (tests and the dev overlay). */
  sent = 0;
  private seq = 0;
  private lastSent: { at: number; state: LocalState } | null = null;
  private latest: LocalState | null = null;
  private disposed = false;

  constructor(private readonly opts: SessionOptions) {
    this.remotes = new RemotePlayers(opts.self.id, opts.self.world);
    opts.transport.onStatus((s) => {
      if (this.disposed) return;
      this.status = s;
      if (s === 'open') {
        // Met afresh: everyone learns who this is, and where it stands now
        this.lastSent = null;
        this.post({ t: 'hello', ...opts.self });
        this.flush(opts.now(), true);
      }
    });
    opts.transport.onMessage((text) => {
      if (this.disposed) return;
      const m = decodeMessage(text);
      if (!m) return;
      const now = opts.now();
      if (this.remotes.receive(m, now)) {
        // A newcomer: tell it who this is and where it stands, without waiting for the next move
        this.post({ t: 'hello', ...opts.self });
        this.flush(now, true);
      }
    });
  }

  /** Called each frame with this player's state: sends it when it changed (at most SEND_HZ) or when a beat is due. */
  tick(local: LocalState | null, now: number): void {
    if (this.disposed) return;
    this.latest = local;
    this.flush(now, false);
  }

  /** The other players to draw now. */
  views(now: number): RemoteView[] {
    return this.remotes.views(now);
  }

  /** Leave on purpose: a goodbye, then the transport closes. */
  dispose(): void {
    if (this.disposed) return;
    if (this.status === 'open') this.post({ t: 'bye', id: this.opts.self.id });
    this.disposed = true;
    this.remotes.clear();
    this.opts.transport.close();
  }

  private flush(now: number, force: boolean): void {
    const local = this.latest;
    if (this.status !== 'open' || !local) return;
    const last = this.lastSent;
    if (!force && last) {
      const gap = now - last.at;
      const changed = Math.abs(local.x - last.state.x) > 0.25 || Math.abs(local.y - last.state.y) > 0.25 || local.view !== last.state.view || local.facing !== last.state.facing || local.moving !== last.state.moving || local.face !== last.state.face || local.away !== last.state.away;
      if (changed ? gap < MIN_GAP_MS : gap < HEARTBEAT_MS) return;
    }
    this.lastSent = { at: now, state: { ...local } };
    this.post({ t: 'state', id: this.opts.self.id, seq: ++this.seq, ...local });
  }

  private post(m: MpMessage): void {
    try {
      this.opts.transport.send(encodeMessage(m));
      this.sent++;
    } catch {
      /* a transport that cannot send now: the next beat tries again */
    }
  }
}
