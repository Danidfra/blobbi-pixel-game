/**
 * THE BODY FONT (M11B): a small, readable pixel font for sentences — quests, dialogue, descriptions, notices — next
 * to the chunky 3×5 capitals that stay for titles and headings. Hand-made for this game, drawn crisp at whole-number
 * magnification (never smoothed).
 *
 * Two sizes share the design: `BODY_SMALL` (below) and `BODY_LARGE` (`body-large.ts`, two pixels taller), so each
 * screen scale gets the largest text that fits the layout (see `ui/surface.ts`).
 *
 * Metrics of the small size (font pixels): a glyph has 9 rows — rows 0..6 are the capital height (row 6 sits on the baseline), lowercase
 * letters fill rows 2..6 (x-height 5) with ascenders to row 0, and descenders use rows 7..8. Accents are marks drawn
 * over a base letter (Unicode NFD), in rows 0..1 over lowercase and in the two rows above row 0 over capitals; a
 * cedilla hangs below. Glyphs are proportional (1 to 5 pixels wide) with one pixel between them; a space is 3.
 * Every character used by the game's languages must be drawable (`tests/i18n.test.ts`).
 */
import type { Color } from '../../core/color';
import type { PixelBuffer } from '../../core/pixel';
import { LARGE_DOTLESS, LARGE_GLYPHS, LARGE_MARKS } from './body-large';

const G = (...rows: string[]) => rows;
const X = (...r: string[]) => ['', '', ...r]; // lowercase without an ascender: rows 0 and 1 empty

/** The glyphs: '#' ink, '.' empty; short arrays are padded with empty rows. */
const SMALL_GLYPHS: Record<string, string[]> = {
  a: X('.##.', '...#', '.###', '#..#', '.###'),
  b: G('#...', '#...', '###.', '#..#', '#..#', '#..#', '###.'),
  c: X('.###', '#...', '#...', '#...', '.###'),
  d: G('...#', '...#', '.###', '#..#', '#..#', '#..#', '.###'),
  e: X('.##.', '#..#', '####', '#...', '.###'),
  f: G('.##', '#..', '###', '#..', '#..', '#..', '#..'),
  g: X('.###', '#..#', '#..#', '#..#', '.###', '...#', '###.'),
  h: G('#...', '#...', '###.', '#..#', '#..#', '#..#', '#..#'),
  i: G('#', '.', '#', '#', '#', '#', '#'),
  j: G('.#', '..', '.#', '.#', '.#', '.#', '.#', '.#', '#.'),
  k: G('#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#'),
  l: G('#.', '#.', '#.', '#.', '#.', '#.', '.#'),
  m: X('####.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'),
  n: X('###.', '#..#', '#..#', '#..#', '#..#'),
  o: X('.##.', '#..#', '#..#', '#..#', '.##.'),
  p: X('###.', '#..#', '#..#', '#..#', '###.', '#...', '#...'),
  q: X('.###', '#..#', '#..#', '#..#', '.###', '...#', '...#'),
  r: X('#.##', '##..', '#...', '#...', '#...'),
  s: X('.###', '#...', '.##.', '...#', '###.'),
  t: G('.#.', '.#.', '###', '.#.', '.#.', '.#.', '..#'),
  u: X('#..#', '#..#', '#..#', '#..#', '.###'),
  v: X('#...#', '#...#', '.#.#.', '.#.#.', '..#..'),
  w: X('#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'),
  x: X('#...#', '.#.#.', '..#..', '.#.#.', '#...#'),
  y: X('#..#', '#..#', '#..#', '#..#', '.###', '...#', '###.'),
  z: X('####', '...#', '.##.', '#...', '####'),
  A: G('.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'),
  B: G('####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'),
  C: G('.####', '#....', '#....', '#....', '#....', '#....', '.####'),
  D: G('####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'),
  E: G('#####', '#....', '#....', '####.', '#....', '#....', '#####'),
  F: G('#####', '#....', '#....', '####.', '#....', '#....', '#....'),
  G: G('.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'),
  H: G('#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'),
  I: G('###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'),
  J: G('...#', '...#', '...#', '...#', '...#', '#..#', '.##.'),
  K: G('#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'),
  L: G('#...', '#...', '#...', '#...', '#...', '#...', '####'),
  M: G('#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'),
  N: G('#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'),
  O: G('.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'),
  P: G('####.', '#...#', '#...#', '####.', '#....', '#....', '#....'),
  Q: G('.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'),
  R: G('####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'),
  S: G('.####', '#....', '#....', '.###.', '....#', '....#', '####.'),
  T: G('#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'),
  U: G('#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'),
  V: G('#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'),
  W: G('#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'),
  X: G('#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'),
  Y: G('#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'),
  Z: G('#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'),
  '0': G('.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'),
  '1': G('.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'),
  '2': G('.##.', '#..#', '...#', '..#.', '.#..', '#...', '####'),
  '3': G('###.', '...#', '...#', '.##.', '...#', '...#', '###.'),
  '4': G('..#.', '.##.', '#.#.', '#.#.', '####', '..#.', '..#.'),
  '5': G('####', '#...', '###.', '...#', '...#', '#..#', '.##.'),
  '6': G('.##.', '#...', '#...', '###.', '#..#', '#..#', '.##.'),
  '7': G('####', '...#', '...#', '..#.', '..#.', '.#..', '.#..'),
  '8': G('.##.', '#..#', '#..#', '.##.', '#..#', '#..#', '.##.'),
  '9': G('.##.', '#..#', '#..#', '.###', '...#', '...#', '.##.'),
  '.': G('.', '.', '.', '.', '.', '.', '#'),
  ',': G('..', '..', '..', '..', '..', '.#', '.#', '#.'),
  ':': G('.', '.', '.', '#', '.', '.', '#'),
  ';': G('..', '..', '..', '.#', '..', '..', '.#', '#.'),
  '!': G('#', '#', '#', '#', '#', '.', '#'),
  '?': G('.##.', '#..#', '...#', '..#.', '.#..', '....', '.#..'),
  '¡': G('#', '.', '#', '#', '#', '#', '#'),
  '¿': G('..#.', '....', '..#.', '.#..', '#...', '#..#', '.##.'),
  "'": G('#', '#'),
  '’': G('#', '#'),
  '‘': G('#', '#'),
  '"': G('#.#', '#.#'),
  '“': G('#.#', '#.#'),
  '”': G('#.#', '#.#'),
  '(': G('.#', '#.', '#.', '#.', '#.', '#.', '.#'),
  ')': G('#.', '.#', '.#', '.#', '.#', '.#', '#.'),
  '[': G('##', '#.', '#.', '#.', '#.', '#.', '##'),
  ']': G('##', '.#', '.#', '.#', '.#', '.#', '##'),
  '-': G('...', '...', '...', '###'),
  '–': G('....', '....', '....', '####'),
  '—': G('.....', '.....', '.....', '#####'),
  '_': G('....', '....', '....', '....', '....', '....', '....', '####'),
  '+': G('...', '...', '.#.', '###', '.#.'),
  '=': G('...', '...', '###', '...', '###'),
  '×': G('...', '...', '#.#', '.#.', '#.#'),
  '/': G('..#', '..#', '.#.', '.#.', '.#.', '#..', '#..'),
  '%': G('##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'),
  '<': G('...', '...', '..#', '.#.', '#..', '.#.', '..#'),
  '>': G('...', '...', '#..', '.#.', '..#', '.#.', '#..'),
  '*': G('...', '#.#', '.#.', '#.#'),
  '&': G('.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'),
  '#': G('.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'),
  '…': G('.....', '.....', '.....', '.....', '.....', '.....', '#.#.#'),
  '·': G('.', '.', '.', '#'),
  'º': G('.#.', '#.#', '.#.', '...', '###'),
  'ª': G('.##', '#.#', '.##', '...', '###'),
  '°': G('.#.', '#.#', '.#.'),
  '$': G('.###.', '#.#..', '#.#..', '.###.', '..#.#', '..#.#', '.###.'),
  '@': G('.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'),
  '|': G('#', '#', '#', '#', '#', '#', '#', '#'),
  '~': G('....', '....', '.#.#', '#.#.'),
};

/** Dotless i and j, for accents. */
const SMALL_DOTLESS: Record<string, string[]> = { i: X('#', '#', '#', '#', '#'), j: X('.#', '.#', '.#', '.#', '.#', '.#', '#.') };

/** Accent marks (NFD combining characters), centred over the base letter. */
const SMALL_MARKS: Record<string, { rows: string[]; below?: boolean }> = {
  '́': { rows: ['..#', '.#.'] }, // acute
  '̀': { rows: ['#..', '.#.'] }, // grave
  '̂': { rows: ['.#.', '#.#'] }, // circumflex
  '̃': { rows: ['.#.#', '#.#.'] }, // tilde
  '̈': { rows: ['...', '#.#'] }, // diaeresis
  '̧': { rows: ['.#', '#.'], below: true }, // cedilla
};

interface Prepared {
  width: number;
  /** Ink pixels relative to the glyph's top (capital accents have negative rows). */
  pixels: readonly (readonly [number, number])[];
}

function pixelsOf(rows: readonly string[], dy = 0, dx = 0): [number, number][] {
  const out: [number, number][] = [];
  rows.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && out.push([dx + i, dy + j])));
  return out;
}

export interface FontSpec {
  name: string;
  glyphs: Record<string, string[]>;
  dotless: Record<string, string[]>;
  marks: Record<string, { rows: string[]; below?: boolean }>;
  /** Capital height in rows (the baseline is the last of them). */
  capRows: number;
  /** All rows of a glyph (capitals and descenders). */
  rows: number;
  /** Space between glyphs and the width of a space. */
  gap: number;
  space: number;
}

/** A pixel font: proportional glyphs from text rows, accents composed from marks (NFD), drawn at whole magnification. */
export class PixelFont {
  private readonly cache = new Map<string, Prepared | null>();
  /** The widest advance (glyph + gap), for layout limits. */
  readonly maxAdvance: number;

  constructor(readonly spec: FontSpec) {
    this.maxAdvance = Math.max(...Object.values(spec.glyphs).map((g) => Math.max(...g.map((r) => r.length)))) + spec.gap;
  }

  /** Rows a line needs: two for capital accents above, the glyph rows below. */
  get cellRows(): number {
    return this.spec.rows + 2;
  }

  private prepare(ch: string): Prepared | null {
    const hit = this.cache.get(ch);
    if (hit !== undefined) return hit;
    const { glyphs, dotless, marks: MARKS, capRows } = this.spec;
    let out: Prepared | null = null;
    const direct = glyphs[ch];
    if (direct) out = { width: Math.max(...direct.map((r) => r.length)), pixels: pixelsOf(direct) };
    else {
      const [base, ...marks] = ch.normalize('NFD');
      const glyph = (marks.length && dotless[base]) || glyphs[base];
      if (glyph && marks.length && marks.every((m) => MARKS[m])) {
        const width = Math.max(...glyph.map((r) => r.length));
        const pixels = pixelsOf(glyph);
        const capital = base !== base.toLowerCase();
        for (const m of marks) {
          const mark = MARKS[m];
          const mw = Math.max(...mark.rows.map((r) => r.length));
          const dx = mark.below ? Math.max(0, Math.floor(width / 2) - 1) : Math.floor((width - mw) / 2);
          const dy = mark.below ? capRows : capital ? -2 : 0;
          pixels.push(...pixelsOf(mark.rows, dy, dx));
        }
        out = { width, pixels };
      }
    }
    this.cache.set(ch, out);
    return out;
  }

  /** Whether this font can draw the character (spaces always). */
  has(ch: string): boolean {
    return /\s/.test(ch) || this.prepare(ch.normalize('NFC')) !== null;
  }

  /** Width in font pixels (×m on screen). Unknown characters take the width of '?'. */
  width(text: string): number {
    let w = 0;
    let first = true;
    for (const ch of text.normalize('NFC')) {
      if (!first) w += this.spec.gap;
      first = false;
      w += ch === ' ' ? this.spec.space - this.spec.gap : (this.prepare(ch) ?? this.prepare('?')!).width;
    }
    return Math.max(0, w);
  }

  /** Draw with (x, y) at the top of the capital height, each font pixel an m×m square. */
  draw(buf: PixelBuffer, text: string, x: number, y: number, color: Color, m = 1): void {
    let cx = x;
    let first = true;
    for (const ch of text.normalize('NFC')) {
      if (!first) cx += this.spec.gap * m;
      first = false;
      if (ch === ' ') {
        cx += (this.spec.space - this.spec.gap) * m;
        continue;
      }
      const g = this.prepare(ch) ?? this.prepare('?')!;
      for (const [px, py] of g.pixels) buf.fillRect(cx + px * m, y + py * m, m, m, color);
      cx += g.width * m;
    }
  }
}

/** The body font: capitals 7 rows, x-height 5. */
export const BODY_SMALL = new PixelFont({ name: 'body-7', glyphs: SMALL_GLYPHS, dotless: SMALL_DOTLESS, marks: SMALL_MARKS, capRows: 7, rows: 9, gap: 1, space: 3 });
/** The larger body font: capitals 9 rows, x-height 6. */
export const BODY_LARGE = new PixelFont({ name: 'body-9', glyphs: LARGE_GLYPHS, dotless: LARGE_DOTLESS, marks: LARGE_MARKS, capRows: 9, rows: 12, gap: 1, space: 4 });

/** Whether every body font can draw the character. */
export const bodyFontHas = (ch: string): boolean => BODY_SMALL.has(ch) && BODY_LARGE.has(ch);
