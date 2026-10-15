/**
 * THE ACCOUNT PORT: everything the rest of the game may know about a connected Nostr account, as plain data and
 * three actions. Types only: importing this file never loads a network library.
 *
 * The game is complete without an account. Connecting only tells the game who the player is (their public key and,
 * when relays have it, their public profile name). In this version nothing is ever published, no secret key is ever
 * seen or kept, and no island, Blobbi or save is changed by connecting or disconnecting.
 */

/**
 * How the player connected: a browser extension (NIP-07), or (M11D.4) the reserved identity kept in this game's own
 * key vault, once its Blobbi has been registered ('vault').
 */
export type SignerMethod = 'nip07' | 'vault';

export type AccountStatus = 'guest' | 'connecting' | 'connected';

/** Why the last connection attempt did not work (null after a success or before any attempt). */
export type ConnectProblem = 'no-signer' | 'rejected' | 'timeout' | 'invalid-key' | 'failed';

/** What the relays said about the player's public profile. */
export type ProfileStatus = 'idle' | 'loading' | 'found' | 'missing' | 'invalid' | 'unavailable';

/**
 * M11D.8.2: whether the browser extension (NIP-07) still holds the remembered account. Checked once per page load
 * before any account-specific entry (`verifyExtension`), never stored. `unchecked` for a guest or a vault identity;
 * `verified` the extension answered with this very key; `mismatch` it answered with ANOTHER key (the player switched
 * accounts in the extension: nothing is switched here until they press CONNECT); `unconfirmed` it did not answer in
 * time, or the player said no (locked, or a prompt still open); `absent` no extension is installed now.
 */
export type ExtensionCheck = 'unchecked' | 'checking' | 'verified' | 'mismatch' | 'unconfirmed' | 'absent';

export interface AccountSnapshot {
  status: AccountStatus;
  /** 64 lowercase hex characters, or null as a guest. */
  pubkey: string | null;
  /** The npub (NIP-19) form of the public key, or null. */
  npub: string | null;
  /** A short, friendly form of the npub: "npub1abcd…wxyz". */
  npubShort: string | null;
  method: SignerMethod | null;
  /** The profile's display name, already cleaned (no control or direction characters, at most 24 characters). */
  displayName: string | null;
  profile: ProfileStatus;
  /** When the profile was last read (ms since 1970), or null. */
  profileAt: number | null;
  problem: ConnectProblem | null;
  /** A browser extension signer (window.nostr) is present right now. */
  signerAvailable: boolean;
  /** M11D.8.2: whether the extension still holds this account (see `ExtensionCheck`). */
  extension: ExtensionCheck;
  /** The relays profiles are read from (public data only). */
  relays: readonly string[];
}

export interface AccountPort {
  snapshot(): AccountSnapshot;
  /** Ask the browser extension for the public key (the extension may show its own prompt). Never signs anything. */
  connect(): Promise<void>;
  /** Forget the account on this device. Islands and saves are untouched. */
  disconnect(): void;
  /** Read the public profile again if it is older than a few minutes (or `force`). Never prompts the signer. */
  refreshProfile(force?: boolean): Promise<void>;
  /** M11C: be told when the status, the account or its profile changes (returns the way to stop listening). */
  onChange?(listener: () => void): () => void;
  /**
   * M11D.8.2: ask the extension which key it holds now and compare it with the remembered account (NIP-07 only; a
   * guest or a vault identity answers `unchecked` at once). Never switches the account, never signs. The extension
   * may show its own prompt the first time an origin asks; most remember the answer.
   */
  verifyExtension?(timeoutMs?: number): Promise<ExtensionCheck>;
}

// ── The player's canonical Blobbis (M11C, read-only) ───────────────────────────

/** Which artwork generation draws a Blobbi (`visual_generation`; absent = V1). `unknown`: a value this game does not know. */
export type BlobbiGeneration = 'v1' | 'v2' | 'v3' | 'unknown';

/**
 * Whether a Blobbi can visit this pixel world: a V3 adult or a V3 baby (M11D.1) is drawn faithfully here; a V1/V2
 * Baby or Adult with readable colours visits in its temporary world form (M11D.2, `worldForm`). The others are listed
 * with the reason, never drawn as something they are not. `baby` is no longer produced (kept for callers).
 */
export type BlobbiAvailability = 'available' | 'egg' | 'baby' | 'older-generation' | 'unknown-generation';

/** One of the player's Blobbis, as read (and checked) from its newest kind 31124 event. Plain public data. */
export interface OwnedBlobbi {
  /** `31124:<owner pubkey>:<d>`: the Blobbi's identity. */
  address: string;
  pubkey: string;
  d: string;
  /** Its name, cleaned (one line, no control or direction characters, at most 24 characters). */
  name: string;
  stage: 'egg' | 'baby' | 'adult';
  generation: BlobbiGeneration;
  availability: BlobbiAvailability;
  /** The V3 visual seed (derived from the address by the kit), for a V3 Blobbi; else null. */
  seed: string | null;
  /** A V1/V2 Blobbi's three colours (the kit's trait reading), for an honest swatch; else null. */
  colors: { base: string; secondary: string; eye: string } | null;
  /**
   * M11D.2: a V1/V2 Blobbi's look as its event states it (colours, pattern, special mark), from which its temporary
   * pixel world form is made (`src/blobbi/world-form.ts`); null for V3 and for V1/V2 events without usable colours.
   */
  worldForm?: { base: string; secondary: string; eye: string; pattern: string; mark: string } | null;
  /** The event's created_at (seconds). */
  updatedAt: number;
}

export type CollectionStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface CollectionSnapshot {
  status: CollectionStatus;
  /** Whose Blobbis these are (the connected public key when read), or null. */
  owner: string | null;
  items: readonly OwnedBlobbi[];
  /** Some relays did not answer (the list may miss a newer state). */
  partial: boolean;
  /** Events that could not be used (malformed, another author, legacy, older duplicates). */
  skipped: number;
  /** When the list was last read (ms), or null. */
  fetchedAt: number | null;
}

export interface BlobbiCollectionPort {
  blobbis(): CollectionSnapshot;
  /** Read the connected player's Blobbis, unless read a few minutes ago (or `force`). Never prompts the signer. */
  loadBlobbis(force?: boolean): Promise<void>;
}

// ── M11D.4: reserved identities, backups, registration ───────────────────────────────────────────────────────────

/** A Blobbi met in this game with a real owner (a reserved guest identity, or the player's account). Public data. */
export interface ReservedBlobbi {
  owner: string;
  ownerKind: 'guest' | 'account';
  petId: string;
  d: string;
  name: string;
  born: boolean;
  activatedAt: number | null;
  /** M11D.5: the player chose its name (no naming question again). */
  named: boolean;
  /** M11D.5: when the player last said "later" to the naming question (ms), or null. */
  namingLaterAt: number | null;
  /** M11D.6: when its sharing was rehearsed in practice mode (nothing published), or null. */
  practicedAt?: number | null;
}

/**
 * M11D.6: where a Blobbi stands with other worlds, as the player is told it (never "shared" unless it is).
 *   local      nothing done yet
 *   backedUp   its backup was checked; not shared
 *   practiced  the practice run went through (practice mode: nothing left the device)
 *   pending    sharing started and has not finished (resumable)
 *   partial    some worlds hold it, not enough yet: TRY AGAIN finishes it
 *   failed     the last try did not get through (nothing lost): TRY AGAIN
 *   shared     published and read back as the policy asks: other worlds can recognize it
 */
export type ShareStatus = 'local' | 'backedUp' | 'practiced' | 'pending' | 'partial' | 'failed' | 'shared';

/** M11D.5: the two kinds of backup. A Recovery Key (plain `nsec`, no password) or a Protected Key (NIP-49). */
export type BackupKind = 'nsec' | 'ncryptsec';

/** Where a registration stands (resumable). */
export interface RegistrationState {
  stage: 'none' | 'consented' | 'signed' | 'publishing' | 'published' | 'confirmed' | 'done';
  mode: 'live' | 'rehearsal';
  adopted: boolean;
  acceptedBy: number;
  /** M11D.6: how many relays returned both events when read back, and how many relays there are. */
  heldBy?: number;
  relays?: number;
  /** M11D.6: why the last try stopped, or null. */
  problem?: IdentityProblem | null;
}

export type IdentityProblem = 'unavailable' | 'wrong-password' | 'corrupt-backup' | 'mismatch' | 'not-found' | 'storage' | 'no-backup' | 'no-consent' | 'sign-failed' | 'wrong-signer' | 'not-canonical' | 'publish-failed' | 'not-confirmed' | 'partial' | 'unreachable' | 'busy';

export type IdentityResult<T> = { ok: true; value: T } | { ok: false; problem: IdentityProblem };

/** What a backup would restore, before anything is stored. */
export interface BackupPreview {
  /** M11D.5: which kind of backup it is. */
  kind: BackupKind;
  pubkey: string;
  npubShort: string;
  alreadyHere: boolean;
  blobbis: { d: string; name: string; alreadyHere: boolean }[];
  /** M11D.5: the player is connected with ANOTHER account: restoring keeps it (the restored one is only kept here). */
  otherAccount: boolean;
}

/**
 * M11D.7: what a look for a restored identity's shared Blobbis found (read only). `blobbis`: the V3 Babies kept here
 * now as the same Blobbis (owner, d, name). `others`: its other Blobbis out there (adults, eggs, older generations),
 * met from MY BLOBBIS. 'unavailable': the relays did not all answer, so the look can be tried again.
 */
export interface SharedSearch {
  status: 'found' | 'none' | 'unavailable';
  blobbis: { d: string; name: string; alreadyHere: boolean }[];
  others: number;
}

/**
 * THE IDENTITY PORT (types only): what the UI may do with reserved identities. It never hands out a secret: backups
 * come back as finished files (encrypted with the player's password), and signing happens behind it.
 */
export interface IdentityPort {
  /** Publishing mode of this build: 'rehearsal' (nothing leaves the device) unless switched to 'live'. */
  readonly publishMode: 'live' | 'rehearsal';
  /** Whether the protected key vault works in this browser (IndexedDB and Web Crypto). */
  vaultAvailable(): Promise<boolean>;
  reserved(): readonly ReservedBlobbi[];
  /** Choose a Blobbi's name (until it is registered): marks it named, so the naming question is not asked again. */
  rename(d: string, name: string): void;
  /** M11D.5: the player said "later" to the naming question. */
  namingLater(d: string): void;
  /** Whether this identity's backup has been verified (loaded back and opened). */
  backupVerified(owner: string): Promise<boolean>;
  /** Make the secret backup file (encrypted with `password`) for a guest identity and the Blobbis it owns. */
  makeBackup(owner: string, password: string, lines: readonly string[]): Promise<IdentityResult<{ fileName: string; text: string }>>;
  /**
   * M11D.5: make the Recovery Key file (the plain `nsec`, no password) for a guest identity. Only on the player's
   * direct request, after the acknowledgment; the text is for the file the player saves and nothing else.
   */
  makeRecoveryKey(owner: string, lines: readonly string[]): Promise<IdentityResult<{ fileName: string; text: string }>>;
  /** M11D.5: what kind of backup a loaded text is (a password is asked only for a Protected Key), or null. */
  backupKind(text: string): BackupKind | null;
  /** Verify a backup the player loaded back (file or pasted text); the password only for a Protected Key. */
  verifyBackup(owner: string, text: string, password: string): Promise<IdentityResult<true>>;
  /** What a backup would restore (nothing is stored). */
  previewBackup(text: string, password: string): Promise<IdentityResult<BackupPreview>>;
  /** Restore an identity (and the Blobbis its backup names) from a backup; never overwrites, never publishes. */
  restoreBackup(text: string, password: string): Promise<IdentityResult<BackupPreview>>;
  /** M11D.7: after a restore, this identity's Blobbis already shared with other worlds (read only, never publishes). */
  findShared(owner: string): Promise<IdentityResult<SharedSearch>>;
  registration(d: string): RegistrationState;
  /** M11D.6: where the Blobbi stands with other worlds (for the player: backed up, practiced, pending, shared...). */
  shareStatus(d: string): Promise<ShareStatus>;
  /** Register (publish) a Blobbi after explicit consent; resumable and idempotent. */
  register(d: string, consent: boolean): Promise<IdentityResult<RegistrationState>>;
}
