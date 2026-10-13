/**
 * M11D.2, WORLD FORMS: a temporary, local, V3-style pixel form for a V1 or V2 Blobbi visiting Blobbi Pixel.
 *
 * A V1/V2 Blobbi has no V3 genome: its look is authored artwork painted with the colours its kind 31124 event states.
 * The pixel world animates only the procedural (V3-style) body, so while it visits, such a Blobbi borrows that body,
 * built from what it really is:
 *
 *   kept from the event    base, secondary and eye colour; pattern (the same four words); special mark (star, heart,
 *                          sparkle; `blush` becomes the procedural freckles, its nearest marking; `none` none); its
 *                          name and life stage (a V1/V2 Baby is a pixel Baby, an Adult a pixel Adult)
 *   derived, deterministic body shape, the placement of its markings, and the traits V1/V2 art does not state
 *                          (antenna, horns, ears, tail, belly), all from ONE seed derived from the canonical address
 *                          `(owner pubkey, d)`: `blobbi-pixel:world-form:v1:<pubkey>:<d>`
 *
 * So the same Blobbi always takes the same form, on every device, and two Blobbis never share one by chance. The seed
 * is domain-separated: it is not 64 hexadecimal digits, so it can never be read as a V3 seed, and no V3 address
 * derives it. Nothing is random and nothing is stored as identity: the Blobbi's identity stays its address
 * `31124:<pubkey>:<d>`, its generation stays V1 or V2, its event is never rewritten, signed or published.
 *
 * `WORLD_FORM_VERSION` names this mapping. A future change of mapping is a new version (a new seed prefix), never a
 * silent change to the forms players already know.
 */
import { generateGenome, type BlobbiGenome } from '@blobbi-kit/renderer/procedural';

export const WORLD_FORM_VERSION = 1;
const PREFIX = `blobbi-pixel:world-form:v${WORLD_FORM_VERSION}`;

export const WORLD_FORM_PATTERNS = ['solid', 'spotted', 'striped', 'gradient'] as const;
export const WORLD_FORM_MARKS = ['none', 'star', 'heart', 'sparkle', 'blush'] as const;
export type WorldFormPattern = (typeof WORLD_FORM_PATTERNS)[number];
export type WorldFormMark = (typeof WORLD_FORM_MARKS)[number];

/** What a V1/V2 event states about its look (read by the kit's `parseBlobbiEvent(...).visualTraits`). */
export interface WorldFormTraits {
  base: string;
  secondary: string;
  eye: string;
  pattern: WorldFormPattern;
  mark: WorldFormMark;
}

const HEX_COLOUR = /^#[0-9a-f]{6}$/;
const KEY_HEX = /^[0-9a-f]{64}$/;

/** The world form's seed for a canonical address. */
export function worldFormSeed(pubkey: string, d: string): string {
  return `${PREFIX}:${pubkey}:${d}`;
}

/** Whether a string is a world-form seed (never a V3 seed, never a demo the lab would accept as V3). */
export function isWorldFormSeed(seed: string): boolean {
  return seed.startsWith(`${PREFIX}:`);
}

/** Traits read from an event, checked and normalised (lower-case colours); null when they cannot make a form. */
export function cleanWorldFormTraits(raw: { base?: unknown; secondary?: unknown; eye?: unknown; pattern?: unknown; mark?: unknown }): WorldFormTraits | null {
  const colour = (v: unknown) => (typeof v === 'string' && HEX_COLOUR.test(v.toLowerCase()) ? v.toLowerCase() : null);
  const base = colour(raw.base);
  const secondary = colour(raw.secondary);
  const eye = colour(raw.eye);
  if (!base || !secondary || !eye) return null;
  // A pattern or mark this version does not know is read as the plain choice (solid, none), never refused: the colours
  // are what makes the Blobbi recognisable.
  const pattern = WORLD_FORM_PATTERNS.includes(raw.pattern as WorldFormPattern) ? (raw.pattern as WorldFormPattern) : 'solid';
  const mark = WORLD_FORM_MARKS.includes(raw.mark as WorldFormMark) ? (raw.mark as WorldFormMark) : 'none';
  return { base, secondary, eye, pattern, mark };
}

/** The pixel genome of a world form: the event's look stated, everything else from the address-derived seed. */
export function worldFormGenome(pubkey: string, d: string, traits: WorldFormTraits): BlobbiGenome {
  return generateGenome({
    seed: worldFormSeed(pubkey, d),
    // The Adult V2 colour rule, the one V1/V2 colours were chosen for: the same three colours read as they do there.
    colors: { base: traits.base, secondary: traits.secondary, eye: traits.eye, mapping: 'kit' },
    pattern: traits.pattern,
    mark: traits.mark === 'blush' ? 'none' : traits.mark,
    freckles: traits.mark === 'blush',
  });
}

/** Whether a stored world form is well formed and its seed is the one its address derives. */
export function validWorldForm(s: { pubkey?: unknown; d?: unknown; generation?: unknown; seed?: unknown; traits?: unknown }): boolean {
  if (typeof s.pubkey !== 'string' || !KEY_HEX.test(s.pubkey)) return false;
  if (typeof s.d !== 'string' || !s.d || s.d.length > 128) return false;
  if (s.generation !== 'v1' && s.generation !== 'v2') return false;
  if (s.seed !== worldFormSeed(s.pubkey, s.d)) return false;
  const t = s.traits as Partial<WorldFormTraits> | undefined;
  if (!t || typeof t !== 'object') return false;
  const clean = cleanWorldFormTraits(t);
  return !!clean && clean.base === t.base && clean.secondary === t.secondary && clean.eye === t.eye && clean.pattern === t.pattern && clean.mark === t.mark;
}
