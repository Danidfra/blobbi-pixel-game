/**
 * THE ACCOUNT PORT: everything the rest of the game may know about a connected Nostr account, as plain data and
 * three actions. Types only: importing this file never loads a network library.
 *
 * The game is complete without an account. Connecting only tells the game who the player is (their public key and,
 * when relays have it, their public profile name). In this version nothing is ever published, no secret key is ever
 * seen or kept, and no island, Blobbi or save is changed by connecting or disconnecting.
 */

/** How the player connected. Only browser extensions (NIP-07) in this version. */
export type SignerMethod = 'nip07';

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
