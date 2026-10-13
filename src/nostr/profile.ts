/**
 * PUBLIC PROFILES (kind 0, NIP-01 "user metadata"): checked and cleaned before anything is shown.
 *
 * Relays are untrusted. An event counts only if it is a well-formed kind 0 by exactly the connected public key
 * (signatures are verified by the relay client, `NRelay1`, before an event reaches this module), and its content is
 * a JSON object. Only the name is used: text, never markup (the game draws pixels, there is no HTML to inject into),
 * stripped of control, direction and invisible characters and cut to a short length. Pictures, websites and other
 * links in a profile are never loaded.
 */
import { isPublicKeyHex } from './keys';

/** The fields of a Nostr event this module reads (NIP-01). */
export interface NostrEventLike {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export const MAX_NAME_LENGTH = 24;
/** Bigger metadata is not read at all. */
export const MAX_PROFILE_CONTENT = 32 * 1024;

const HEX = (n: number) => new RegExp(`^[0-9a-f]{${n}}$`);
const ID = HEX(64);
const SIG = HEX(128);

/** Well-formed per NIP-01 (shape only; the signature itself is checked by the relay client). */
export function isWellFormedEvent(e: unknown): e is NostrEventLike {
  if (!e || typeof e !== 'object') return false;
  const v = e as Record<string, unknown>;
  return (
    typeof v.id === 'string' && ID.test(v.id) &&
    isPublicKeyHex(v.pubkey) &&
    typeof v.sig === 'string' && SIG.test(v.sig) &&
    Number.isInteger(v.kind) &&
    Number.isInteger(v.created_at) && (v.created_at as number) >= 0 &&
    typeof v.content === 'string' &&
    Array.isArray(v.tags) && v.tags.every((t) => Array.isArray(t) && t.every((s) => typeof s === 'string'))
  );
}

// Controls (C0, DEL, C1), direction marks and overrides, zero-width and other invisible formatting characters.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f؜᠎​-‏‪-‮⁠-⁯﻿￹-￻]/g;

/** A name made safe to show: one line, no invisible or direction characters, at most `max` characters. */
export function cleanName(raw: unknown, max = MAX_NAME_LENGTH): string | null {
  if (typeof raw !== 'string') return null;
  const flat = raw.normalize('NFC').replace(UNSAFE, '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  const chars = [...flat];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : flat;
}

export type ProfileResult = { ok: true; name: string | null; createdAt: number } | { ok: false; reason: 'wrong-kind' | 'wrong-author' | 'malformed' | 'too-big' | 'not-json' };

/** Read one kind 0 event for `pubkey`. A valid profile may have no usable name (`name: null`). */
export function parseProfile(event: unknown, pubkey: string): ProfileResult {
  if (!isWellFormedEvent(event)) return { ok: false, reason: 'malformed' };
  if (event.kind !== 0) return { ok: false, reason: 'wrong-kind' };
  if (event.pubkey !== pubkey) return { ok: false, reason: 'wrong-author' };
  if (event.content.length > MAX_PROFILE_CONTENT) return { ok: false, reason: 'too-big' };
  let meta: unknown;
  try {
    meta = JSON.parse(event.content);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return { ok: false, reason: 'not-json' };
  const m = meta as Record<string, unknown>;
  // NIP-24 `display_name` first, then the older `displayName`, then `name`.
  const name = cleanName(m.display_name) ?? cleanName(m.displayName) ?? cleanName(m.name);
  return { ok: true, name, createdAt: event.created_at };
}

/**
 * The profile to show from what several relays returned: the newest valid one by the author (ties broken by id, as
 * NIP-01 says for replaceable events). `invalid` when events came back but none was valid; `missing` when none came.
 */
export function pickProfile(events: readonly unknown[], pubkey: string): { status: 'found'; name: string | null; createdAt: number } | { status: 'missing' | 'invalid' } {
  let best: { name: string | null; createdAt: number; id: string } | null = null;
  for (const e of events) {
    const r = parseProfile(e, pubkey);
    if (!r.ok) continue;
    const id = (e as NostrEventLike).id;
    if (!best || r.createdAt > best.createdAt || (r.createdAt === best.createdAt && id < best.id)) best = { name: r.name, createdAt: r.createdAt, id };
  }
  if (best) return { status: 'found', name: best.name, createdAt: best.createdAt };
  return { status: events.length ? 'invalid' : 'missing' };
}
