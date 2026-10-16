/**
 * The multiplayer prototype's wire messages (PROTOTYPE, `pixel-mp/0`): small JSON objects a room relay forwards to
 * every other player in the same room. Pure: no network, no clock.
 *
 * What travels is only what another player needs to SEE you: which Blobbi (its seed and stage, so the other side
 * draws it from the same genome), where it stands in world pixels, which way it faces, whether it walks, its face.
 * No inventory, no economy, no combat, no key, no signature. Nothing is persistent: a relay keeps nothing, and
 * nothing here is a Nostr event (movement on Nostr would be persistent or need a new kind; see
 * docs/architecture/MULTIPLAYER-PROTOTYPE.md).
 *
 *   hello  { t:'hello', id, name, seed, stage, world }   on joining, and in answer to a newcomer's hello
 *   state  { t:'state', id, seq, x, y, view, facing, moving, face, away }   up to SEND_HZ while moving, a beat while still
 *   bye    { t:'bye', id }                               on leaving on purpose
 *   left   { t:'left', id }                              the relay's word when a socket closes
 *
 * Every message is validated on receipt; anything malformed, oversized or from an unknown version is dropped.
 */
import type { Expression, View } from '../../blobbi/pose';
import { EXPRESSIONS } from '../../blobbi/pose';

export const MP_PROTOCOL = 'pixel-mp/0';
/** A message longer than this is dropped by the relay and by the client. */
export const MAX_MESSAGE_BYTES = 1024;
/** How often a moving player sends its state, at most. */
export const SEND_HZ = 10;
/** A still player's beat, so the others know it is still there. */
export const HEARTBEAT_MS = 1_000;

export type Stage = 'baby' | 'adult';

export interface HelloMessage {
  t: 'hello';
  id: string;
  name: string;
  seed: string;
  stage: Stage;
  /** The world the player is in (a short hash of its identity): a hello from another world is ignored. */
  world: string;
}

export interface StateMessage {
  t: 'state';
  id: string;
  /** Rises with each state a player sends; an older one arriving late is ignored. */
  seq: number;
  x: number;
  y: number;
  view: View;
  facing: -1 | 1;
  moving: boolean;
  face: Expression;
  /** The Blobbi is not standing in the world (teleporting, indoors): the others fade it out. */
  away: boolean;
}

export interface ByeMessage {
  t: 'bye' | 'left';
  id: string;
}

export type MpMessage = HelloMessage | StateMessage | ByeMessage;

const ID = /^[A-Za-z0-9_-]{4,40}$/;
const VIEWS: readonly View[] = ['front', 'back', 'side'];

const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Parse one message, or null for anything that is not a valid `pixel-mp/0` message. */
export function decodeMessage(raw: string): MpMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;
  let m: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    m = v as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof m.id !== 'string' || !ID.test(m.id)) return null;
  switch (m.t) {
    case 'hello': {
      if (typeof m.name !== 'string' || m.name.length > 40) return null;
      if (typeof m.seed !== 'string' || m.seed.length < 1 || m.seed.length > 80) return null;
      if (m.stage !== 'baby' && m.stage !== 'adult') return null;
      if (typeof m.world !== 'string' || !/^[0-9a-z-]{1,40}$/.test(m.world)) return null;
      return { t: 'hello', id: m.id, name: m.name, seed: m.seed, stage: m.stage, world: m.world };
    }
    case 'state': {
      if (!finite(m.seq, 0, Number.MAX_SAFE_INTEGER) || !Number.isInteger(m.seq)) return null;
      if (!finite(m.x, -1e5, 1e5) || !finite(m.y, -1e5, 1e5)) return null;
      if (!VIEWS.includes(m.view as View)) return null;
      if (m.facing !== 1 && m.facing !== -1) return null;
      if (typeof m.moving !== 'boolean' || typeof m.away !== 'boolean') return null;
      if (!EXPRESSIONS.includes(m.face as Expression)) return null;
      return { t: 'state', id: m.id, seq: m.seq, x: m.x, y: m.y, view: m.view as View, facing: m.facing, moving: m.moving, face: m.face as Expression, away: m.away };
    }
    case 'bye':
    case 'left':
      return { t: m.t, id: m.id };
    default:
      return null;
  }
}

/** One message as sent: positions to a tenth of a pixel, so a state stays well under the limit. */
export function encodeMessage(m: MpMessage): string {
  if (m.t === 'state') return JSON.stringify({ ...m, x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 });
  return JSON.stringify(m);
}

/** A room for a world: every player in the same generated world (same identity, same generator) meets in it. */
export function worldRoom(identity: string, generator: string, code = ''): string {
  let h = 0x811c9dc5;
  const s = `${generator}|${identity}|${code}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `w-${h.toString(36)}`;
}
