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
import type { AccountPort, AccountSnapshot, AccountStatus, ConnectProblem, ProfileStatus } from './port';
import type { ProfileReader } from './relays';
import type { PublicKeySigner } from './signer';

export interface AccountOptions {
  store: AccountStore;
  signer: PublicKeySigner;
  reader: ProfileReader;
  relays: readonly string[];
  now?: () => number;
  /** A profile read this recently is not read again unless forced. */
  profileTtlMs?: number;
  /** How long relays get to answer. */
  readTimeoutMs?: number;
  /** How long the player gets to answer the signer's prompt. */
  connectTimeoutMs?: number;
}

const TIMEOUT = Symbol('timeout');

export class NostrAccount implements AccountPort {
  private record: AccountRecord | null;
  private status: AccountStatus;
  private problem: ConnectProblem | null = null;
  private profileStatus: ProfileStatus;
  private profileTask: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private readonly now: () => number;

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
      return;
    }
    const pubkey = typeof answer === 'string' && /^[0-9a-fA-F]{64}$/.test(answer) ? answer.toLowerCase() : null;
    if (!pubkey || !isPublicKeyHex(pubkey)) {
      this.status = before;
      this.problem = 'invalid-key';
      return;
    }
    // The same account keeps its cached profile; another account starts fresh (account switching).
    const same = this.record?.pubkey === pubkey;
    if (!same) this.cancelProfile();
    this.record = { version: 1, pubkey, method: 'nip07', connectedAt: same ? this.record!.connectedAt : this.now(), profile: same ? this.record!.profile : null };
    if (!same) this.profileStatus = 'idle';
    saveAccount(this.opts.store, this.record);
    this.status = 'connected';
    void this.refreshProfile(!same);
  }

  disconnect(): void {
    this.cancelProfile();
    forgetAccount(this.opts.store);
    this.record = null;
    this.status = 'guest';
    this.problem = null;
    this.profileStatus = 'idle';
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
    })().finally(() => {
      if (this.profileTask === task) this.profileTask = null;
      if (this.abort === abort) this.abort = null;
    });
    this.profileTask = task;
    return task;
  }

  /** Resolves when no profile read is in flight (tests). */
  async settled(): Promise<void> {
    while (this.profileTask) await this.profileTask;
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
