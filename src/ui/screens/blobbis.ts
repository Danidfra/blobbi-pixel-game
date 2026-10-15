/**
 * MY BLOBBIS (M11C): the connected player's canonical Blobbis, read from their own kind 31124 events, and the choice
 * of which one walks the island. Read-only: nothing here publishes, signs or changes a Blobbi, and choosing changes
 * only who walks (the island, its bag, buildings and progress are the island's and stay exactly as they are).
 *
 * - A V3 adult or (M11D.1) a V3 Baby may visit: its preview is the pixel game's own drawing of it (the kit's V3
 *   renderer, rasterized, at its stage), the same picture that will walk.
 * - V1 and V2 Blobbis and eggs are listed with the reason they cannot visit yet. A V1/V2 Baby shows its real picture
 *   (the kit's one baby drawing in its own colours, `v1-baby.ts`); other V1/V2 Blobbis and eggs show only their
 *   colours (never an unrelated V3 creature drawn in their place).
 * - Choosing stays explicit: connecting an account never changes who walks. If a chosen Baby has grown up in another
 *   app, the list (when read again) updates the stage it is drawn at; nothing else changes.
 * - Nothing found: says so. The game never creates a Blobbi and never sends the player elsewhere.
 *
 * The list is read when the screen opens (at most every few minutes, never during play) through the account's
 * `BlobbiCollectionPort`; the Nostr module itself is never imported here.
 */
import { PixelBuffer } from '../../core/pixel';
import { hex } from '../../core/color';
import { Gfx, UI } from '../gfx';
import { isConfirm, moveSelection, type GameUI, type Screen } from '../game-ui';
import { identityOfSource, stagedIdentity } from '../../blobbi/identity';
import { worldFormSource, type BlobbiSource } from '../../blobbi/source';
import { cleanWorldFormTraits } from '../../blobbi/world-form';
import type { BlobbiStage } from '../../blobbi/canonical';
import { generateGenome } from '@blobbi-kit/renderer/procedural';
import { buildBlobbiSprite, REST_POSE } from '../../blobbi/sprite';
import { t, upper, type MessageKey } from '../../i18n';
import type { BlobbiCollectionPort, OwnedBlobbi } from '../../nostr/port';

/** What the host (the playground) does when the player chooses. */
export interface BlobbiChooser {
  /** The address (`31124:pubkey:d`) of the canonical Blobbi walking the island now, or null (the visiting Blobbi). */
  selectedAddress(): string | null;
  /** M11D.1: the stage the chosen canonical Blobbi is drawn at, or null when none is walking. */
  selectedStage?(): BlobbiStage | null;
  /** Bring this Blobbi to the island (only ever called for an `available` one). True when it happened. */
  choose(blobbi: OwnedBlobbi): boolean;
  /** Back to the island's visiting Blobbi. */
  useVisitor(): void;
}

/**
 * M11D.2: which V1/V2 Blobbis' world forms the player has already been shown and accepted on this device, so the
 * explanation appears when it is new, not on every choice. A small per-browser record (`main.ts`), never in a save.
 */
export interface WorldFormMemory {
  seen(address: string): boolean;
  accept(address: string): void;
}

/** A V1/V2 Blobbi that visits in its temporary world form (M11D.2). */
export function isWorldForm(b: OwnedBlobbi): boolean {
  return (b.generation === 'v1' || b.generation === 'v2') && b.availability === 'available' && !!b.worldForm;
}

/** The world form's source for a listed Blobbi, or null when its event's look cannot make one. */
export function worldFormOf(b: OwnedBlobbi): BlobbiSource | null {
  if (!isWorldForm(b) || (b.generation !== 'v1' && b.generation !== 'v2')) return null;
  const traits = cleanWorldFormTraits(b.worldForm!);
  return traits ? worldFormSource(b.pubkey, b.d, b.generation, traits) : null;
}

const ROWS = 7;
const ROW_H = 18;

export class BlobbisScreen implements Screen {
  readonly id = 'blobbis' as const;
  index = 0;
  collection: BlobbiCollectionPort | null = null;
  chooser: BlobbiChooser | null = null;
  /**
   * M11D.8.2: the host is told when a Blobbi was chosen here (over the title it then goes on: the island, the
   * islands page or a new adventure with it; during play nothing more happens). Only after a successful choice.
   */
  onChosen: ((b: OwnedBlobbi) => void) | null = null;
  /** M11D.2: the world forms already explained (none: explained every time). */
  forms: WorldFormMemory | null = null;
  /** M11D.2: the V1/V2 Blobbi whose new form is being explained (TRY THIS FORM / NOT NOW), or null. */
  confirming: OwnedBlobbi | null = null;
  /** Previews by seed and size (drawing a Blobbi costs a few milliseconds: once per Blobbi, never per frame). */
  private readonly previews = new Map<string, PixelBuffer>();

  title(): string {
    return t('blobbis.title');
  }

  opened(): void {
    this.index = 0;
    this.confirming = null;
    void this.collection?.loadBlobbis();
  }

  private items(): readonly OwnedBlobbi[] {
    return this.collection?.blobbis().items ?? [];
  }

  key(code: string, _shift: boolean, ui: GameUI): boolean {
    // The world-form explanation answers first: Enter tries the form, Backspace or N says not now (Escape closes).
    if (this.confirming) {
      if (isConfirm(code) || code === 'KeyE') this.tryForm(ui);
      else if (code === 'Backspace' || code === 'KeyN') this.confirming = null;
      return true;
    }
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
    // A V1/V2 Blobbi's new form is explained (with both pictures) the first time it is chosen on this device.
    if (isWorldForm(b) && !this.forms?.seen(b.address)) {
      this.confirming = b;
      return;
    }
    if (this.chooser.choose(b)) {
      ui.say(t('blobbis.chosen', { name: b.name }));
      this.onChosen?.(b);
    } else ui.say(t('blobbis.couldNotChoose'), false);
  }

  /** TRY THIS FORM: remember the explanation was seen for this Blobbi, then bring it as for any other. */
  tryForm(ui: GameUI): void {
    const b = this.confirming;
    this.confirming = null;
    if (!b || !this.chooser) return;
    this.forms?.accept(b.address);
    if (this.chooser.choose(b)) {
      ui.say(t('blobbis.chosen', { name: b.name }));
      this.onChosen?.(b);
    } else ui.say(t('blobbis.couldNotChoose'), false);
  }

  /** The world form's own picture (the sprite that will walk), as large as fits `box`, cached. */
  formPreview(b: OwnedBlobbi, box: number): PixelBuffer | null {
    const source = worldFormOf(b);
    if (!source) return null;
    const stage: BlobbiStage = b.stage === 'baby' ? 'baby' : 'adult';
    const key = `${source.seed}|${box}|${stage}|form`;
    let p = this.previews.get(key);
    if (!p) {
      const id = identityOfSource(source, stage);
      for (let size = Math.round(box * (stage === 'baby' ? 1.8 : 1.3)); size >= 6; size -= 1) {
        p = buildBlobbiSprite(id, REST_POSE, size).buffer.trimmed().buffer;
        if (p.height <= box && p.width <= box) break;
      }
      if (this.previews.size > 40) this.previews.clear();
      this.previews.set(key, p!);
    }
    return p!;
  }

  /** The pixel game's own picture of a V3 Blobbi at its stage (the sprite that will walk), as large as fits `box`, cached. */
  preview(seed: string, box: number, stage: BlobbiStage = 'adult'): PixelBuffer {
    const key = `${seed}|${box}|${stage}`;
    let p = this.previews.get(key);
    if (!p) {
      // The sprite's buffer is taller than its standing size (antennae, outline): step down until it fits the box.
      // A Baby is drawn for an adult size up to 1.5 times the box (it stands about two thirds as tall).
      // Fitted by the Blobbi's own pixels (trimmed), not its canvas: a Baby fills the box like an adult (M11D.2).
      for (let size = Math.round(box * (stage === 'baby' ? 1.8 : 1.3)); size >= 6; size -= 1) {
        p = buildBlobbiSprite(stagedIdentity(seed, stage), REST_POSE, size).buffer.trimmed().buffer;
        if (p.height <= box && p.width <= box) break;
      }
      if (this.previews.size > 40) this.previews.clear();
      this.previews.set(key, p!);
    }
    return p!;
  }

  /**
   * The V1/V2 baby art module (`v1-baby.ts`), loaded only when a V1 or V2 Baby is first listed: the kit's authored
   * artwork is a large chunk the island itself never needs. Until it arrives the Baby shows its colours.
   */
  private v1: typeof import('../../blobbi/v1-baby') | null = null;
  private v1Loading = false;

  /** A V1/V2 Baby's picture, as large as fits `box`, cached; null while the art loads or if it could not be read. */
  /** Tests and scripts: wait until the V1/V2 baby art is ready. */
  async loadOlderArt(): Promise<void> {
    this.v1 ??= await import('../../blobbi/v1-baby');
  }

  private olderPreview(b: OwnedBlobbi, box: number): PixelBuffer | null {
    const key = `${b.generation}|${b.colors!.base}|${b.colors!.secondary}|${b.colors!.eye}|${box}`;
    let p = this.previews.get(key);
    if (!p) {
      if (!this.v1) {
        if (!this.v1Loading) {
          this.v1Loading = true;
          void import('../../blobbi/v1-baby').then((m) => (this.v1 = m)).catch(() => {});
        }
        return null;
      }
      const { buildV1BabySprite } = this.v1;
      try {
        for (let size = Math.round(box * 1.8); size >= 6; size -= 1) {
          p = buildV1BabySprite(b.colors!, REST_POSE, size, b.generation === 'v2' ? 'v2' : 'v1').buffer.trimmed().buffer;
          if (p.height <= box && p.width <= box) break;
        }
      } catch {
        return null;
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
    // A chosen Baby that has grown up (or the other way round) in another app: draw it at the stage just read.
    const walking = selected ? items.find((it) => it.address === selected) : undefined;
    if (walking && walking.availability === 'available' && this.chooser?.selectedStage && this.chooser.selectedStage() !== walking.stage) this.chooser.choose(walking);
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
    // M11D.2: a new form being explained takes the detail's place.
    if (this.confirming) {
      this.drawConfirm(g, ui, this.confirming, dx, y, dw);
      return;
    }
    g.box(dx, cy, 52, 52, UI.slot, UI.line);
    this.thumb(g, b, dx + 2, cy + 2, 48);
    g.heading(upper(clip(g, b.name, dw - 58, 'title')), dx + 58, cy + 2, UI.accent);
    g.text(t(`blobbis.stage.${b.stage}` as MessageKey), dx + 58, cy + 12, UI.ink);
    g.text(t('blobbis.generation', { g: b.generation === 'unknown' ? '?' : b.generation.toUpperCase() }), dx + 58, cy + 20, UI.ink);
    if (selected === b.address) g.text(t('blobbis.withYou'), dx + 58, cy + 30, UI.good);
    cy += 56;
    if (b.availability === 'available') {
      cy += g.para(t(isWorldForm(b) ? 'blobbis.readyWorldForm' : b.stage === 'baby' ? 'blobbis.readyBaby' : 'blobbis.ready'), dx, cy, dw, UI.muted, 3) + 3;
      if (isWorldForm(b)) {
        // Its original look, small, beside the form it takes here.
        g.box(dx, cy, 22, 22, UI.slot, UI.line);
        this.originalThumb(g, b, dx + 1, cy + 1, 20);
        g.text(t('worldForm.original'), dx + 26, cy + 8, UI.muted);
        cy += 25;
      }
      if (selected === b.address) g.button(t('blobbis.walkingWithYou'), dx, cy, () => {}, { w: Math.min(dw, 150), enabled: false });
      else g.button(t('blobbis.bring'), dx, cy, () => this.choose(b, ui), { w: Math.min(dw, 150), primary: true });
      cy += 14;
    } else {
      cy += g.para(t(reasonKey(b), { g: b.generation.toUpperCase() }), dx, cy, dw, UI.ink, 5) + 2;
      if (!olderBaby(b)) cy += g.para(t('blobbis.colorsOnly'), dx, cy, dw, UI.muted, 2) + 3;
    }
    if (selected) g.button(t('blobbis.useVisitor'), dx, Math.max(cy, y + h - 26), () => (this.chooser?.useVisitor(), ui.say(t('blobbis.visitorBack'))), { w: Math.min(dw, 150) });
    // What could not be read, and relays that did not answer: said plainly, in small text.
    const notes: string[] = [];
    if (snap.status === 'loading') notes.push(t('blobbis.refreshing'));
    if (snap.partial) notes.push(t('blobbis.partial'));
    if (snap.skipped) notes.push(t('blobbis.skipped', { count: snap.skipped }));
    if (notes.length) g.text(clip(g, notes.join('  '), w), x, y + h - 8, UI.muted);
  }

  /** M11D.2: the explanation of a V1/V2 Blobbi's new form: both pictures, TRY THIS FORM and NOT NOW. */
  private drawConfirm(g: Gfx, ui: GameUI, b: OwnedBlobbi, dx: number, y: number, dw: number): void {
    let cy = y;
    cy += g.para(t('worldForm.title'), dx, cy, dw, UI.accent, 2) + 3;
    cy += g.para(t('worldForm.body'), dx, cy, dw, UI.ink, 4) + 4;
    const box = 44;
    for (const [i, label] of [t('worldForm.original'), t('worldForm.here')].entries()) {
      const bx = dx + i * (box + 14);
      g.box(bx, cy, box + 4, box + 4, UI.slot, i ? UI.accent : UI.line);
      if (i) {
        const p = this.formPreview(b, box);
        if (p) g.buf.blit(p, bx + 2 + Math.floor((box - p.width) / 2), cy + 2 + box - p.height);
      } else this.originalThumb(g, b, bx + 2, cy + 2, box);
      g.text(clip(g, label, box + 12), bx, cy + box + 6, i ? UI.ink : UI.muted);
    }
    cy += box + 16;
    g.button(t('worldForm.try'), dx, cy, () => this.tryForm(ui), { w: Math.min(dw, 150), primary: true });
    g.button(t('worldForm.notNow'), dx, cy + 14, () => (this.confirming = null), { w: Math.min(dw, 150) });
  }

  /** A V1/V2 Blobbi's own look: the kit's baby drawing for a Baby (once loaded), else its colours. */
  private originalThumb(g: Gfx, b: OwnedBlobbi, x: number, y: number, size: number): void {
    if (b.stage === 'baby' && b.colors) {
      const p = this.olderPreview(b, size);
      if (p) {
        g.buf.blit(p, x + Math.floor((size - p.width) / 2), y + size - p.height);
        return;
      }
    }
    this.swatch(g, b, x, y, size);
  }

  /** A V3 Blobbi's own pixel picture, a V1/V2 Blobbi's world form; anything else only as its colours (never a guess). */
  private thumb(g: Gfx, b: OwnedBlobbi, x: number, y: number, size: number): void {
    if (isWorldForm(b)) {
      const p = this.formPreview(b, size);
      if (p) {
        g.buf.blit(p, x + Math.floor((size - p.width) / 2), y + size - p.height);
        return;
      }
    }
    if (b.availability === 'available' && b.seed) {
      const p = this.preview(b.seed, size, b.stage === 'baby' ? 'baby' : 'adult');
      g.buf.blit(p, x + Math.floor((size - p.width) / 2), y + size - p.height);
      return;
    }
    // A V1/V2 Baby: the kit's own baby drawing in its own colours (it cannot visit yet; see `reasonKey`).
    if (olderBaby(b) && b.colors) {
      const p = this.olderPreview(b, size);
      if (p) {
        g.buf.blit(p, x + Math.floor((size - p.width) / 2), y + size - p.height);
        return;
      }
    }
    this.swatch(g, b, x, y, size);
  }

  /** Three stripes of the Blobbi's real colours in a framed tile, or a question mark. */
  private swatch(g: Gfx, b: OwnedBlobbi, x: number, y: number, size: number): void {
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

/** A V1 or V2 Baby with its three colours: the kit draws it with its one authored baby art. */
function olderBaby(b: OwnedBlobbi): boolean {
  return b.availability !== 'available' && b.stage === 'baby' && (b.generation === 'v1' || b.generation === 'v2') && !!b.colors;
}

export function reasonKey(b: OwnedBlobbi): MessageKey {
  if (olderBaby(b)) return 'blobbis.reason.olderBaby';
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
