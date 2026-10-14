// Shared fixtures for the restore and current-Blobbi tests (M11D.7, M11D.8): a disposable owner and its canonical
// Blobbi event, offline fake relays (whatever they hold, whoever wrote it, like a careless relay), and one browser's
// storage, vault, account and identity service wired as `main.ts` wires them. Nothing here reaches a network.
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { KeyVault, memoryVaultBackend, type VaultBackend } from '../../src/nostr/keystore';
import { IdentityService } from '../../src/nostr/identity';
import { NostrAccount } from '../../src/nostr/account';
import { memoryRelay, relayGroup } from '../../src/nostr/publisher';
import { PUBLISH_RELAYS, READ_RELAYS } from '../../src/nostr/relay-config';
import { babyStateTemplate, canonicalD } from '../../src/nostr/canonical-events';
import type { BlobbiReader, ProfileReadResult, ProfileReader } from '../../src/nostr/relays';
import type { PublicKeySigner } from '../../src/nostr/signer';
import { memoryStore, type KeyValueStore } from '../../src/game/persistence';

export const PET = 'a1b2c3d4e5';
export const noSleep = async () => {};

/** A disposable owner and one of its Blobbis as shared out there: the kit's canonical V3 Baby event, signed. */
export function ownedBaby(name = 'Pudding', petId = PET, createdAt = 1_760_000_100, sk = generateSecretKey()) {
  const owner = getPublicKey(sk);
  const event = finalizeEvent(babyStateTemplate({ owner, petId, name, bornAt: 1_760_000_000 }, createdAt), sk);
  return { sk, owner, d: canonicalD(owner, petId), event, nsec: nsecEncode(sk) };
}

/**
 * Relays that hold some events. `hang`: never answer (a timeout); `gate`: answer only when `release()` is called;
 * `reachable`: how many relays answered. `asked` records every owner asked for.
 */
export function fakeRelays(events: NostrEvent[], o: { hang?: boolean; reachable?: number; gate?: boolean } = {}) {
  const asked: string[] = [];
  const state = { ...o };
  let releases: (() => void)[] = [];
  const answer = (relays: readonly string[]): ProfileReadResult => ({ events: [...events], reachable: state.reachable ?? relays.length });
  const read = (pubkey: string, relays: readonly string[]): Promise<ProfileReadResult> => {
    asked.push(pubkey);
    if (state.hang) return new Promise(() => {});
    if (state.gate) return new Promise((r) => releases.push(() => r(answer(relays))));
    return Promise.resolve(answer(relays));
  };
  const reader: BlobbiReader & ProfileReader = { readBlobbis: read, readProfile: read };
  const release = () => {
    const now = releases;
    releases = [];
    for (const r of now) r();
  };
  return { reader, asked, state, release, events };
}

export const noSigner: PublicKeySigner = { available: () => false, getPublicKey: () => Promise.reject(new Error('not available')) };
export const extension = (pubkey: string): PublicKeySigner => ({ available: () => true, getPublicKey: async () => pubkey });

/** One browser: its storage, vault, account and identity service, wired as `main.ts` wires them. */
export function browser(o: { reader?: BlobbiReader; profileReader?: ProfileReader; store?: KeyValueStore; backend?: VaultBackend; signer?: PublicKeySigner; findTimeoutMs?: number } = {}) {
  const store = o.store ?? memoryStore();
  const backend = o.backend ?? memoryVaultBackend();
  const vault = new KeyVault(backend);
  const members = PUBLISH_RELAYS.map((url) => memoryRelay({ url, mode: 'live' }));
  const account = new NostrAccount({ store, signer: o.signer ?? noSigner, reader: o.profileReader ?? { readProfile: async () => ({ events: [], reachable: 0 }) }, blobbiReader: o.reader, relays: READ_RELAYS });
  let t = 1_770_000_000_000;
  const svc = new IdentityService({
    store,
    vault,
    publisher: relayGroup(members, 'live'),
    now: () => (t += 1000),
    sleep: noSleep,
    currentAccount: () => account.snapshot().pubkey,
    onRestored: (pubkey) => {
      if (account.snapshot().status === 'guest') account.adoptVaultIdentity(pubkey);
    },
    blobbiReader: o.reader,
    readRelays: READ_RELAYS,
    findTimeoutMs: o.findTimeoutMs ?? 40,
  });
  const sent = () => members.reduce((n, m) => n + m.sent.length, 0);
  return { store, backend, vault, account, svc, sent };
}
