/**
 * THE BROWSER EXTENSION (NIP-07), through Nostrify's `NBrowserSigner`, loaded only when the player connects (the
 * game's first screen never loads a network library). `PublicKeySigner` asks only "which public key is this?";
 * signing goes through `browserExtensionSignEvent`, which the identity service calls (`signAsAccount`) for the
 * player's own acts: registering a Blobbi, sharing the companion choice, a World Travel move. The extension shows its
 * own prompt for each. Remote signers (NIP-46) are not offered yet.
 */

/** The only thing the game asks of a signer. */
export interface PublicKeySigner {
  /** A signer is present right now (no prompt, no waiting). */
  available(): boolean;
  /** The player's public key; may show the signer's own prompt. Rejects when the player says no. */
  getPublicKey(): Promise<string>;
}

/** NIP-07: `window.nostr` with a `getPublicKey` function. */
export function hasBrowserSigner(scope: unknown = globalThis): boolean {
  const nostr = (scope as { nostr?: { getPublicKey?: unknown } } | undefined)?.nostr;
  return !!nostr && typeof nostr === 'object' && typeof nostr.getPublicKey === 'function';
}

/** The browser extension signer (NIP-07), through Nostrify. */
export function browserExtensionSigner(): PublicKeySigner {
  return {
    available: () => hasBrowserSigner(),
    async getPublicKey() {
      const { NBrowserSigner } = await import('@nostrify/nostrify');
      // A short wait for an extension that injects `window.nostr` late; the player's own answer has no limit here
      // (the account adds its own timeout).
      return new NBrowserSigner({ timeout: 1500 }).getPublicKey();
    },
  };
}

/**
 * M11D.4: the browser extension asked to SIGN one event (NIP-07 `signEvent`) for the player's existing account, only
 * from the player's own acts (see above). The extension shows its own prompt.
 */
export async function browserExtensionSignEvent(template: { kind: number; created_at: number; tags: string[][]; content: string }): Promise<import('nostr-tools/pure').NostrEvent> {
  const { NBrowserSigner } = await import('@nostrify/nostrify');
  return (await new NBrowserSigner({ timeout: 1500 }).signEvent(template)) as never;
}
