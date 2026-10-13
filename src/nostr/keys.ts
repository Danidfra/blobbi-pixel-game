/**
 * PUBLIC KEYS: validation and the NIP-19 `npub` form (bech32, BIP-173), written here so the display needs no
 * network library. Public data only: this module never sees or derives a secret key.
 */

const HEX64 = /^[0-9a-f]{64}$/;

/** A Nostr public key as NIP-01 writes it: 32 bytes, lowercase hex. */
export function isPublicKeyHex(value: unknown): value is string {
  return typeof value === 'string' && HEX64.test(value);
}

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

/** 8-bit bytes to 5-bit groups, padded. */
function toWords(bytes: number[]): number[] {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >>> bits) & 31);
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

/** The `npub1…` form of a hex public key (NIP-19). Throws on anything that is not 64 lowercase hex characters. */
export function npubEncode(pubkey: string): string {
  if (!isPublicKeyHex(pubkey)) throw new Error('not a public key');
  const bytes: number[] = [];
  for (let i = 0; i < 64; i += 2) bytes.push(parseInt(pubkey.slice(i, i + 2), 16));
  const hrp = 'npub';
  const data = toWords(bytes);
  const mod = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data, ...checksum].map((w) => CHARSET[w]).join('')}`;
}

/** "npub1abcd…wxyz": enough to recognise an account at a glance. */
export function shortNpub(npub: string): string {
  return npub.length > 16 ? `${npub.slice(0, 9)}…${npub.slice(-4)}` : npub;
}
