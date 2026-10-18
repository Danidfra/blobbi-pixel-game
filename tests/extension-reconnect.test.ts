/**
 * 2026-10-18: a slow first-time permission prompt must not leave the account unconfirmed for the whole visit. The page
 * load's check waits a short time; the extension's answer, whenever a person gives it, still settles the account; a
 * check while the prompt is open never opens a second one; a refusal can be asked again; an answer for an account no
 * longer connected is dropped. Nothing here signs (`getPublicKey` only).
 */
import { describe, expect, it } from 'vitest';
import { NostrAccount } from '../src/nostr/account';
import { saveAccount } from '../src/nostr/account-store';
import { memoryStore } from '../src/game/persistence';
import type { PublicKeySigner } from '../src/nostr/signer';
import { READ_RELAYS } from '../src/nostr/relay-config';

const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const noReader = { readProfile: async () => ({ events: [], reachable: 0 }) };

/** An extension whose answers the test gives by hand (a person at its prompt). */
function extension() {
  const pending: Array<{ resolve: (v: string) => void; reject: (e: Error) => void }> = [];
  const s: PublicKeySigner & { calls: number; approve: (key?: string) => void; refuse: () => void } = {
    calls: 0,
    available: () => true,
    getPublicKey: () => (s.calls++, new Promise<string>((resolve, reject) => pending.push({ resolve, reject }))),
    approve: (key = ME) => pending.shift()?.resolve(key),
    refuse: () => pending.shift()?.reject(new Error('User rejected')),
  };
  return s;
}
function remembered(signer: PublicKeySigner) {
  const store = memoryStore();
  saveAccount(store, { version: 1, pubkey: ME, method: 'nip07', connectedAt: 1, profile: null });
  return { store, account: new NostrAccount({ store, signer, reader: noReader, relays: READ_RELAYS, now: () => 2 }) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the extension confirms the account late (a person answering its first prompt)', () => {
  it('the page load check times out as unconfirmed; the late approval still verifies it', async () => {
    const ext = extension();
    const { account } = remembered(ext);
    await expect(account.verifyExtension(20)).resolves.toBe('unconfirmed');
    expect(account.snapshot().extension).toBe('unconfirmed');
    ext.approve();
    await tick();
    expect(account.snapshot().extension).toBe('verified');
    expect(ext.calls).toBe(1);
  });

  it('a check while the prompt is still open waits for that same answer: never a second prompt', async () => {
    const ext = extension();
    const { account } = remembered(ext);
    await account.verifyExtension(20);
    const again = account.verifyExtension(60_000);
    expect(ext.calls).toBe(1);
    ext.approve();
    await expect(again).resolves.toBe('verified');
    expect(ext.calls).toBe(1);
  });

  it('a refused permission leaves it unconfirmed (nothing signed); asking again later is a new prompt, and can verify', async () => {
    const ext = extension();
    const { account } = remembered(ext);
    const first = account.verifyExtension(60_000);
    ext.refuse();
    await expect(first).resolves.toBe('unconfirmed');
    const second = account.verifyExtension(60_000);
    expect(ext.calls).toBe(2);
    ext.approve();
    await expect(second).resolves.toBe('verified');
  });

  it('an answer that comes after the account changed is dropped (account switching is safe)', async () => {
    const ext = extension();
    const { account } = remembered(ext);
    await account.verifyExtension(20);
    account.disconnect();
    ext.approve();
    await tick();
    expect(account.snapshot().extension).not.toBe('verified');
    expect(account.snapshot().status).toBe('guest');
  });

  it('another key in the extension is a mismatch, never this account', async () => {
    const ext = extension();
    const { account } = remembered(ext);
    const check = account.verifyExtension(60_000);
    ext.approve(OTHER);
    await expect(check).resolves.toBe('mismatch');
    expect(account.snapshot()).toMatchObject({ pubkey: ME, extension: 'mismatch' });
  });
});
