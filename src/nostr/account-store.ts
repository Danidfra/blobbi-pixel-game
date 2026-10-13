/**
 * THE REMEMBERED ACCOUNT: one small public record per browser, so a reload keeps the player connected without
 * asking the signer again. It holds only public data — the public key, how it was connected and the cached profile
 * name — never a secret key, a session key or anything a signer could be asked with. It is separate from every
 * island save: writing or removing it never touches one.
 */
import { isPublicKeyHex } from './keys';
import { cleanName } from './profile';
import type { SignerMethod } from './port';

export const ACCOUNT_KEY = 'blobbi-pixel-lab:account';
export const ACCOUNT_VERSION = 1;

/** A key-value store (the browser's localStorage, or a memory store in tests). */
export interface AccountStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface AccountRecord {
  version: typeof ACCOUNT_VERSION;
  pubkey: string;
  method: SignerMethod;
  /** When the player connected (ms). */
  connectedAt: number;
  /** The last profile read: its cleaned name (or null when it had none) and when it was read (ms). */
  profile: { name: string | null; at: number } | null;
}

/** The exact fields a record may have: anything else (and any secret-looking value) makes it invalid. */
const FIELDS = ['version', 'pubkey', 'method', 'connectedAt', 'profile'];

export function loadAccount(store: AccountStore): AccountRecord | null {
  let raw: string | null;
  try {
    raw = store.get(ACCOUNT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== 'object' || Object.keys(v).some((k) => !FIELDS.includes(k))) return null;
    if (v.version !== ACCOUNT_VERSION || !isPublicKeyHex(v.pubkey) || v.method !== 'nip07' || typeof v.connectedAt !== 'number') return null;
    const p = v.profile as Record<string, unknown> | null | undefined;
    const profile = p && typeof p === 'object' && typeof p.at === 'number' ? { name: cleanName(p.name), at: p.at } : null;
    return { version: ACCOUNT_VERSION, pubkey: v.pubkey, method: 'nip07', connectedAt: v.connectedAt, profile };
  } catch {
    return null;
  }
}

export function saveAccount(store: AccountStore, record: AccountRecord): void {
  const clean: AccountRecord = { version: ACCOUNT_VERSION, pubkey: record.pubkey, method: record.method, connectedAt: record.connectedAt, profile: record.profile };
  try {
    store.set(ACCOUNT_KEY, JSON.stringify(clean));
  } catch {
    // A browser that will not store it: the player stays connected until the page closes.
  }
}

export function forgetAccount(store: AccountStore): void {
  try {
    store.remove(ACCOUNT_KEY);
  } catch {
    // Nothing stored, nothing to forget.
  }
}
