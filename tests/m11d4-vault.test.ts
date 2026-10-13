/**
 * M11D.4: the key vault. Reserved identities are real keypairs, sealed with a non-extractable AES-GCM key bound to
 * the pubkey; signing, NIP-49 backups, backup verification and restore; wrong passwords, damaged backups, duplicates;
 * no plaintext secret anywhere in what is stored.
 */
import { describe, expect, it } from 'vitest';
import { getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { decrypt as nip49Decrypt } from 'nostr-tools/nip49';
import { KeyVault, memoryVaultBackend, VaultError } from '../src/nostr/keystore';

const vault = () => {
  const backend = memoryVaultBackend();
  return { backend, vault: new KeyVault(backend) };
};
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as VaultError).code ?? String(e);
  }
};

describe('the key vault', () => {
  it('makes a real keypair, stores it sealed (no plaintext secret), never under a non-extractable key that can be read', async () => {
    const { backend, vault: v } = vault();
    const id = await v.create(1000);
    expect(id.pubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(id).toEqual({ pubkey: id.pubkey, createdAt: 1000, origin: 'generated', backupVerifiedAt: null });
    const rec = backend.records.get(id.pubkey)!;
    expect(rec.data.length).toBe(32 + 16); // 32 secret bytes + the AES-GCM tag: ciphertext, not a secret
    const key = await backend.getKey();
    expect(key!.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('raw', key!)).rejects.toBeTruthy();
    // What is listed or handed out is public only.
    expect(JSON.stringify(await v.list())).not.toMatch(/data|iv/);
    // Two identities are two different keys.
    const other = await v.create(1001);
    expect(other.pubkey).not.toBe(id.pubkey);
  });

  it('a record bound to one pubkey cannot be opened as another (AES-GCM associated data)', async () => {
    const { backend, vault: v } = vault();
    const a = await v.create(1);
    const b = await v.create(2);
    const ra = backend.records.get(a.pubkey)!;
    backend.records.set(b.pubkey, { ...ra, pubkey: b.pubkey }); // a's sealed secret moved onto b
    expect(await code(v.sign(b.pubkey, { kind: 1, created_at: 1, tags: [], content: 'x' }))).toBe('storage');
  });

  it('signs as the identity (a valid Schnorr signature by that pubkey); an unknown identity cannot sign', async () => {
    const { vault: v } = vault();
    const id = await v.create(1);
    const ev = await v.sign(id.pubkey, { kind: 31124, created_at: 1_700_000_000, tags: [['d', 'x']], content: '' });
    expect(ev.pubkey).toBe(id.pubkey);
    expect(verifyEvent(ev)).toBe(true);
    expect(await code(v.sign('f'.repeat(64), { kind: 1, created_at: 1, tags: [], content: '' }))).toBe('not-found');
  });

  it('makes a NIP-49 backup with the player password; only loading it back and opening it verifies it', async () => {
    const { vault: v } = vault();
    const id = await v.create(1);
    expect(await code(v.exportBackup(id.pubkey, 'short'))).toBe('wrong-password');
    const backup = await v.exportBackup(id.pubkey, 'bubbles and stars');
    expect(backup).toMatch(/^ncryptsec1/);
    expect(getPublicKey(nip49Decrypt(backup, 'bubbles and stars'))).toBe(id.pubkey); // the standard opens it
    expect((await v.identity(id.pubkey))!.backupVerifiedAt).toBe(null); // making it is not verifying it
    expect(await code(v.verifyBackup(id.pubkey, backup, 'wrong password!', 5))).toBe('wrong-password');
    expect(await code(v.verifyBackup(id.pubkey, backup.slice(0, -6) + 'qqqqqq', 'bubbles and stars', 5))).toMatch(/corrupt-backup|wrong-password/);
    expect(await code(v.verifyBackup(id.pubkey, 'hello', 'bubbles and stars', 5))).toBe('corrupt-backup');
    const other = await v.create(2);
    expect(await code(v.verifyBackup(other.pubkey, backup, 'bubbles and stars', 5))).toBe('mismatch');
    await v.verifyBackup(id.pubkey, backup, 'bubbles and stars', 9);
    expect((await v.identity(id.pubkey))!.backupVerifiedAt).toBe(9);
  }, 30_000);

  it('restores from a backup into an empty vault; an identity already here is never overwritten or duplicated', async () => {
    const a = vault();
    const id = await a.vault.create(1);
    const backup = await a.vault.exportBackup(id.pubkey, 'bubbles and stars');
    const b = vault();
    expect(await b.vault.inspectBackup(backup, 'bubbles and stars')).toEqual({ pubkey: id.pubkey, alreadyHere: false });
    expect(b.backend.records.size).toBe(0); // inspecting stores nothing
    expect(await code(b.vault.restore(backup, 'nope nope nope', 2))).toBe('wrong-password');
    const r = await b.vault.restore(backup, 'bubbles and stars', 3);
    expect(r).toMatchObject({ existed: false, identity: { pubkey: id.pubkey, origin: 'restored', backupVerifiedAt: 3 } });
    const ev = await b.vault.sign(id.pubkey, { kind: 1, created_at: 1, tags: [], content: 'same key' });
    expect(verifyEvent(ev)).toBe(true);
    const again = await b.vault.restore(backup, 'bubbles and stars', 4);
    expect(again.existed).toBe(true);
    expect(b.backend.records.size).toBe(1);
    // Restoring into the original vault changes nothing there either.
    const before = { ...a.backend.records.get(id.pubkey)! };
    expect((await a.vault.restore(backup, 'bubbles and stars', 5)).existed).toBe(true);
    expect(a.backend.records.get(id.pubkey)).toEqual(before);
  }, 30_000);
});
