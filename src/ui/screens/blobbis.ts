/**
 * MY BLOBBIS (M11C): the connected player's canonical Blobbis, read from their own kind 31124 events, and the choice
 * of which one walks the island. Read-only: nothing here publishes, signs or changes a Blobbi, and choosing changes
 * only who walks (the island, its bag, buildings and progress are the island's and stay exactly as they are).
 *
 * - A V3 adult may visit: its preview is the pixel game's own drawing of it (the kit's V3 renderer, rasterized), the
 *   same picture that will walk.
 * - V1 and V2 Blobbis, eggs and babies are listed with the reason they cannot visit yet, and only their colours are
 *   shown (never an unrelated V3 creature drawn in their place).
 * - Nothing found: says so. The game never creates a Blobbi and never sends the player elsewhere.
 *
 * The list is read when the screen opens (at most every few minutes, never during play) through the account's
 * `BlobbiCollectionPort`; the Nostr module itself is never imported here.
 */
import { PixelBuffer } from '../../core/pixel';
import { hex } from '../../core/color';
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';
import { blobbiIdentity } from '../../blobbi/identity';
import { generateGenome } from '@blobbi-kit/renderer/procedural';
import { buildBlobbiSprite, REST_POSE } from '../../blobbi/sprite';
import { t, upper, type MessageKey } from '../../i18n';
import type { BlobbiCollectionPort, OwnedBlobbi } from '../../nostr/port';

/** What the host (the playground) does when the player chooses. */
export interface BlobbiChooser {
  /** The address (`31124:pubkey:d`) of the canonical Blobbi walking the island now, or null (the visiting Blobbi). */
  selectedAddress(): string | null;
  /** Bring this Blobbi to the island (only ever called for an `available` one). True when it happened. */
  choose(blobbi: OwnedBlobbi): boolean;
  /** Back to the island's visiting Blobbi. */
  useVisitor(): void;
}

const ROWS = 7;
const ROW_H = 18;

export class BlobbisScreen implements Screen {
  readonly id = 'blobbis' as const;
  index = 0;
  collection: BlobbiCollectionPort | null = null;
  chooser: BlobbiChooser | null = null;
  /** Previews by seed and size (drawing a Blobbi costs a few milliseconds: once per Blobbi, never per frame). */
  private readonly previews = new Map<string, PixelBuffer>();

  title(): string {
    return t('blobbis.title');
  }

  opened(): void {
    this.index = 0;
    void this.collection?.loadBlobbis();
  }

  private items(): readonly OwnedBlobbi[] {
    return this.collection?.blobbis().items ?? [];
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    const items = this.items();
    const moved = moveSelection(code, this.index, items.length, 1);
    if (moved !== null) {
      this.index = moved;
      return true;
    }
    if (isConfirm(code) || code === 'KeyE') {
      const b = items[this.index];
      if (b) this.choose(b, ui);
      return true;
    }
    if (code === 'KeyR') {
      void this.collection?.loadBlobbis(true);
      return true;
    }
    return false;
  }

  private choose(b: OwnedBlobbi, ui: GameUI): void {
    if (!this.chooser) return;
    if (b.availability !== 'available') {
      ui.say(t(reasonKey(b), { g: b.generation.toUpperCase() }), false);
      return;
    }
    if (this.chooser.selectedAddress() === b.address) {
      ui.say(t('blobbis.alreadyHere', { name: b.name }));
      return;
    }
    if (this.chooser.choose(b)) ui.say(t('blobbis.chosen', { name: b.name }));
    else ui.say(t('blobbis.couldNotChoose'), false);
  }

  /** The pixel game's own picture of a V3 Blobbi (the sprite that will walk), as large as fits `box`, cached. */
  preview(seed: string, box: number): PixelBuffer {
    const key = `${seed}|${box}`;
    let p = this.previews.get(key);
    if (!p) {
      // The sprite's buffer is taller than its standing size (antennae, outline): step down until it fits the box.
      for (let size = box; size >= 6; size -= 2) {
        p = buildBlobbiSprite(blobbiIdentity(seed), REST_POSE, size).buffer;
        if (p.height <= box && p.width <= box) break;
      }
      if (this.previews.size > 40) this.previews.clear();
      this.previews.set(key, p!);
    }
    return p!;
  }

  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void {
    const col = this.collection;
    if (!col) {
      g.para(t('account.unavailable'), x, y, w, UI.muted);
      return;
    }
    const snap = col.blobbis();
    if (snap.status === 'idle' && !snap.owner) {
      g.para(t('blobbis.connectFirst'), x, y, w, UI.ink);
      return;
    }
    if (snap.status === 'loading' && !snap.items.length) {
      g.para(t('blobbis.loading'), x, y, w, UI.muted);
      return;
    }
    if (snap.status === 'unavailable' && !snap.items.length) {
      let cy = y + g.para(t('blobbis.unavailable'), x, y, w, UI.ink) + 4;
      g.button(t('blobbis.tryAgain'), x, cy, () => void col.loadBlobbis(true), { w: 120 });
      cy += 14;
      return;
    }
    const items = snap.items;
    if (!items.length) {
      let cy = y + g.para(t('blobbis.none'), x, y, w, UI.ink) + 2;
      cy += g.para(t('blobbis.noneHint'), x, cy, w, UI.muted) + 4;
      g.button(t('blobbis.searchAgain'), x, cy, () => void col.loadBlobbis(true), { w: 120 });
      return;
    }
    this.index = Math.min(this.index, items.length - 1);
    const selected = this.chooser?.selectedAddress() ?? null;
    // The list: a small preview, the name, stage and generation; the one walking with you is marked.
    const listW = 132;
    const first = Math.max(0, Math.min(this.index - Math.floor(ROWS / 2), items.length - ROWS));
    items.slice(first, first + ROWS).forEach((b, k) => {
      const i = first + k;
      const ry = y + k * ROW_H;
      const on = i === this.index;
      g.box(x, ry, listW, ROW_H - 2, on ? UI.slotHi : UI.slot, on ? UI.accent : UI.line);
      this.thumb(g, b, x + 2, ry + 1, 14);
      g.text(clip(g, b.name, listW - 24), x + 19, ry + 2, b.availability === 'available' ? UI.ink : UI.muted);
      g.text(`${t(`blobbis.stage.${b.stage}` as MessageKey)} · ${b.generation === 'unknown' ? '?' : b.generation.toUpperCase()}`, x + 19, ry + 9, UI.muted);
      // The one walking with you: a small green mark (the detail says it in words).
      if (selected === b.address) g.buf.fillRect(x + listW - 6, ry + 3, 3, 3, UI.good);
      g.hit(x, ry, listW, ROW_H - 2, () => (this.index = i));
    });
    if (items.length > ROWS) g.text(`${this.index + 1}/${items.length}`, x, y + ROWS * ROW_H, UI.muted);
    // The detail of the selected one.
    const b = items[this.index];
    const dx = x + listW + 8;
    const dw = w - listW - 8;
    let cy = y;
    g.box(dx, cy, 52, 52, UI.slot, UI.line);
    this.thumb(g, b, dx + 2, cy + 2, 48);
    g.heading(upper(clip(g, b.name, dw - 58, 'title')), dx + 58, cy + 2, UI.accent);
    g.text(t(`blobbis.stage.${b.stage}` as MessageKey), dx + 58, cy + 12, UI.ink);
    g.text(t('blobbis.generation', { g: b.generation === 'unknown' ? '?' : b.generation.toUpperCase() }), dx + 58, cy + 20, UI.ink);
    if (selected === b.address) g.text(t('blobbis.withYou'), dx + 58, cy + 30, UI.good);
    cy += 56;
    if (b.availability === 'available') {
      cy += g.para(t('blobbis.ready'), dx, cy, dw, UI.muted, 3) + 3;
      if (selected === b.address) g.button(t('blobbis.walkingWithYou'), dx, cy, () => {}, { w: Math.min(dw, 150), enabled: false });
      else g.button(t('blobbis.bring'), dx, cy, () => this.choose(b, ui), { w: Math.min(dw, 150), primary: true });
      cy += 14;
    } else {
      cy += g.para(t(reasonKey(b), { g: b.generation.toUpperCase() }), dx, cy, dw, UI.ink, 5) + 2;
      cy += g.para(t('blobbis.colorsOnly'), dx, cy, dw, UI.muted, 2) + 3;
    }
    if (selected) g.button(t('blobbis.useVisitor'), dx, Math.max(cy, y + h - 26), () => (this.chooser?.useVisitor(), ui.say(t('blobbis.visitorBack'))), { w: Math.min(dw, 150) });
    // What could not be read, and relays that did not answer: said plainly, in small text.
    const notes: string[] = [];
    if (snap.status === 'loading') notes.push(t('blobbis.refreshing'));
    if (snap.partial) notes.push(t('blobbis.partial'));
    if (snap.skipped) notes.push(t('blobbis.skipped', { count: snap.skipped }));
    if (notes.length) g.text(clip(g, notes.join('  '), w), x, y + h - 8, UI.muted);
  }

  /** A V3 adult's own pixel picture; anything else only as its colours (an honest swatch, not a guess). */
  private thumb(g: Gfx, b: OwnedBlobbi, x: number, y: number, size: number): void {
    if (b.availability === 'available' && b.seed) {
      const p = this.preview(b.seed, size);
      g.buf.blit(p, x + Math.floor((size - p.width) / 2), y + size - p.height);
      return;
    }
    const cs = colorsOf(b);
    if (!cs) {
      g.text('?', x + Math.floor(size / 2) - 2, y + Math.floor(size / 2) - 3, UI.muted, 'title');
      return;
    }
    // Three stripes of the Blobbi's colours in a framed tile.
    const sw = Math.max(2, Math.floor((size - 2) / 3));
    cs.forEach((c, i) => g.buf.fillRect(x + 1 + i * sw, y + 1, sw, size - 2, hex(c)));
    g.buf.strokeRect(x, y, sw * 3 + 2, size, UI.line);
  }
}

/** A Blobbi's real colours: V1/V2 from the kit's trait reading, a V3 egg or baby from its V3 genome (the kit's). */
function colorsOf(b: OwnedBlobbi): string[] | null {
  if (b.colors) return [b.colors.base, b.colors.secondary, b.colors.eye];
  if (b.generation === 'v3' && b.seed) {
    const c = generateGenome(b.seed).colors;
    const ok = [c.base, c.secondary, c.eye].filter((v): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v));
    return ok.length === 3 ? ok : null;
  }
  return null;
}

export function reasonKey(b: OwnedBlobbi): MessageKey {
  if (b.availability === 'egg') return 'blobbis.reason.egg';
  if (b.availability === 'baby') return 'blobbis.reason.baby';
  if (b.availability === 'older-generation') return 'blobbis.reason.older';
  if (b.availability === 'unknown-generation') return 'blobbis.reason.unknown';
  return 'blobbis.ready';
}

function clip(g: Gfx, s: string, maxW: number, style: 'body' | 'title' = 'body'): string {
  if (g.measure(s, style) <= maxW) return s;
  let out = s;
  while (out.length > 1 && g.measure(`${out}…`, style) > maxW) out = out.slice(0, -1);
  return `${out}…`;
}
