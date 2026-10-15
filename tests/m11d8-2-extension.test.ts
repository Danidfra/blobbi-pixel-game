// M11D.8.2, ISSUE 4: the browser extension's account is checked, not assumed. On a page load with a remembered NIP-07
// account, one `getPublicKey` says whether the extension still holds that key: the same key verifies; another key is
// a MISMATCH (the player switched accounts in the extension) and nothing is switched here; no answer, a refusal or no
// extension leaves the account unconfirmed. The record is never changed by the check, nothing is signed, and a vault
// identity or a guest is never asked. CONNECT (explicit) is the only way to switch.
import { describe, expect, it, vi } from 'vitest';
import { NostrAccount } from '../src/nostr/account';
import { ACCOUNT_KEY, saveAccount } from '../src/nostr/account-store';
import { memoryStore } from '../src/game/persistence';
import { effectiveSelection } from '../src/game/blobbi-selection';
import { sourceFromSeed } from '../src/blobbi/source';
import type { PublicKeySigner } from '../src/nostr/signer';
import { READ_RELAYS } from '../src/nostr/relay-config';

const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const noReader = { readProfile: async () => ({ events: [], reachable: 0 }) };

const signerOf = (answer: () => Promise<string>, available = true) => {
  const s: PublicKeySigner & { calls: number; signs: number } = { calls: 0, signs: 0, available: () => available, getPublicKey: () => (s.calls++, answer()) };
  return s;
};
function remembered(signer: PublicKeySigner, method: 'nip07' | 'vault' = 'nip07') {
  const store = memoryStore();
  saveAccount(store, { version: 1, pubkey: ME, method, connectedAt: 1, profile: { name: 'Ana', at: 1 } });
  const account = new NostrAccount({ store, signer, reader: noReader, relays: READ_RELAYS, now: () => 2 });
  const changes: string[] = [];
  account.onChange(() => changes.push(account.snapshot().extension));
  return { store, account, changes, before: store.get(ACCOUNT_KEY) };
}

describe('M11D.8.2: is the extension still this account?', () => {
  it('the same key: verified; the record untouched; one question, no prompt of ours', async () => {
    const signer = signerOf(async () => ME);
    const { account, store, changes, before } = remembered(signer);
    expect(account.snapshot().extension).toBe('unchecked');
    await expect(account.verifyExtension()).resolves.toBe('verified');
    expect(account.snapshot()).toMatchObject({ status: 'connected', pubkey: ME, extension: 'verified' });
    expect(signer.calls).toBe(1);
    expect(changes).toEqual(['checking', 'verified']);
    expect(store.get(ACCOUNT_KEY)).toBe(before);
  });

  it('another key: a mismatch, said plainly; the account is NOT switched and its record is unchanged', async () => {
    const signer = signerOf(async () => OTHER);
    const { account, store, before } = remembered(signer);
    await expect(account.verifyExtension()).resolves.toBe('mismatch');
    expect(account.snapshot()).toMatchObject({ status: 'connected', pubkey: ME, extension: 'mismatch' });
    expect(store.get(ACCOUNT_KEY)).toBe(before);
    // CONNECT, explicitly, switches: the other account starts fresh, and the first one's Blobbi no longer walks.
    const record = { source: sourceFromSeed('seed-p'), name: 'Pudding', account: ME };
    expect(effectiveSelection(record, account.snapshot().pubkey)).not.toBeNull();
    await account.connect();
    expect(account.snapshot()).toMatchObject({ status: 'connected', pubkey: OTHER, extension: 'verified' });
    expect(effectiveSelection(record, account.snapshot().pubkey)).toBeNull();
  });

  it('no answer in time, a refusal, or an uppercase/odd answer: unconfirmed; no extension at all: absent', async () => {
    const hang = remembered(signerOf(() => new Promise(() => {})));
    await expect(hang.account.verifyExtension(30)).resolves.toBe('unconfirmed');
    expect(hang.account.snapshot()).toMatchObject({ pubkey: ME, extension: 'unconfirmed' });
    const refused = remembered(signerOf(() => Promise.reject(new Error('User rejected'))));
    await expect(refused.account.verifyExtension()).resolves.toBe('unconfirmed');
    const odd = remembered(signerOf(async () => 'not-a-key'));
    await expect(odd.account.verifyExtension()).resolves.toBe('unconfirmed');
    const upper = remembered(signerOf(async () => ME.toUpperCase()));
    await expect(upper.account.verifyExtension()).resolves.toBe('verified');
    const gone = remembered(signerOf(() => Promise.reject(new Error('Browser extension not available')), false));
    await expect(gone.account.verifyExtension()).resolves.toBe('absent');
    for (const r of [hang, refused, odd, gone]) expect(r.store.get(ACCOUNT_KEY)).toBe(r.before);
  });

  it('a vault identity or a guest is never asked (unchecked), and one check at a time', async () => {
    const signer = signerOf(async () => ME);
    const vault = remembered(signer, 'vault');
    await expect(vault.account.verifyExtension()).resolves.toBe('unchecked');
    expect(signer.calls).toBe(0);
    const guest = new NostrAccount({ store: memoryStore(), signer, reader: noReader, relays: READ_RELAYS });
    await expect(guest.verifyExtension()).resolves.toBe('unchecked');
    expect(signer.calls).toBe(0);
    // Two callers at once share one question.
    const slow = signerOf(() => new Promise((r) => setTimeout(() => r(ME), 20)));
    const once = remembered(slow);
    const [a, b] = await Promise.all([once.account.verifyExtension(), once.account.verifyExtension()]);
    expect([a, b]).toEqual(['verified', 'verified']);
    expect(slow.calls).toBe(1);
  });

  it('disconnecting, or a switch meanwhile, drops the answer: never a stale state for another account', async () => {
    const slow = signerOf(() => new Promise((r) => setTimeout(() => r(ME), 20)));
    const { account } = remembered(slow);
    const p = account.verifyExtension();
    account.disconnect();
    await expect(p).resolves.toBe('unchecked');
    expect(account.snapshot()).toMatchObject({ status: 'guest', extension: 'unchecked' });
    // Reconnecting through the extension is a fresh answer.
    await account.connect();
    expect(account.snapshot()).toMatchObject({ status: 'connected', pubkey: ME, extension: 'verified' });
  });

  it('the check never signs, publishes or exposes anything: the signer has no sign method to call', async () => {
    const signer = signerOf(async () => OTHER);
    const { account } = remembered(signer);
    const spy = vi.fn();
    (signer as unknown as { signEvent: unknown }).signEvent = spy;
    await account.verifyExtension();
    expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(account.snapshot())).not.toMatch(/nsec|secret/i);
  });
});

