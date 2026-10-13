/**
 * THE NOSTR MODULE: the only place in the game allowed to reach the network or a signer (`tests/boundaries.test.ts`
 * enforces it). Gameplay, rendering, generation and the simulation never import it; the playground creates one
 * account and hands the UI its `AccountPort`.
 *
 * M11B scope: read-only identity. Connect a browser extension signer (NIP-07), remember the public key, read the
 * public profile name. Never: publish, sign, encrypt, ask for or make a secret key, claim or sync an island.
 */
import { NostrAccount } from './account';
import type { AccountStore } from './account-store';
import { DEFAULT_RELAYS, relayProfileReader } from './relays';
import { browserExtensionSigner } from './signer';

export type { AccountPort, AccountSnapshot } from './port';

export function createNostrAccount(store: AccountStore): NostrAccount {
  return new NostrAccount({ store, signer: browserExtensionSigner(), reader: relayProfileReader(), relays: DEFAULT_RELAYS });
}
