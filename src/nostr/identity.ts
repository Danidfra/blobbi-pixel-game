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
 */
import { generatePetId10 } from '@blobbi-kit/core';
import type { KeyValueStore } from '../game/persistence';
import { addGuestBlobbi, guestBlobbi, readGuestBlobbis, suggestedName, updateGuestBlobbi, type GuestBlobbi } from '../game/guest-blobbis';
import { KeyVault, VaultError, askPersistentStorage } from './keystore';
import { backupFileName, buildBackupFile, parseBackupFile } from './backup';
import { activate, activationRun, ActivationError, finishActivation } from './activation';
import type { Publisher } from './publisher';
import type { BackupPreview, IdentityPort, IdentityProblem, IdentityResult, RegistrationState, ReservedBlobbi } from './port';
import { npubEncode, shortNpub } from './keys';
import type { EventTemplate } from './canonical-events';
import type { NostrEvent } from 'nostr-tools/pure';

export interface IdentityServiceOptions {
  store: KeyValueStore;
  vault: KeyVault;
  publisher: Publisher;
  /** Signs as an existing account (the browser extension); absent: account-owned Blobbis cannot be registered. */
  accountSigner?: (template: EventTemplate) => Promise<NostrEvent>;
  /** Called when a registration completed: the identity becomes the player's account (`vault` for a guest). */
  onRegistered?: (b: ReservedBlobbi) => void;
  /** Called when a Blobbi's public record changed (its name). */
  onChanged?: () => void;
  now?: () => number;
  /** Tests: a deterministic petId. */
  petId?: () => string;
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
    const clean = name.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    const b = guestBlobbi(this.o.store, d);
    // Once registered its name is part of its canonical state: renamed only in its home apps.
    if (clean && b && !b.activatedAt) {
      updateGuestBlobbi(this.o.store, d, { name: clean });
      this.o.onChanged?.();
    }
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
      const b: GuestBlobbi = { owner: pubkey, ownerKind: owner.kind === 'account' ? 'account' : 'guest', petId, d: `blobbi-${pubkey.slice(0, 12)}-${petId}`, name: suggestedName(petId), createdAt: this.now(), bornAt: Math.floor(this.now() / 1000), island, born: false, activatedAt: null };
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

  async verifyBackup(owner: string, text: string, password: string): Promise<IdentityResult<true>> {
    const parsed = parseBackupFile(text);
    if (!parsed) return fail('corrupt-backup');
    try {
      await this.o.vault.verifyBackup(owner, parsed.ncryptsec, password, this.now());
      return { ok: true, value: true };
    } catch (e) {
      return fail(problemOf(e));
    }
  }

  async previewBackup(text: string, password: string): Promise<IdentityResult<BackupPreview>> {
    const parsed = parseBackupFile(text);
    if (!parsed) return fail('corrupt-backup');
    try {
      const { pubkey, alreadyHere } = await this.o.vault.inspectBackup(parsed.ncryptsec, password);
      // The public line counts only when it names the identity the backup really opens.
      const named = parsed.meta && parsed.meta.pubkey === pubkey ? parsed.meta.blobbis.filter((b) => b.d === `blobbi-${pubkey.slice(0, 12)}-${b.petId}`) : [];
      return { ok: true, value: { pubkey, npubShort: shortNpub(npubEncode(pubkey)), alreadyHere, blobbis: named.map((b) => ({ d: b.d, name: b.name, alreadyHere: !!guestBlobbi(this.o.store, b.d) })) } };
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
      await this.o.vault.restore(parsed.ncryptsec, password, this.now());
      // The Blobbis its public line names come back as they were (born, as a registered or unregistered guest); one
      // already here is left exactly as it is (never duplicated).
      for (const b of parsed.meta?.blobbis ?? [])
        if (preview.value.blobbis.some((p) => p.d === b.d) && !guestBlobbi(this.o.store, b.d))
          addGuestBlobbi(this.o.store, { owner: preview.value.pubkey, ownerKind: 'guest', petId: b.petId, d: b.d, name: b.name, createdAt: this.now(), bornAt: b.bornAt, island: null, born: true, activatedAt: null });
      return preview;
    } catch (e) {
      return fail(problemOf(e));
    } finally {
      this.busy = false;
    }
  }

  registration(d: string): RegistrationState {
    const run = activationRun(this.o.store, d);
    return { stage: run?.stage ?? 'none', mode: run?.mode ?? this.publishMode, adopted: run?.adopted ?? false, acceptedBy: Math.min(run?.accepted.blobbi.length ?? 0, run?.accepted.profile.length ?? 0) };
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
      await activate({ facts: { owner: b.owner, petId: b.petId, name: b.name, bornAt: b.bornAt }, consent, backupVerified, ownerKind: b.ownerKind }, { store: this.o.store, publisher: this.o.publisher, sign, now: this.now });
      // Only after the relays gave both events back: the identity becomes the account, the Blobbi registered.
      const done = updateGuestBlobbi(this.o.store, d, { activatedAt: this.now() })!;
      finishActivation(this.o.store, d, this.now());
      this.o.onRegistered?.(publicOf(done));
      return { ok: true, value: this.registration(d) };
    } catch (e) {
      return fail(problemOf(e));
    } finally {
      this.busy = false;
    }
  }
}

const publicOf = (b: GuestBlobbi): ReservedBlobbi => ({ owner: b.owner, ownerKind: b.ownerKind, petId: b.petId, d: b.d, name: b.name, born: b.born, activatedAt: b.activatedAt });
