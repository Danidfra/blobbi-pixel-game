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
}

/** Where a registration stands (resumable). */
export interface RegistrationState {
  stage: 'none' | 'consented' | 'signed' | 'published' | 'confirmed' | 'done';
  mode: 'live' | 'rehearsal';
  adopted: boolean;
  acceptedBy: number;
}

export type IdentityProblem = 'unavailable' | 'wrong-password' | 'corrupt-backup' | 'mismatch' | 'not-found' | 'storage' | 'no-backup' | 'no-consent' | 'sign-failed' | 'wrong-signer' | 'not-canonical' | 'publish-failed' | 'not-confirmed' | 'unreachable' | 'busy';

export type IdentityResult<T> = { ok: true; value: T } | { ok: false; problem: IdentityProblem };

/** What a backup would restore, before anything is stored. */
export interface BackupPreview {
  pubkey: string;
  npubShort: string;
  alreadyHere: boolean;
  blobbis: { d: string; name: string; alreadyHere: boolean }[];
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
  rename(d: string, name: string): void;
  /** Whether this identity's backup has been verified (loaded back and opened). */
  backupVerified(owner: string): Promise<boolean>;
  /** Make the secret backup file (encrypted with `password`) for a guest identity and the Blobbis it owns. */
  makeBackup(owner: string, password: string, lines: readonly string[]): Promise<IdentityResult<{ fileName: string; text: string }>>;
  /** Verify a backup the player loaded back (file or pasted text) with its password. */
  verifyBackup(owner: string, text: string, password: string): Promise<IdentityResult<true>>;
  /** What a backup would restore (nothing is stored). */
  previewBackup(text: string, password: string): Promise<IdentityResult<BackupPreview>>;
  /** Restore an identity (and the Blobbis its backup names) from a backup; never overwrites, never publishes. */
  restoreBackup(text: string, password: string): Promise<IdentityResult<BackupPreview>>;
  registration(d: string): RegistrationState;
  /** Register (publish) a Blobbi after explicit consent; resumable and idempotent. */
  register(d: string, consent: boolean): Promise<IdentityResult<RegistrationState>>;
}
