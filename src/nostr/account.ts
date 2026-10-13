/**
 * THE PLAYER'S ACCOUNT (read-only). A small state machine: guest → connecting → connected, and back to guest on
 * disconnect. It asks the signer for a public key only when the player presses CONNECT, remembers that public key
 * (never anything secret) so a reload needs no new prompt, and reads the public profile name from relays at most
 * once every few minutes, only on connect or when the account page asks.
 *
 * Nothing here publishes, signs, encrypts or touches an island: the account is not part of any save.
 */
import { forgetAccount, loadAccount, saveAccount, type AccountRecord, type AccountStore } from './account-store';
import { isPublicKeyHex, npubEncode, shortNpub } from './keys';
import { pickProfile } from './profile';
import { pickBlobbis } from './blobbis';
import type { AccountPort, AccountSnapshot, AccountStatus, BlobbiCollectionPort, CollectionSnapshot, ConnectProblem, ProfileStatus } from './port';
import type { BlobbiReader, ProfileReader } from './relays';
import type { PublicKeySigner } from './signer';

export interface AccountOptions {
  store: AccountStore;
  signer: PublicKeySigner;
  reader: ProfileReader;
  /** M11C: reads the player's canonical Blobbis (kind 31124); without it the collection stays empty. */
  blobbiReader?: BlobbiReader;
  relays: readonly string[];
  now?: () => number;
  /** A profile read this recently is not read again unless forced. */
  profileTtlMs?: number;
  /** How long relays get to answer. */
  readTimeoutMs?: number;
  /** How long the player gets to answer the signer's prompt. */
  connectTimeoutMs?: number;
  /** M11C: a Blobbi list read this recently is not read again unless forced (memory only, never stored). */
  blobbiTtlMs?: number;
}

const EMPTY_COLLECTION: CollectionSnapshot = { status: 'idle', owner: null, items: [], partial: false, skipped: 0, fetchedAt: null };

const TIMEOUT = Symbol('timeout');

export class NostrAccount implements AccountPort, BlobbiCollectionPort {
  private record: AccountRecord | null;
  private status: AccountStatus;
  private problem: ConnectProblem | null = null;
  private profileStatus: ProfileStatus;
  private profileTask: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private readonly now: () => number;
  private collection: CollectionSnapshot = EMPTY_COLLECTION;
  private collectionTask: Promise<void> | null = null;
  private collectionAbort: AbortController | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly opts: AccountOptions) {
    this.now = opts.now ?? Date.now;
    this.record = loadAccount(opts.store);
    this.status = this.record ? 'connected' : 'guest';
    this.profileStatus = this.record?.profile ? 'found' : 'idle';
  }

  snapshot(): AccountSnapshot {
    const r = this.record;
    const npub = r ? npubEncode(r.pubkey) : null;
    return {
      status: this.status,
      pubkey: r?.pubkey ?? null,
      npub,
      npubShort: npub ? shortNpub(npub) : null,
      method: r?.method ?? null,
      displayName: r?.profile?.name ?? null,
      profile: this.profileStatus,
      profileAt: r?.profile?.at ?? null,
      problem: this.problem,
      signerAvailable: this.opts.signer.available(),
      relays: this.opts.relays,
    };
  }

  async connect(): Promise<void> {
    if (this.status === 'connecting') return;
    if (!this.opts.signer.available()) {
      this.problem = 'no-signer';
      this.changed();
      return;
    }
    const before = this.status;
    this.status = 'connecting';
    this.problem = null;
    let answer: unknown;
    try {
      answer = await withTimeout(this.opts.signer.getPublicKey(), this.opts.connectTimeoutMs ?? 60_000);
    } catch (e) {
      this.status = before;
      this.problem = e === TIMEOUT ? 'timeout' : /not available/i.test(String((e as Error)?.message)) ? 'no-signer' : 'rejected';
      this.changed();
      return;
    }
    const pubkey = typeof answer === 'string' && /^[0-9a-fA-F]{64}$/.test(answer) ? answer.toLowerCase() : null;
    if (!pubkey || !isPublicKeyHex(pubkey)) {
      this.status = before;
      this.problem = 'invalid-key';
      this.changed();
      return;
    }
    // The same account keeps its cached profile; another account starts fresh (account switching).
    const same = this.record?.pubkey === pubkey;
    if (!same) {
      this.cancelProfile();
      this.forgetBlobbis();
    }
    this.record = { version: 1, pubkey, method: 'nip07', connectedAt: same ? this.record!.connectedAt : this.now(), profile: same ? this.record!.profile : null };
    if (!same) this.profileStatus = 'idle';
    saveAccount(this.opts.store, this.record);
    this.status = 'connected';
    this.changed();
    void this.refreshProfile(!same);
  }

  /**
   * M11D.4: make a reserved identity of this game's key vault the player's account (after its Blobbi was registered,
   * or restored from a backup). No prompt: the identity is the game's own. Public data only is remembered.
   */
  adoptVaultIdentity(pubkey: string): void {
    if (!isPublicKeyHex(pubkey)) return;
    const same = this.record?.pubkey === pubkey;
    if (!same) {
      this.cancelProfile();
      this.forgetBlobbis();
    }
    this.record = { version: 1, pubkey, method: 'vault', connectedAt: same ? this.record!.connectedAt : this.now(), profile: same ? this.record!.profile : null };
    if (!same) this.profileStatus = 'idle';
    saveAccount(this.opts.store, this.record);
    this.status = 'connected';
    this.problem = null;
    this.changed();
  }

  disconnect(): void {
    this.cancelProfile();
    forgetAccount(this.opts.store);
    this.record = null;
    this.status = 'guest';
    this.problem = null;
    this.profileStatus = 'idle';
    this.forgetBlobbis();
    this.changed();
  }

  refreshProfile(force = false): Promise<void> {
    const r = this.record;
    if (!r || this.status !== 'connected') return Promise.resolve();
    if (this.profileTask) return this.profileTask;
    const fresh = r.profile && this.now() - r.profile.at < (this.opts.profileTtlMs ?? 10 * 60_000);
    if (fresh && !force) return Promise.resolve();
    const pubkey = r.pubkey;
    const abort = (this.abort = new AbortController());
    const timer = setTimeout(() => abort.abort(), this.opts.readTimeoutMs ?? 6000);
    this.profileStatus = 'loading';
    const task = (async () => {
      let status: ProfileStatus;
      let name: string | null = null;
      try {
        const res = await this.opts.reader.readProfile(pubkey, this.opts.relays, abort.signal);
        const picked = pickProfile(res.events, pubkey);
        if (picked.status === 'found') {
          status = 'found';
          name = picked.name;
        } else status = res.reachable === 0 ? 'unavailable' : picked.status;
      } catch {
        status = 'unavailable';
      } finally {
        clearTimeout(timer);
      }
      // The player disconnected or switched account meanwhile: this answer is about someone else now.
      if (abort.signal.aborted && this.abort !== abort) return;
      if (this.record?.pubkey !== pubkey) return;
      this.profileStatus = status;
      if (status === 'found') {
        this.record = { ...this.record, profile: { name, at: this.now() } };
        saveAccount(this.opts.store, this.record);
      } else if (this.record.profile && status !== 'missing') {
        // Relays unreachable or answering nonsense: keep showing the last good name.
        this.profileStatus = 'found';
      }
      this.changed();
    })().finally(() => {
      if (this.profileTask === task) this.profileTask = null;
      if (this.abort === abort) this.abort = null;
    });
    this.profileTask = task;
    return task;
  }

  /** Resolves when no profile or Blobbi read is in flight (tests). */
  async settled(): Promise<void> {
    while (this.profileTask || this.collectionTask) await (this.profileTask ?? this.collectionTask);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    for (const l of [...this.listeners]) {
      try {
        l();
      } catch {
        // A listener's trouble is its own.
      }
    }
  }

  // ─── The player's canonical Blobbis (M11C, read-only) ──────────────────

  blobbis(): CollectionSnapshot {
    const pk = this.record?.pubkey ?? null;
    // Only ever this account's list: anything read for another key is not shown.
    if (this.status !== 'connected' || !pk || (this.collection.owner && this.collection.owner !== pk)) return EMPTY_COLLECTION;
    return this.collection;
  }

  /**
   * Read the connected player's Blobbis from the relays (one REQ per relay, closed after). Never prompts the signer,
   * never during play (only when the MY BLOBBIS screen opens or asks again), at most every few minutes unless forced.
   */
  loadBlobbis(force = false): Promise<void> {
    const r = this.record;
    const reader = this.opts.blobbiReader;
    if (!r || this.status !== 'connected' || !reader) return Promise.resolve();
    if (this.collectionTask) return this.collectionTask;
    const c = this.collection;
    const fresh = c.owner === r.pubkey && c.status === 'ready' && c.fetchedAt !== null && this.now() - c.fetchedAt < (this.opts.blobbiTtlMs ?? 5 * 60_000);
    if (fresh && !force) return Promise.resolve();
    const owner = r.pubkey;
    const abort = (this.collectionAbort = new AbortController());
    const timer = setTimeout(() => abort.abort(), this.opts.readTimeoutMs ?? 8000);
    // Keep showing what was there while looking again.
    this.collection = { ...(c.owner === owner ? c : EMPTY_COLLECTION), owner, status: 'loading' };
    this.changed();
    const task = (async () => {
      let next: CollectionSnapshot;
      try {
        const res = await reader.readBlobbis(owner, this.opts.relays, abort.signal);
        if (res.reachable === 0) next = { ...this.collection, status: 'unavailable', partial: false };
        else {
          const picked = pickBlobbis(res.events, owner);
          next = { status: 'ready', owner, items: picked.items, skipped: picked.skipped, partial: res.reachable < this.opts.relays.length, fetchedAt: this.now() };
        }
      } catch {
        next = { ...this.collection, status: 'unavailable' };
      } finally {
        clearTimeout(timer);
      }
      // Disconnected or switched meanwhile: this answer is about someone else now.
      if (this.collectionAbort !== abort || this.record?.pubkey !== owner) return;
      this.collection = next;
      this.changed();
    })().finally(() => {
      if (this.collectionTask === task) this.collectionTask = null;
      if (this.collectionAbort === abort) this.collectionAbort = null;
    });
    this.collectionTask = task;
    return task;
  }

  private forgetBlobbis(): void {
    this.collectionAbort?.abort();
    this.collectionAbort = null;
    this.collectionTask = null;
    this.collection = EMPTY_COLLECTION;
  }

  private cancelProfile(): void {
    this.abort?.abort();
    this.abort = null;
    this.profileTask = null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(TIMEOUT), ms)))]).finally(() => clearTimeout(timer));
}
