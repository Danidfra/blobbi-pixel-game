/**
 * The other players in the room, as this player sees them (PROTOTYPE). Pure: every call takes the time, nothing
 * reads a clock, nothing touches the network or the world.
 *
 * Smooth movement from 10 states a second: each player's last few states are kept with the time they arrived, and a
 * player is drawn INTERP_MS in the past, between the two states around that moment (linear), so a steady stream
 * looks continuous and a late or lost state only shortens a segment. Past the newest state it holds still (no
 * guessing ahead). A jump longer than SNAP_PX (a teleport, a door) is not slid across: it snaps.
 *
 * Coming and going: a player fades in when first seen (FADE_IN_MS), fades out and is removed on `bye`/`left`, on
 * `away` (it fades out and back in where it reappears), and after SILENT_MS without a word (a dropped connection),
 * so a disconnect never leaves a statue behind.
 */
import type { Expression, View } from '../../blobbi/pose';
import type { HelloMessage, MpMessage, Stage, StateMessage } from './protocol';

export const INTERP_MS = 120;
export const SNAP_PX = 64;
export const FADE_IN_MS = 400;
export const FADE_OUT_MS = 600;
export const SILENT_MS = 6_000;
const KEEP = 8;

export interface RemoteView {
  id: string;
  name: string;
  seed: string;
  stage: Stage;
  x: number;
  y: number;
  view: View;
  facing: -1 | 1;
  moving: boolean;
  face: Expression;
  /** 0..1: how much of it shows (fading in or out). */
  alpha: number;
}

interface Sample {
  at: number;
  s: StateMessage;
}

interface Remote {
  hello: HelloMessage;
  samples: Sample[];
  lastSeq: number;
  /** When it was first seen or reappeared (fade in), or null before its first state. */
  shownAt: number | null;
  /** When it began to fade out, and why (`gone` removes it at the end; `away` keeps it for a return). */
  fading: { at: number; gone: boolean } | null;
  heardAt: number;
}

export class RemotePlayers {
  private players = new Map<string, Remote>();

  constructor(
    private readonly self: string,
    private readonly world: string,
  ) {}

  /** Apply one message; returns true for a hello from a player not known before (the caller answers with its own). */
  receive(m: MpMessage, now: number): boolean {
    if (m.id === this.self) return false;
    if (m.t === 'hello') {
      if (m.world !== this.world) return false;
      const known = this.players.get(m.id);
      // Back after leaving (a reconnect, a reload): met again, as a newcomer
      if (known?.fading?.gone) this.players.delete(m.id);
      else if (known) {
        known.hello = m;
        known.heardAt = now;
        return false;
      }
      this.players.set(m.id, { hello: m, samples: [], lastSeq: -1, shownAt: null, fading: null, heardAt: now });
      return true;
    }
    const p = this.players.get(m.id);
    if (!p) return false;
    if (m.t !== 'state') {
      if (!p.fading?.gone) p.fading = { at: now, gone: true };
      return false;
    }
    // A state: only a newer one counts (an older one arriving late is dropped)
    if (m.seq <= p.lastSeq) return false;
    p.lastSeq = m.seq;
    p.heardAt = now;
    if (p.fading?.gone) return false;
    if (m.away) {
      if (!p.fading) p.fading = { at: now, gone: false };
    } else if (p.fading || p.shownAt === null) {
      // First seen, or back from away: fade in where it stands now, with no slide from where it was
      p.fading = null;
      p.shownAt = now;
      p.samples = [];
    }
    p.samples.push({ at: now, s: m });
    if (p.samples.length > KEEP) p.samples.shift();
    return false;
  }

  /** Forget everyone at once (this player left the room). */
  clear(): void {
    this.players.clear();
  }

  /** How many players are in the room besides this one (including those still fading). */
  get size(): number {
    return this.players.size;
  }

  /** The players to draw now, sorted back to front; drops those that have faded away or gone silent. */
  views(now: number): RemoteView[] {
    const out: RemoteView[] = [];
    for (const [id, p] of this.players) {
      if (!p.fading && now - p.heardAt > SILENT_MS) p.fading = { at: now, gone: true };
      if (p.fading?.gone && now - p.fading.at >= FADE_OUT_MS) {
        this.players.delete(id);
        continue;
      }
      if (p.shownAt === null || p.samples.length === 0) continue;
      let alpha = Math.min(1, (now - p.shownAt) / FADE_IN_MS);
      if (p.fading) alpha = Math.min(alpha, Math.max(0, 1 - (now - p.fading.at) / FADE_OUT_MS));
      if (alpha <= 0) continue;
      const pos = positionAt(p.samples, now - INTERP_MS);
      const last = p.samples[p.samples.length - 1].s;
      out.push({ id, name: p.hello.name, seed: p.hello.seed, stage: p.hello.stage, x: pos.x, y: pos.y, view: last.view, facing: last.facing, moving: last.moving && pos.moving, face: last.face, alpha });
    }
    return out.sort((a, b) => a.y - b.y);
  }
}

/** Where a player stands at time `t`, between the two samples around it. */
export function positionAt(samples: readonly Sample[], t: number): { x: number; y: number; moving: boolean } {
  const first = samples[0];
  if (t <= first.at) return { x: first.s.x, y: first.s.y, moving: false };
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (t > b.at) continue;
    // A jump (a teleport, a door): stays where it was until the moment it reappears there, then is there at once
    if (Math.hypot(b.s.x - a.s.x, b.s.y - a.s.y) > SNAP_PX) return t < b.at ? { x: a.s.x, y: a.s.y, moving: false } : { x: b.s.x, y: b.s.y, moving: false };
    const k = b.at === a.at ? 1 : (t - a.at) / (b.at - a.at);
    return { x: a.s.x + (b.s.x - a.s.x) * k, y: a.s.y + (b.s.y - a.s.y) * k, moving: true };
  }
  const last = samples[samples.length - 1];
  return { x: last.s.x, y: last.s.y, moving: false };
}
