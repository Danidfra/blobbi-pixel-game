/**
 * M11D.4, THE SECRET BACKUP FILE. Plain text a person can read: a few words on what it is and how to use it, the
 * identity encrypted with the player's password (NIP-49 `ncryptsec1…`, the standard every Nostr app can import), and
 * one line of PUBLIC facts naming the Blobbis it brings back (their d tags and names: what a relay would show anyway),
 * so a restore on a new device knows which Blobbi to bring even if it was never published.
 *
 * The file never contains a plaintext secret. Its name follows the Blobbi Standalone's backups:
 * `blobbi-nostr-key-backup-<npub8>.ncryptsec.txt`. Reading is strict: one ncryptsec, a size limit, and the public line
 * is checked against the identity the backup really opens (`identity.ts`), never trusted alone.
 *
 * M11D.5, THE RECOVERY KEY FILE: the player may choose instead a simple backup with no password. Same layout, but the
 * secret line is the plain NIP-19 `nsec1…` (what every Nostr app imports as a "private key"), named
 * `blobbi-nostr-recovery-key-<npub8>.nsec.txt`, and its first words say plainly that anyone holding it controls the
 * account. Reading accepts either file, or just the key pasted alone; a text holding both kinds (or two different
 * keys) is refused as unclear.
 */
import { npubEncode } from './keys';

export const BACKUP_MARK = 'blobbi-pixel-backup v1';
export const BACKUP_MAX_BYTES = 16_384;

export interface BackupBlobbi {
  d: string;
  petId: string;
  name: string;
  bornAt: number;
  /** M11D.5: the player chose this name (no naming question after a restore). Absent in M11D.4 files. */
  named?: boolean;
}

export interface BackupContents {
  /** M11D.5: a Protected Key (NIP-49) or a Recovery Key (the plain nsec). */
  kind: 'ncryptsec' | 'nsec';
  /** The secret line as found: the `ncryptsec1…` or the `nsec1…`. */
  secret: string;
  /** The public line, when present and well formed. */
  meta: { pubkey: string; blobbis: BackupBlobbi[] } | null;
}

export function backupFileName(pubkey: string): string {
  return `blobbi-nostr-key-backup-${npubEncode(pubkey).slice(5, 13)}.ncryptsec.txt`;
}

/** M11D.5: the Recovery Key file's name (a plain `.nsec.txt`, labelled as the key it is). */
export function recoveryFileName(pubkey: string): string {
  return `blobbi-nostr-recovery-key-${npubEncode(pubkey).slice(5, 13)}.nsec.txt`;
}

/** The file's text. `lines` are the human words, in the player's language (from the caller). */
export function buildBackupFile(secret: string, pubkey: string, blobbis: BackupBlobbi[], lines: readonly string[]): string {
  const meta = JSON.stringify({ pubkey, blobbis: blobbis.map((b) => ({ d: b.d, petId: b.petId, name: b.name, bornAt: b.bornAt, ...(b.named ? { named: true } : {}) })) });
  return [...lines, '', secret, '', `${BACKUP_MARK} ${meta}`, ''].join('\n');
}

/** Read a backup file or pasted text. Null when it holds no single well-formed secret backup. */
export function parseBackupFile(text: string): BackupContents | null {
  if (typeof text !== 'string' || text.length > BACKUP_MAX_BYTES) return null;
  const protectedKeys = text.match(/ncryptsec1[02-9ac-hj-np-z]{40,}/g) ?? [];
  const recoveryKeys = text.match(/(?<![0-9a-z])nsec1[02-9ac-hj-np-z]{58}(?![0-9a-z])/g) ?? [];
  const found = protectedKeys.length ? protectedKeys : recoveryKeys;
  if (!found.length || (protectedKeys.length && recoveryKeys.length) || new Set(found).size !== 1) return null;
  let meta: BackupContents['meta'] = null;
  const line = text.split('\n').find((l) => l.startsWith(`${BACKUP_MARK} `));
  if (line)
    try {
      const v = JSON.parse(line.slice(BACKUP_MARK.length + 1)) as { pubkey?: unknown; blobbis?: unknown };
      if (typeof v.pubkey === 'string' && /^[0-9a-f]{64}$/.test(v.pubkey) && Array.isArray(v.blobbis)) {
        const blobbis = v.blobbis
          .filter((b): b is BackupBlobbi => !!b && typeof b === 'object' && typeof (b as BackupBlobbi).d === 'string' && /^[0-9a-f]{10}$/.test(String((b as BackupBlobbi).petId)) && typeof (b as BackupBlobbi).name === 'string' && typeof (b as BackupBlobbi).bornAt === 'number')
          .slice(0, 20)
          .map((b) => ({ d: b.d, petId: b.petId, name: b.name.slice(0, 24), bornAt: b.bornAt, ...(b.named === true ? { named: true } : {}) }));
        meta = { pubkey: v.pubkey, blobbis };
      }
    } catch {
      meta = null;
    }
  return { kind: protectedKeys.length ? 'ncryptsec' : 'nsec', secret: found[0]!, meta };
}
