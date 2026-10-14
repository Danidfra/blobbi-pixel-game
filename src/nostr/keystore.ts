/**
 * M11D.4, THE KEY VAULT: the only module in the game that ever holds a Nostr secret key (`tests/boundaries.test.ts`
 * enforces it). A reserved guest identity is a real Nostr keypair made here, kept here, used here.
 *
 * STORAGE. Each secret (32 bytes) is encrypted with AES-GCM under ONE wrapping key that the browser generates as
 * NON-EXTRACTABLE (`crypto.subtle.generateKey(..., extractable: false)`) and keeps in IndexedDB as a CryptoKey object:
 * its raw bytes can never be read back by any script, exported, logged or copied out of the browser profile. The
 * record stores `{ pubkey, iv, data }`; the pubkey is the AES-GCM associated data, so a record cannot be swapped onto
 * another identity. Nothing secret ever goes to localStorage, and no plaintext secret is ever persisted.
 *
 * WHAT THIS DOES NOT DO (the threat model, docs/milestones/M11D4.md): any script running on this origin can still ask
 * the browser to decrypt with the wrapping key (that is how the game itself signs), so an injected script or a
 * compromised dependency could use or read the keys while the page is open. It protects against storage being read
 * at rest (a copied profile folder, a backup of the disk, another origin, a casual look at localStorage), not against
 * code running in the page. Clearing site data erases the keys: the player's NIP-49 backup is the recovery.
 *
 * PLAINTEXT LIFETIME. A secret is decrypted only inside `withSecret` for one operation (sign, make a backup, verify
 * one), and the bytes are zeroed right after, whatever happens. The UI never sees a secret; the backup is an
 * encrypted NIP-49 `ncryptsec` made with the player's own password, or (M11D.5, only on the player's explicit request
 * and acknowledgment) the plain NIP-19 `nsec` Recovery Key, handed out once for the file the player saves.
 *
 * Crypto is the browser's Web Crypto and nostr-tools (secp256k1 keys and Schnorr signatures, NIP-49 scrypt plus
 * XChaCha20-Poly1305): nothing is invented here.
 */
import { finalizeEvent, generateSecretKey, getPublicKey, type EventTemplate, type NostrEvent } from 'nostr-tools/pure';
import { decrypt as nip49Decrypt, encrypt as nip49Encrypt } from 'nostr-tools/nip49';
import { decode as nip19Decode, nsecEncode } from 'nostr-tools/nip19';

/** One stored identity: public key, and its secret encrypted under the vault's wrapping key. */
export interface VaultRecord {
  pubkey: string;
  iv: Uint8Array;
  data: Uint8Array;
  createdAt: number;
  /** 'generated' here, or 'restored' from a backup. */
  origin: 'generated' | 'restored';
  /** When a backup of it was verified (the player loaded it back with the password), or null. */
  backupVerifiedAt: number | null;
  /** M11D.5: which kind of backup was verified: a Recovery Key (`nsec`) or a Protected Key (`ncryptsec`). */
  backupKind?: BackupKind;
}

/** M11D.5: the two backups. A Recovery Key is the plain `nsec1…`; a Protected Key is the NIP-49 `ncryptsec1…`. */
export type BackupKind = 'nsec' | 'ncryptsec';

/** What the rest of the game may know about an identity in the vault: never a secret. */
export interface VaultIdentity {
  pubkey: string;
  createdAt: number;
  origin: 'generated' | 'restored';
  backupVerifiedAt: number | null;
  backupKind?: BackupKind;
}

/** Where records and the wrapping key live: IndexedDB in the browser, memory in tests. */
export interface VaultBackend {
  getKey(): Promise<CryptoKey | undefined>;
  putKey(key: CryptoKey): Promise<void>;
  get(pubkey: string): Promise<VaultRecord | undefined>;
  put(record: VaultRecord): Promise<void>;
  list(): Promise<VaultRecord[]>;
}

export type VaultErrorCode = 'unavailable' | 'wrong-password' | 'corrupt-backup' | 'not-found' | 'mismatch' | 'storage';

export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode, message: string = code) {
    super(message);
  }
}

const HEX = /^[0-9a-f]{64}$/;
const enc = new TextEncoder();
const zero = (b: Uint8Array) => b.fill(0);

export class KeyVault {
  private keyTask: Promise<CryptoKey> | null = null;

  constructor(
    private readonly backend: VaultBackend,
    private readonly subtle: SubtleCrypto = globalThis.crypto?.subtle,
    private readonly random: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
  ) {}

  /** The non-extractable wrapping key: made once, kept by the backend. */
  private wrappingKey(): Promise<CryptoKey> {
    this.keyTask ??= (async () => {
      if (!this.subtle) throw new VaultError('unavailable', 'Web Crypto is not available');
      const known = await this.backend.getKey();
      if (known) return known;
      const key = await this.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await this.backend.putKey(key);
      // Another tab may have stored one meanwhile: use whatever the store now holds.
      return (await this.backend.getKey()) ?? key;
    })();
    this.keyTask.catch(() => (this.keyTask = null));
    return this.keyTask;
  }

  private async seal(pubkey: string, secret: Uint8Array): Promise<{ iv: Uint8Array; data: Uint8Array }> {
    const key = await this.wrappingKey();
    const iv = this.random(12);
    const data = new Uint8Array(await this.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(pubkey) }, key, secret as BufferSource));
    return { iv, data };
  }

  /** Run `use` with the identity's secret, then zero it (whatever `use` does). */
  private async withSecret<T>(pubkey: string, use: (secret: Uint8Array) => T | Promise<T>): Promise<T> {
    const record = await this.backend.get(pubkey);
    if (!record) throw new VaultError('not-found', 'no such identity here');
    const key = await this.wrappingKey();
    let secret: Uint8Array;
    try {
      secret = new Uint8Array(await this.subtle.decrypt({ name: 'AES-GCM', iv: record.iv as BufferSource, additionalData: enc.encode(pubkey) }, key, record.data as BufferSource));
    } catch {
      throw new VaultError('storage', 'the stored identity could not be opened');
    }
    try {
      if (getPublicKey(secret) !== pubkey) throw new VaultError('mismatch', 'the stored identity does not match its public key');
      return await use(secret);
    } finally {
      zero(secret);
    }
  }

  /**
   * A NEW RESERVED IDENTITY: a fresh keypair (nostr-tools `generateSecretKey`), sealed and stored before its public
   * key is handed out. Never overwrites: a (vanishingly unlikely) clash with a stored pubkey is refused.
   */
  async create(now: number): Promise<VaultIdentity> {
    const secret = generateSecretKey();
    try {
      const pubkey = getPublicKey(secret);
      if (await this.backend.get(pubkey)) throw new VaultError('storage', 'identity already stored');
      const { iv, data } = await this.seal(pubkey, secret);
      const record: VaultRecord = { pubkey, iv, data, createdAt: now, origin: 'generated', backupVerifiedAt: null };
      await this.backend.put(record);
      // Read back: the identity is only handed out once it is really kept.
      const kept = await this.backend.get(pubkey);
      if (!kept) throw new VaultError('storage', 'the identity could not be kept');
      return publicOf(record);
    } finally {
      zero(secret);
    }
  }

  async has(pubkey: string): Promise<boolean> {
    return HEX.test(pubkey) && !!(await this.backend.get(pubkey));
  }

  async identity(pubkey: string): Promise<VaultIdentity | null> {
    const r = await this.backend.get(pubkey);
    return r ? publicOf(r) : null;
  }

  async list(): Promise<VaultIdentity[]> {
    return (await this.backend.list()).map(publicOf);
  }

  /** Sign an event as this identity (Schnorr, NIP-01). The template's author is this pubkey, always. */
  sign(pubkey: string, template: EventTemplate): Promise<NostrEvent> {
    return this.withSecret(pubkey, (secret) => finalizeEvent({ ...template, tags: template.tags.map((t) => [...t]) }, secret));
  }

  /**
   * A NIP-49 encrypted backup (`ncryptsec1…`) with the player's password (scrypt, logN 16). The key-security byte is
   * 0x02, "unknown": the key never left this vault in plaintext, but a browser page cannot prove it was never read by
   * a script on the page, so 0x01 ("known safe") is not claimed. The plaintext secret never leaves this module.
   */
  exportBackup(pubkey: string, password: string): Promise<string> {
    if (password.length < 8) return Promise.reject(new VaultError('wrong-password', 'the password is too short'));
    return this.withSecret(pubkey, (secret) => nip49Encrypt(secret, password.normalize('NFKC'), 16, 0x02));
  }

  /**
   * M11D.5, THE RECOVERY KEY: the identity's secret as a standard NIP-19 `nsec1…`, which every Nostr app can import.
   * Only for a direct request of the player (the UI asks for an explicit acknowledgment first). The string is handed
   * to the caller for the file the player saves; it is never stored, logged or shown by this module. A JavaScript
   * string cannot be zeroed: the caller drops its reference as soon as the file has been offered.
   */
  exportSecretKey(pubkey: string): Promise<string> {
    return this.withSecret(pubkey, (secret) => nsecEncode(secret));
  }

  /**
   * VERIFY A BACKUP: open it (a Protected Key with its password; a Recovery Key needs none) and check it is this
   * identity. Only a backup that was loaded back (from the saved file or pasted text) and opened counts; a started
   * download never does. Marks the identity. The kind is told by the text itself (`ncryptsec1…` or `nsec1…`).
   */
  async verifyBackup(pubkey: string, backup: string, password: string, now: number): Promise<void> {
    const found = openBackup(backup, password);
    try {
      if (getPublicKey(found) !== pubkey) throw new VaultError('mismatch', 'this backup belongs to another identity');
    } finally {
      zero(found);
    }
    const record = await this.backend.get(pubkey);
    if (!record) throw new VaultError('not-found');
    await this.backend.put({ ...record, backupVerifiedAt: now, backupKind: backupKindOf(backup) ?? undefined });
  }

  /** What a backup would restore (its public key and whether it is already here), without storing anything. */
  async inspectBackup(backup: string, password: string): Promise<{ pubkey: string; alreadyHere: boolean }> {
    const secret = openBackup(backup, password);
    try {
      const pubkey = getPublicKey(secret);
      return { pubkey, alreadyHere: await this.has(pubkey) };
    } finally {
      zero(secret);
    }
  }

  /**
   * RESTORE an identity from its backup (a Protected Key or a Recovery Key). An identity already here is left exactly as it is (never overwritten,
   * never duplicated); a new one is sealed and stored. Nothing is published.
   */
  async restore(backup: string, password: string, now: number): Promise<{ identity: VaultIdentity; existed: boolean }> {
    const secret = openBackup(backup, password);
    try {
      const pubkey = getPublicKey(secret);
      const known = await this.backend.get(pubkey);
      if (known) return { identity: publicOf(known), existed: true };
      const { iv, data } = await this.seal(pubkey, secret);
      const record: VaultRecord = { pubkey, iv, data, createdAt: now, origin: 'restored', backupVerifiedAt: now, backupKind: backupKindOf(backup) ?? undefined };
      await this.backend.put(record);
      if (!(await this.backend.get(pubkey))) throw new VaultError('storage', 'the identity could not be kept');
      return { identity: publicOf(record), existed: false };
    } finally {
      zero(secret);
    }
  }
}

const NCRYPTSEC = /^ncryptsec1[02-9ac-hj-np-z]{40,}$/;
const NSEC = /^nsec1[02-9ac-hj-np-z]{58}$/;

/** Which kind of backup this text is (`ncryptsec1…` or `nsec1…`), or null. */
export function backupKindOf(backup: string): BackupKind | null {
  const text = backup.trim();
  return NCRYPTSEC.test(text) ? 'ncryptsec' : NSEC.test(text) ? 'nsec' : null;
}

/**
 * Open a backup: decrypt a NIP-49 Protected Key (telling a wrong password from a damaged backup), or decode a
 * Recovery Key (NIP-19, checksummed; the password is not used). Errors never contain the text they were given.
 */
function openBackup(backup: string, password: string): Uint8Array {
  const text = backup.trim();
  const kind = backupKindOf(text);
  if (kind === 'nsec') {
    try {
      const d = nip19Decode(text);
      if (d.type !== 'nsec' || d.data.length !== 32) throw new Error('not a key');
      return new Uint8Array(d.data);
    } catch {
      throw new VaultError('corrupt-backup', 'this recovery key is damaged');
    }
  }
  if (kind !== 'ncryptsec') throw new VaultError('corrupt-backup', 'this is not a secret backup');
  try {
    return nip49Decrypt(text, password.normalize('NFKC'));
  } catch (e) {
    // NIP-49 authenticates the ciphertext: a wrong password and a damaged backup both fail to open; a bech32 error
    // means the text itself is damaged.
    const msg = String((e as Error)?.message ?? e);
    if (/checksum|bech32|invalid|unknown letter|length/i.test(msg) && !/tag|auth|decrypt/i.test(msg)) throw new VaultError('corrupt-backup', 'this backup is damaged');
    throw new VaultError('wrong-password', 'the password does not open this backup');
  }
}

const publicOf = (r: VaultRecord): VaultIdentity => ({ pubkey: r.pubkey, createdAt: r.createdAt, origin: r.origin, backupVerifiedAt: r.backupVerifiedAt, ...(r.backupKind ? { backupKind: r.backupKind } : {}) });

// ─── Backends ──────────────────────────────────────────────────────────────────────────────────────────

/** Memory (tests, and a browser without IndexedDB: nothing survives the page; the UI says so). */
export function memoryVaultBackend(): VaultBackend & { records: Map<string, VaultRecord> } {
  let key: CryptoKey | undefined;
  const records = new Map<string, VaultRecord>();
  return {
    records,
    getKey: async () => key,
    putKey: async (k) => void (key ??= k),
    get: async (p) => records.get(p),
    put: async (r) => void records.set(r.pubkey, { ...r }),
    list: async () => [...records.values()],
  };
}

export const VAULT_DB = 'blobbi-pixel-vault';

/** IndexedDB: database `blobbi-pixel-vault`, stores `keys` (by pubkey) and `meta` (the wrapping CryptoKey). */
export function indexedDbVaultBackend(idb: IDBFactory = globalThis.indexedDB): VaultBackend {
  if (!idb) throw new VaultError('unavailable', 'IndexedDB is not available');
  let dbTask: Promise<IDBDatabase> | null = null;
  const complete = (d: IDBDatabase) => d.objectStoreNames.contains('keys') && d.objectStoreNames.contains('meta');
  const openAt = (version?: number): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = version === undefined ? idb.open(VAULT_DB) : idb.open(VAULT_DB, version);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('keys')) d.createObjectStore('keys', { keyPath: 'pubkey' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      req.onsuccess = () => {
        const d = req.result;
        // Another tab needs a newer vault version: let it, and reopen on the next use (never block it).
        d.onversionchange = () => {
          d.close();
          dbTask = null;
        };
        resolve(d);
      };
      req.onerror = () => reject(new VaultError('unavailable', 'the vault could not be opened'));
      req.onblocked = () => reject(new VaultError('unavailable', 'the vault is busy in another tab'));
    });
  // A database of this name without its stores (made by something else, or an interrupted first open) is completed
  // by a version upgrade that only ADDS the missing stores: nothing in it is ever deleted.
  const db = () =>
    (dbTask ??= openAt().then(async (d) => {
      if (complete(d)) return d;
      const next = d.version + 1;
      d.close();
      const fixed = await openAt(next);
      if (!complete(fixed)) throw new VaultError('unavailable', 'the vault could not be prepared');
      return fixed;
    }));
  const run = <T>(store: 'keys' | 'meta', mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    db().then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const tx = d.transaction(store, mode);
          const req = op(tx.objectStore(store));
          let value: T;
          req.onsuccess = () => (value = req.result);
          tx.oncomplete = () => resolve(value);
          tx.onerror = () => reject(new VaultError('storage', 'the vault could not be written'));
          tx.onabort = () => reject(new VaultError('storage', 'the vault could not be written'));
        }),
    );
  return {
    getKey: () => run<CryptoKey | undefined>('meta', 'readonly', (s) => s.get('wrap') as IDBRequest<CryptoKey | undefined>),
    // `add`, not `put`: an existing wrapping key is never replaced (a second tab's add fails; the first key stays).
    putKey: (k) => run('meta', 'readwrite', (s) => s.add(k, 'wrap')).then(() => undefined, () => undefined),
    get: (p) => run<VaultRecord | undefined>('keys', 'readonly', (s) => s.get(p) as IDBRequest<VaultRecord | undefined>),
    put: (r) => run('keys', 'readwrite', (s) => s.put(r)).then(() => undefined),
    list: () => run<VaultRecord[]>('keys', 'readonly', (s) => s.getAll() as IDBRequest<VaultRecord[]>),
  };
}

/** Ask the browser to keep this site's storage under pressure (best effort; never relied on). */
export async function askPersistentStorage(): Promise<boolean> {
  try {
    return (await globalThis.navigator?.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
