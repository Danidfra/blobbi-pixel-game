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
}
