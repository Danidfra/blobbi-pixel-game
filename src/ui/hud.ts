/**
 * THE HUD: what the player sees around the island while playing, drawn in the menus' design language (see
 * DESIGN below): small dark cards with a light rim and clipped corners, one accent colour; headings in the 3×5
 * capitals, words in the readable body font (M11B; cards are drawn at screen resolution, see `ui/surface.ts`).
 *
 *   ┌ status ───────────┐                       ┌ time and weather ┐
 *   │ [face] NAME  title│                       └──────────────────┘
 *   │ ⚘ ▮▮▮▮▮▯ ⚡ ▮▮▮▯▯ ♥ ▮▮▮▮▯│                   ┌ goal ────────────┐
 *   │ WOOD 3  STONE 2   │                       │ GOAL 2/16  TITLE │
 *   └───────────────────┘                       │ ▮▮▮▮▯▯▯ 2/3       │
 *   +1 WOOD  (toasts)                           └──────────────────┘
 *                      [ E  PICK UP THE STONE ]
 *   [tool Q] [camera]                       [USE E][BAG I]...
 *
 * Every builder is a pure function of the values it shows (cached by the caller under a key of those values), so
 * a frame redraws only what changed. Needs are never shown by colour alone: each bar has an icon, and a low need
 * gets a steady "!" mark (nothing in the HUD flashes).
 */
import { hex, type Color } from '../core/color';
import { PixelBuffer } from '../core/pixel';
import type { Inventory } from '../game/inventory';
import { getLocale, sentence, t, upper } from '../i18n';
import { UiSurface, bodyChoice, textPreference } from './surface';

/** The design system: colours, spacing and the card frame shared by the HUD and the menus. */
export const DESIGN = {
  card: hex('#1b1f2a'),
  cardHi: hex('#262c3c'),
  rim: hex('#4a5068'),
  rimLight: hex('#6a7290'),
  ink: hex('#f4efe4'),
  muted: hex('#9aa3b5'),
  accent: hex('#ffe07a'),
  good: hex('#4dffb0'),
  warn: hex('#ff8a7a'),
  fed: hex('#ffb13b'),
  energy: hex('#7ab8ff'),
  joy: hex('#ff7cc4'),
  pad: 3,
  line: 7,
} as const;

export const tw = (s: string) => Math.max(0, s.length * 4 - 1);

/** A card: filled, rimmed, its corners clipped (the soft pixel rounding used everywhere). */
export function card(w: number, h: number, accent?: Color): PixelBuffer {
  const b = new PixelBuffer(w, h);
  b.fillRect(0, 0, w, h, DESIGN.card);
  b.strokeRect(0, 0, w, h, DESIGN.rim);
  // A lighter top edge: light from above, like the island.
  b.fillRect(1, 0, w - 2, 1, DESIGN.rimLight);
  if (accent !== undefined) b.fillRect(0, 1, 1, h - 2, accent);
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) b.set(x, y, 0);
  return b;
}

/** 5×5 icons for the needs and the weather (drawn as text rows: '#' ink, '.' empty). */
const GLYPHS: Record<string, string[]> = {
  fed: ['..#..', '.###.', '#####', '#####', '.###.'], // a fruit
  energy: ['..##.', '.##..', '####.', '..##.', '.##..'], // a bolt
  joy: ['.#.#.', '#####', '#####', '.###.', '..#..'], // a heart
  sun: ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'],
  moon: ['.###.', '##...', '#....', '##...', '.###.'],
  rain: ['.###.', '#####', '.....', '#.#.#', '.#.#.'],
  cloud: ['.....', '.##..', '####.', '#####', '.....'],
  dusk: ['.....', '..#..', '.###.', '#####', '-----'],
};

/** Anything with `set` in UI pixels (a buffer or a UI surface). */
type Paintable = Pick<PixelBuffer, 'set'>;

export function glyph(b: Paintable, name: keyof typeof GLYPHS | string, x: number, y: number, c: Color): void {
  const rows = GLYPHS[name];
  if (!rows) return;
  rows.forEach((row, j) => [...row].forEach((ch, i) => (ch === '#' || ch === '-') && b.set(x + i, y + j, c)));
}

/**
 * Text widths for HUD layouts at a scale (M11B): cards are sized by the text as drawn (the body font where the scale
 * allows it), so a card is never wider than its words.
 */
const probes = new Map<number, UiSurface>();
function textAt(scale: number): (t: string, style?: 'body' | 'title') => number {
  let p = probes.get(scale);
  if (!p || p.body !== bodyChoice(scale, textPreference.smaller)) probes.set(scale, (p = new UiSurface(1, 1, scale)));
  const probe = p;
  return (t, style = 'body') => probe.measure(t, style);
}

/** A meter: an icon, a segmented bar (10 segments, so the value reads by length too) and a "!" when low. */
function meter(b: UiSurface, icon: string, value: number, colour: Color, x: number, y: number): void {
  glyph(b, icon, x, y, colour);
  const segs = Math.round(Math.max(0, Math.min(100, value)) / 10);
  for (let i = 0; i < 10; i++) b.fillRect(x + 7 + i * 3, y + 1, 2, 3, i < segs ? colour : DESIGN.cardHi);
  if (value < 25) b.text('!', x + 38, y, DESIGN.warn, 'title');
}

export interface StatusInfo {
  name: string;
  /** The friendship title. */
  title: string;
  fed: number;
  energy: number;
  joy: number;
  /** Up to three carried things worth showing, e.g. "WOOD 3". */
  carried: string[];
  /** The Blobbi's face for the portrait (the canonical sprite, small), or null. */
  face: PixelBuffer | null;
  /** Presence: "AWAY" while teleported away. */
  away: boolean;
}

/** HUD builders draw at `scale` (screen pixels per UI pixel) and return the card at screen resolution. */
export function statusCard(s: StatusInfo, scale = 1): PixelBuffer {
  const w0 = textAt(scale);
  const portrait = 18;
  const name = [...s.name].slice(0, 14).join('');
  const title = s.away ? t('hud.away') : sentence(s.title);
  const carried = s.carried.join('  ');
  const textW = Math.max(w0(name) + 4 + w0(title), 42, w0(carried));
  const w = DESIGN.pad * 2 + portrait + 3 + textW + 1;
  const h = carried ? 34 : 27;
  const b = new UiSurface(w, h, scale);
  b.blit(card(w, h), 0, 0);
  // Portrait: a framed square with the Blobbi in it.
  const px = DESIGN.pad;
  const py = DESIGN.pad;
  b.fillRect(px, py, portrait, portrait, DESIGN.cardHi);
  b.strokeRect(px, py, portrait, portrait, DESIGN.rim);
  if (s.face && !s.away) {
    const f = s.face;
    b.blit(f, px + Math.floor((portrait - f.width) / 2), py + portrait - 1 - f.height);
  }
  const tx = px + portrait + 3;
  b.text(name, tx, py, DESIGN.ink);
  b.text(title, tx + w0(name) + 4, py, s.away ? DESIGN.energy : DESIGN.muted);
  meter(b, 'fed', s.fed, DESIGN.fed, tx, py + 7);
  meter(b, 'energy', s.energy, DESIGN.energy, tx, py + 13);
  meter(b, 'joy', s.joy, DESIGN.joy, tx, py + 19);
  if (carried) b.text(carried, DESIGN.pad, h - 8, DESIGN.muted);
  return b.out;
}

/** "Day 3  7:30 AM" with a sun, moon, dusk or rain icon. */
export function timeChip(day: number, hour: number, rain: number, scale = 1): PixelBuffer {
  const hh = Math.floor(hour);
  const mm = Math.floor((hour - hh) * 6) * 10;
  const text = `${t('hud.day', { day })}  ${clock(hh, mm)}`;
  const icon = rain > 0.45 ? 'rain' : rain > 0.2 ? 'cloud' : hour >= 18 && hour < 20.5 ? 'dusk' : hour >= 20.5 || hour < 5.5 ? 'moon' : 'sun';
  const w = textAt(scale)(text) + 2 * DESIGN.pad + 8;
  const b = new UiSurface(w, 11, scale);
  b.blit(card(w, 11), 0, 0);
  glyph(b, icon, DESIGN.pad, 3, icon === 'sun' || icon === 'dusk' ? DESIGN.accent : icon === 'moon' ? DESIGN.ink : DESIGN.energy);
  b.text(text, DESIGN.pad + 8, 3, DESIGN.ink);
  return b.out;
}

/** A clock time as the language writes it: "7:30 AM" in English, "7:30" (24 hours) in Portuguese and Spanish. */
export function clock(hh: number, mm: number): string {
  const m2 = String(mm).padStart(2, '0');
  return getLocale() === 'en' ? `${((hh + 11) % 12) + 1}:${m2} ${hh < 12 ? 'AM' : 'PM'}` : `${hh}:${m2}`;
}

/** The current goal: number, title, and a progress bar when the progress reads "n/m". */
export function goalCard(n: number, total: number, title: string, progress: string, scale = 1): PixelBuffer {
  const w0 = textAt(scale);
  const head = upper(t('hud.goal', { n, total }));
  const name = [...title].slice(0, 30).join('');
  const m = /(\d+)\s*\/\s*(\d+)/.exec(progress);
  const w = Math.max(w0(head, 'title') + 4 + w0(name), 60) + 2 * DESIGN.pad + 2;
  const h = m ? 18 : 11;
  const b = new UiSurface(w, h, scale);
  b.blit(card(w, h, DESIGN.accent), 0, 0);
  b.text(head, DESIGN.pad + 1, 3, DESIGN.accent, 'title');
  b.text(name, DESIGN.pad + 1 + w0(head, 'title') + 4, 3, DESIGN.ink);
  if (m) {
    const have = Math.min(Number(m[1]), Number(m[2]));
    const need = Math.max(1, Number(m[2]));
    const label = `${have}/${need}`;
    const lw = w0(label);
    const barW = w - 2 * DESIGN.pad - lw - 5;
    b.fillRect(DESIGN.pad + 1, 11, barW, 3, DESIGN.cardHi);
    b.fillRect(DESIGN.pad + 1, 11, Math.round((barW * have) / need), 3, have >= need ? DESIGN.good : DESIGN.accent);
    b.text(label, w - DESIGN.pad - lw, 10, DESIGN.muted);
  }
  return b.out;
}

/**
 * The pinned side quest (M10 phase C): a slimmer card than the main goal's, "SIDE" and the title, a thin progress
 * bar when it counts something. J opens the journal, where it is pinned and unpinned.
 */
export function pinnedCard(title: string, progress: string, scale = 1): PixelBuffer {
  const w0 = textAt(scale);
  const head = upper(t('hud.side'));
  const name = [...title].slice(0, 26).join('');
  const m = /(\d+)\s*\/\s*(\d+)/.exec(progress);
  const label = m ? `${Math.min(Number(m[1]), Number(m[2]))}/${Math.max(1, Number(m[2]))}` : '';
  const w = w0(head, 'title') + 4 + w0(name) + (label ? 4 + w0(label) : 0) + 2 * DESIGN.pad + 2;
  const h = m ? 13 : 11;
  const b = new UiSurface(w, h, scale);
  b.blit(card(w, h), 0, 0);
  b.text(head, DESIGN.pad + 1, 3, DESIGN.muted, 'title');
  b.text(name, DESIGN.pad + 1 + w0(head, 'title') + 4, 3, DESIGN.ink);
  if (m) {
    const have = Math.min(Number(m[1]), Number(m[2]));
    const need = Math.max(1, Number(m[2]));
    b.text(label, w - DESIGN.pad - w0(label), 3, DESIGN.muted);
    const barW = w - 2 * DESIGN.pad - 2;
    b.fillRect(DESIGN.pad + 1, 9, barW, 2, DESIGN.cardHi);
    b.fillRect(DESIGN.pad + 1, 9, Math.round((barW * have) / need), 2, have >= need ? DESIGN.good : DESIGN.accent);
  }
  return b.out;
}

/** The tool in hand: its icon, name and the key that changes it. */
export function toolChip(icon: PixelBuffer | null, name: string, scale = 1): PixelBuffer {
  const w0 = textAt(scale);
  const text = name;
  const w = (icon ? icon.width + 3 : 0) + w0(text) + 6 + 3 + 2 * DESIGN.pad;
  const h = Math.max(11, (icon?.height ?? 0) + 4);
  const b = new UiSurface(w, h, scale);
  b.blit(card(w, h), 0, 0);
  if (icon) b.blit(icon, DESIGN.pad, Math.floor((h - icon.height) / 2));
  b.text(text, DESIGN.pad + (icon ? icon.width + 3 : 0), Math.floor((h - 5) / 2), DESIGN.ink);
  b.text('Q', w - DESIGN.pad - 3, Math.floor((h - 5) / 2), DESIGN.accent, 'title');
  return b.out;
}

/** An item-gained toast: "+3 wood" with the item's icon. */
export function toastCard(icon: PixelBuffer | null, text: string, scale = 1): PixelBuffer {
  const w = (icon ? icon.width + 3 : 0) + textAt(scale)(text) + 2 * DESIGN.pad;
  const h = Math.max(11, (icon?.height ?? 0) + 2);
  const b = new UiSurface(w, h, scale);
  b.blit(card(w, h, DESIGN.good), 0, 0);
  if (icon) b.blit(icon, DESIGN.pad, Math.floor((h - icon.height) / 2));
  b.text(text, DESIGN.pad + (icon ? icon.width + 3 : 0), Math.floor((h - 5) / 2), DESIGN.ink);
  return b.out;
}

export interface Toast {
  item: string;
  quantity: number;
  /** Real seconds it appeared. */
  at: number;
}

export const TOAST_SECONDS = 2.6;
export const MAX_TOASTS = 4;

/**
 * Item-acquisition toasts: watches the bag between frames and turns increases into toasts (merging repeats of the
 * same item while they show). Decreases (using, storing) say nothing.
 */
export class ToastFeed {
  readonly toasts: Toast[] = [];
  private last = new Map<string, number>();
  private primed = false;

  update(inventory: Inventory, now: number): void {
    const counts = new Map(inventory.entries().map((e) => [e.item, e.quantity] as [string, number]));
    if (this.primed)
      for (const [item, q] of counts) {
        const gained = q - (this.last.get(item) ?? 0);
        if (gained <= 0) continue;
        const open = this.toasts.find((t) => t.item === item && now - t.at < TOAST_SECONDS * 0.7);
        if (open) {
          open.quantity += gained;
          open.at = now;
        } else this.toasts.push({ item, quantity: gained, at: now });
      }
    this.primed = true;
    this.last = counts;
    while (this.toasts.length && (now - this.toasts[0].at > TOAST_SECONDS || this.toasts.length > MAX_TOASTS)) this.toasts.shift();
  }

  /** Forget the bag (a scene or world change), so a new bag does not toast everything in it. */
  reset(): void {
    this.primed = false;
    this.toasts.length = 0;
  }
}
