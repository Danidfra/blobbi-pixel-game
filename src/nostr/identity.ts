/**
 * M11D.4, RESERVED IDENTITIES: the service behind the `IdentityPort`. It ties together the key vault (secrets, sealed),
 * the public Blobbi records (`game/guest-blobbis.ts`), the secret backup file (`backup.ts`) and registration
 * (`activation.ts`). The UI and the game only ever see public data and finished files through the port.
 *
 *   reserve(guest)    a new keypair in the vault, then a petId (the kit's `generatePetId10`) and the kit's canonical
 *                     d: the Blobbi's V3 look is fixed by (owner, d) from this moment; nothing is signed or published
 *   reserve(account)  the same Blobbi facts under the player's existing account (no key made)
 *   backups           made, verified (loaded back and opened), previewed and restored; restoring never overwrites an
 *                     identity or a Blobbi already here and never publishes
 *   register          explicit consent, a verified backup (guest), then `activate` (resumable, idempotent)
 *   findShared        M11D.7: after a restore, the identity's Blobbis already shared, read back from the relays (read only)
 */
import { generatePetId10 } from '@blobbi-kit/core';
import type { KeyValueStore } from '../game/persistence';
import { addGuestBlobbi, chooseGuestName, guestBlobbi, readGuestBlobbis, suggestedName, updateGuestBlobbi, type GuestBlobbi } from '../game/guest-blobbis';
import { KeyVault, VaultError, askPersistentStorage } from './keystore';
import { backupFileName, buildBackupFile, parseBackupFile, recoveryFileName } from './backup';
import { activate, activationRun, ActivationError, adoptFoundBlobbi, finishActivation, ownerRuns } from './activation';
import { canonicalD } from './canonical-events';
import type { Publisher } from './publisher';
import type { BackupKind, BackupPreview, IdentityPort, IdentityProblem, IdentityResult, RegistrationState, ReservedBlobbi, SharedSearch, ShareStatus } from './port';
import { pickBlobbis } from './blobbis';
import type { BlobbiReader, ProfileReadResult } from './relays';
import { npubEncode, shortNpub } from './keys';
import type { EventTemplate } from './canonical-events';
import type { NostrEvent } from 'nostr-tools/pure';

export interface IdentityServiceOptions {
  store: KeyValueStore;
  vault: KeyVault;
  publisher: Publisher;
  /** Signs as an existing account (the browser extension); absent: account-owned Blobbis cannot be registered. */
  accountSigner?: (template: EventTemplate) => Promise<NostrEvent>;
  /**
   * Called when a registration completed FOR REAL (live: published and read back). The host decides what that means
   * for the account (M11D.6: it never replaces another connected account). Never called for a rehearsal.
   */
  onRegistered?: (b: ReservedBlobbi) => void;
  /** Called when a Blobbi's public record changed (its name). */
  onChanged?: () => void;
  now?: () => number;
  /** Tests: a deterministic petId. */
  petId?: () => string;
  /** M11D.5: the connected account's public key, if any (a restore of another identity says it keeps this one). */
  currentAccount?: () => string | null;
  /** M11D.6: the wait before reading back again (tests: none). */
  sleep?: (ms: number) => Promise<void>;
  /**
   * M11D.7: called once an identity was restored (kept in the vault). The host decides what that means for the
   * account (as for `onRegistered`: it never replaces another connected account).
   */
  onRestored?: (pubkey: string) => void;
  /** M11D.7: reads an owner's kind 31124 Blobbis (read only); absent: shared Blobbis cannot be looked for. */
  blobbiReader?: BlobbiReader;
  /** M11D.7: the relays a restored identity's Blobbis are looked for on. */
  readRelays?: readonly string[];
  /** M11D.7: how long the relays get to answer that look (ms). */
  findTimeoutMs?: number;
}

const fail = <T>(problem: IdentityProblem): IdentityResult<T> => ({ ok: false, problem });
const problemOf = (e: unknown): IdentityProblem => (e instanceof VaultError ? e.code : e instanceof ActivationError ? e.problem : 'storage');

export class IdentityService implements IdentityPort {
  readonly publishMode: 'live' | 'rehearsal';
  private readonly now: () => number;
  private busy = false;

  constructor(private readonly o: IdentityServiceOptions) {
    this.publishMode = o.publisher.mode;
    this.now = o.now ?? Date.now;
  }

  async vaultAvailable(): Promise<boolean> {
    try {
      await this.o.vault.list();
      return true;
    } catch {
      return false;
    }
  }

  reserved(): readonly ReservedBlobbi[] {
    return readGuestBlobbis(this.o.store).map(publicOf);
  }

  rename(d: string, name: string): void {
    // Once registered its name is part of its canonical state: renamed only in its home apps.
    if (chooseGuestName(this.o.store, d, name)) this.o.onChanged?.();
  }

  namingLater(d: string): void {
    if (updateGuestBlobbi(this.o.store, d, { namingLaterAt: this.now() })) this.o.onChanged?.();
  }

  /**
   * A NEW BLOBBI WITH ITS OWN OWNER, before its egg appears. A guest identity is made and SEALED first; only a kept
   * identity gets a Blobbi (a failure leaves nothing half made). Never signs, never publishes.
   */
  async reserve(owner: { kind: 'guest' } | { kind: 'account'; pubkey: string } | { kind: 'vault'; pubkey: string }, island: string | null): Promise<IdentityResult<GuestBlobbi>> {
    try {
      let pubkey: string;
      if (owner.kind === 'guest') {
        pubkey = (await this.o.vault.create(this.now())).pubkey;
        void askPersistentStorage();
      } else if (owner.kind === 'vault') {
        // The player's account is an identity this game keeps: the new Blobbi is that identity's (no new key).
        if (!(await this.o.vault.has(owner.pubkey))) return fail('not-found');
        pubkey = owner.pubkey;
      } else pubkey = owner.pubkey;
      const petId = (this.o.petId ?? generatePetId10)();
      const b: GuestBlobbi = { owner: pubkey, ownerKind: owner.kind === 'account' ? 'account' : 'guest', petId, d: canonicalD(pubkey, petId), name: suggestedName(petId), createdAt: this.now(), bornAt: Math.floor(this.now() / 1000), island, born: false, activatedAt: null, named: false, namingLaterAt: null, practicedAt: null };
      return { ok: true, value: addGuestBlobbi(this.o.store, b) };
    } catch (e) {
      return fail(problemOf(e));
    }
  }

  async backupVerified(owner: string): Promise<boolean> {
    try {
      return !!(await this.o.vault.identity(owner))?.backupVerifiedAt;
    } catch {
      return false;
    }
  }

  async makeBackup(owner: string, password: string, lines: readonly string[]): Promise<IdentityResult<{ fileName: string; text: string }>> {
    try {
      const ncryptsec = await this.o.vault.exportBackup(owner, password);
      const blobbis = readGuestBlobbis(this.o.store).filter((b) => b.owner === owner);
      return { ok: true, value: { fileName: backupFileName(owner), text: buildBackupFile(ncryptsec, owner, blobbis, lines) } };
    } catch (e) {
      return fail(problemOf(e));
    }
  }

  async makeRecoveryKey(owner: string, lines: readonly string[]): Promise<IdentityResult<{ fileName: string; text: string }>> {
    try {
      const nsec = await this.o.vault.exportSecretKey(owner);
      const blobbis = readGuestBlobbis(this.o.store).filter((b) => b.owner === owner);
      return { ok: true, value: { fileName: recoveryFileName(owner), text: buildBackupFile(nsec, owner, blobbis, lines) } };
    } catch (e) {
      return fail(problemOf(e));
    }
  }

  backupKind(text: string): BackupKind | null {
    return parseBackupFile(text)?.kind ?? null;
  }

  async verifyBackup(owner: string, text: string, password: string): Promise<IdentityResult<true>> {
    const parsed = parseBackupFile(text);
    if (!parsed) return fail('corrupt-backup');
    try {
      await this.o.vault.verifyBackup(owner, parsed.secret, parsed.kind === 'nsec' ? '' : password, this.now());
      return { ok: true, value: true };
    } catch (e) {
      return fail(problemOf(e));
    }
  }

  async previewBackup(text: string, password: string): Promise<IdentityResult<BackupPreview>> {
    const parsed = parseBackupFile(text);
    if (!parsed) return fail('corrupt-backup');
    try {
      const { pubkey, alreadyHere } = await this.o.vault.inspectBackup(parsed.secret, parsed.kind === 'nsec' ? '' : password);
      // The public line counts only when it names the identity the backup really opens.
      const named = parsed.meta && parsed.meta.pubkey === pubkey ? parsed.meta.blobbis.filter((b) => b.d === canonicalD(pubkey, b.petId)) : [];
      const account = this.o.currentAccount?.() ?? null;
      return { ok: true, value: { kind: parsed.kind, otherAccount: !!account && account !== pubkey, pubkey, npubShort: shortNpub(npubEncode(pubkey)), alreadyHere, blobbis: named.map((b) => ({ d: b.d, name: b.name, alreadyHere: !!guestBlobbi(this.o.store, b.d) })) } };
    } catch (e) {
      return fail(problemOf(e));
    }
  }

  async restoreBackup(text: string, password: string): Promise<IdentityResult<BackupPreview>> {
    if (this.busy) return fail('busy');
    this.busy = true;
    try {
      const preview = await this.previewBackup(text, password);
      if (!preview.ok) return preview;
      const parsed = parseBackupFile(text)!;
      await this.o.vault.restore(parsed.secret, parsed.kind === 'nsec' ? '' : password, this.now());
      // The Blobbis its public line names come back as they were (born, as a registered or unregistered guest); one
      // already here is left exactly as it is (never duplicated).
      for (const b of parsed.meta?.blobbis ?? [])
        if (preview.value.blobbis.some((p) => p.d === b.d) && !guestBlobbi(this.o.store, b.d))
          addGuestBlobbi(this.o.store, { owner: preview.value.pubkey, ownerKind: 'guest', petId: b.petId, d: b.d, name: b.name, createdAt: this.now(), bornAt: b.bornAt, island: null, born: true, activatedAt: null, named: b.named === true || b.name !== suggestedName(b.petId), namingLaterAt: null, practicedAt: null });
      // M11D.7: the identity is kept: the host makes it the player's (a raw Recovery Key names no Blobbi, and the
      // identity used to sit unused in the vault while a new adventure made another one).
      this.o.onRestored?.(preview.value.pubkey);
      return preview;
    } catch (e) {
      return fail(problemOf(e));
    } finally {
      this.busy = false;
    }
  }

  /**
   * M11D.7, AFTER A RESTORE: the identity's Blobbis already shared with other worlds, read back from the relays (a
   * REQ only: nothing is signed or sent). A V3 Baby whose d is this owner's canonical d is kept here as the very same
   * Blobbi (its owner, d and name; registered, since it is out there); one already here keeps its record and is only
   * marked shared. Anything else (an adult, an egg, an older generation) is counted and left to MY BLOBBIS. Only for
   * an identity this device keeps. When not every relay answers and nothing turned up: 'unavailable', never 'none'.
   */
  async findShared(owner: string): Promise<IdentityResult<SharedSearch>> {
    const reader = this.o.blobbiReader;
    const relays = this.o.readRelays ?? [];
    const unavailable: IdentityResult<SharedSearch> = { ok: true, value: { status: 'unavailable', blobbis: [], others: 0 } };
    try {
      if (!(await this.o.vault.has(owner))) return fail('not-found');
    } catch (e) {
      return fail(problemOf(e));
    }
    if (!reader || !relays.length) return unavailable;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let res: ProfileReadResult | null;
    try {
      const late = new Promise<null>((resolve) => (timer = setTimeout(() => (abort.abort(), resolve(null)), this.o.findTimeoutMs ?? 8000)));
      res = await Promise.race([reader.readBlobbis(owner, relays, abort.signal), late]);
    } catch {
      res = null;
    } finally {
      clearTimeout(timer);
    }
    if (!res || res.reachable === 0) return unavailable;
    const blobbis: SharedSearch['blobbis'] = [];
    let others = 0;
    for (const item of pickBlobbis(res.events, owner).items) {
      const petId = item.d.slice(item.d.lastIndexOf('-') + 1);
      if (item.generation !== 'v3' || item.stage !== 'baby' || item.availability !== 'available' || canonicalD(owner, petId) !== item.d) {
        others++;
        continue;
      }
      // Shared for real: a finished live run adopting the event found (a share still under way here is left alone).
      const shared = adoptFoundBlobbi(this.o.store, owner, item.d, res.events, this.now());
      const here = guestBlobbi(this.o.store, item.d);
      if (here) {
        if (shared && here.owner === owner && !here.activatedAt) updateGuestBlobbi(this.o.store, item.d, { activatedAt: this.now(), born: true });
      } else addGuestBlobbi(this.o.store, { owner, ownerKind: 'guest', petId, d: item.d, name: item.name, createdAt: this.now(), bornAt: item.updatedAt, island: null, born: true, activatedAt: shared ? this.now() : null, named: true, namingLaterAt: null, practicedAt: null });
      blobbis.push({ d: item.d, name: here?.name ?? item.name, alreadyHere: !!here });
    }
    if (blobbis.length) this.o.onChanged?.();
    if (!blobbis.length && !others && res.reachable < relays.length) return unavailable;
    return { ok: true, value: { status: blobbis.length || others ? 'found' : 'none', blobbis, others } };
  }

  registration(d: string): RegistrationState {
    // Only a run of this build's mode: a rehearsal never stands for a live registration.
    const run = activationRun(this.o.store, d, this.publishMode);
    return {
      stage: run?.stage ?? 'none',
      mode: run?.mode ?? this.publishMode,
      adopted: run?.adopted ?? false,
      acceptedBy: Math.min(run?.accepted.blobbi.length ?? 0, run?.accepted.profile.length ?? 0),
      heldBy: Math.min(run?.seenOn?.blobbi.length ?? 0, run?.seenOn?.profile.length ?? 0),
      relays: this.o.publisher.relays.length,
      problem: run?.lastProblem ?? null,
    };
  }

  async shareStatus(d: string): Promise<ShareStatus> {
    const b = guestBlobbi(this.o.store, d);
    if (!b) return 'local';
    if (b.activatedAt) return 'shared';
    const reg = this.registration(d);
    if (this.publishMode === 'live' && reg.stage !== 'none' && reg.stage !== 'done') return reg.problem === 'partial' ? 'partial' : reg.problem ? 'failed' : 'pending';
    if (b.practicedAt && this.publishMode === 'rehearsal') return 'practiced';
    return b.ownerKind === 'guest' && (await this.backupVerified(b.owner)) ? 'backedUp' : 'local';
  }

  async register(d: string, consent: boolean): Promise<IdentityResult<RegistrationState>> {
    if (this.busy) return fail('busy');
    const b = guestBlobbi(this.o.store, d);
    if (!b) return fail('not-found');
    if (!b.born) return fail('not-found');
    this.busy = true;
    try {
      const backupVerified = b.ownerKind === 'account' || (await this.backupVerified(b.owner));
      const sign = b.ownerKind === 'guest' ? (t: EventTemplate) => this.o.vault.sign(b.owner, t) : this.o.accountSigner;
      if (!sign) return fail('sign-failed');
      const mode = this.publishMode;
      // The owner may have a profile out there already (an account, or this identity shared another Blobbi before).
      const mayHaveProfile = b.ownerKind === 'account' || ownerRuns(this.o.store, b.owner, mode).some((r) => r.d !== d && (r.stage === 'done' || r.stage === 'confirmed' || r.accepted.profile.length > 0)) || readGuestBlobbis(this.o.store).some((x) => x.owner === b.owner && x.d !== d && !!x.activatedAt);
      await activate({ facts: { owner: b.owner, petId: b.petId, name: b.name, bornAt: b.bornAt }, consent, backupVerified, ownerKind: b.ownerKind, mayHaveProfile }, { store: this.o.store, publisher: this.o.publisher, sign, now: this.now, sleep: this.o.sleep });
      finishActivation(this.o.store, d, this.now());
      // A rehearsal (nothing left the device) is practice, never a registration: no account change, no "shared".
      if (mode === 'rehearsal') {
        updateGuestBlobbi(this.o.store, d, { practicedAt: this.now(), named: true });
        return { ok: true, value: this.registration(d) };
      }
      // Only after the relays gave both events back (the policy): the Blobbi is registered.
      const done = updateGuestBlobbi(this.o.store, d, { activatedAt: this.now() })!;
      this.o.onRegistered?.(publicOf(done));
      return { ok: true, value: this.registration(d) };
    } catch (e) {
      return fail(problemOf(e));
    } finally {
      this.busy = false;
    }
  }
}

const publicOf = (b: GuestBlobbi): ReservedBlobbi => ({ owner: b.owner, ownerKind: b.ownerKind, petId: b.petId, d: b.d, name: b.name, born: b.born, activatedAt: b.activatedAt, named: b.named, namingLaterAt: b.namingLaterAt, practicedAt: b.practicedAt });
