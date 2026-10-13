/**
 * THE TOOL HOTBAR (M11C): the tools the player owns, one slot each, at the bottom left of the play view.
 *
 * - One slot per KIND of tool (axe, pickaxe, hoe, watering can, fishing rod), so never more than five. A kind
 *   shows only once the player owns one: no empty or locked slots, nothing is granted by showing it. When the bag
 *   holds two tools of a kind (a simple and a copper axe), the slot shows the one in hand, else the best tier.
 * - Keys 1 to 5 (and the number pad) pick the slot in that position; picking the tool already in hand puts it away
 *   (empty hands). A click or a tap does the same. Q still cycles through every owned tool and empty hands, as it
 *   always has.
 * - Choosing only calls the live world's own `equip` / `unequip` (the same as the bag's EQUIP button and Q), so the
 *   hotbar can never equip something that is not in the bag.
 *
 * Pure helpers (slots, keys, focus) are tested on their own; `drawHotbar` paints it for the game UI.
 */
import { PixelBuffer } from '../core/pixel';
import type { WorldPalette } from '../core/palette';
import { itemById, itemLabel, TOOLS, type ToolType } from '../game/items';
import { Gfx, UI } from './gfx';
import { card } from './hud';
import { itemIcon } from './icons';
import { sentence, t } from '../i18n';

/** The kinds of tool, in slot order (the order the tools are first met in the story). */
export const HOTBAR_KINDS: readonly ToolType[] = ['axe', 'pickaxe', 'hoe', 'watering-can', 'fishing-rod'];
export const HOTBAR_MAX = HOTBAR_KINDS.length;

export interface HotbarSlot {
  /** The tool's item id. */
  item: string;
  kind: ToolType;
  /** The number key that picks it (1-5). */
  key: number;
}

/** What the hotbar needs from the live world (the real `LiveWorld` fits). */
export interface HotbarWorld {
  equipped: string | null;
  inventory: { count(item: string): number };
  equip(item: string): boolean;
  unequip(): void;
}

/** The slots for a bag: one per owned kind, in kind order, numbered from 1. */
export function hotbarSlots(count: (item: string) => number, equipped: string | null): HotbarSlot[] {
  const out: HotbarSlot[] = [];
  for (const kind of HOTBAR_KINDS) {
    const owned = TOOLS.filter((id) => itemById(id)?.tool?.type === kind && count(id) > 0);
    if (!owned.length) continue;
    const item = equipped && owned.includes(equipped) ? equipped : owned.reduce((best, id) => ((itemById(id)?.tool?.tier ?? 1) >= (itemById(best)?.tool?.tier ?? 1) ? id : best));
    out.push({ item, kind, key: out.length + 1 });
  }
  return out;
}

/** The slot index (0-4) a key picks, or null: the digits 1-5 on the main row and on the number pad. */
export function hotbarIndexForKey(code: string): number | null {
  const m = /^(?:Digit|Numpad)([1-5])$/.exec(code);
  return m ? Number(m[1]) - 1 : null;
}

/**
 * A key event aimed at something that types (a text field, a select, an editable element) must never pick a tool.
 * The playground listens on the canvas, so this is a second guard for any element that may hold focus.
 */
export function isTypingTarget(target: unknown): boolean {
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!el || typeof el !== 'object') return false;
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Q (unchanged since M2.2, now shared with the hotbar's tests): the hand cycles empty → each owned tool in registry
 * order → empty. Returns the next tool's id, or null for empty hands.
 */
export function nextToolInCycle(count: (item: string) => number, equipped: string | null): string | null {
  const order: (string | null)[] = [null, ...TOOLS.filter((id) => count(id) > 0)];
  return order[(order.indexOf(equipped) + 1) % order.length];
}

export type HotbarResult = 'equipped' | 'put-away' | 'none';

/** Pick slot `index`: equip its tool, or put it away when it is already in hand. Nothing happens for a missing slot. */
export function selectHotbarSlot(live: HotbarWorld, index: number): HotbarResult {
  const slot = hotbarSlots((id) => live.inventory.count(id), live.equipped)[index];
  if (!slot) return 'none';
  if (live.equipped === slot.item) {
    live.unequip();
    return 'put-away';
  }
  return live.equip(slot.item) ? 'equipped' : 'none';
}

/** Hotbar slot size in UI pixels: a 14 px icon and its frame; on a touch screen 22 (44 screen pixels at 2x). */
export const SLOT = 16;
export const TOUCH_SLOT = 22;
const GAP = 2;

export interface HotbarLayout {
  /** Screen pixels per UI pixel. */
  scale: number;
  /** Touch mode: bigger slots, no key numbers or Q hint (a finger needs none). */
  touch: boolean;
}

/**
 * The hotbar as a card: a label row (the tool in hand, and on a keyboard the Q hint) over the slots. Returns the
 * picture and, per slot, its rectangle in UI pixels (for hit regions).
 */
export function drawHotbar(slots: readonly HotbarSlot[], equipped: string | null, palette: WorldPalette, layout: HotbarLayout): { out: PixelBuffer; slotRects: { x: number; y: number; w: number; h: number }[] } {
  const probe = new Gfx(1, 1, layout.scale);
  const inHand = slots.find((s) => s.item === equipped);
  const name = inHand ? sentence(itemLabel(inHand.item)) : t('hotbar.emptyHands');
  const qHint = layout.touch ? '' : t('hotbar.qHint');
  const size = layout.touch ? TOUCH_SLOT : SLOT;
  const labelW = probe.measure(name) + (qHint ? 8 + probe.measure('Q') + 3 + probe.measure(qHint) : 0);
  const slotsW = slots.length * size + (slots.length - 1) * GAP;
  const w = Math.max(slotsW, labelW) + 6;
  const h = 3 + 7 + 2 + size + 3;
  const g = new Gfx(w, h, layout.scale);
  g.buf.blit(card(w, h), 0, 0);
  g.text(name, 3, 3, inHand ? UI.ink : UI.muted);
  if (qHint) {
    // The key in the body font: the 3x5 capitals' Q reads as a 9 at this size.
    const qx = w - 3 - probe.measure(qHint) - 3 - probe.measure('Q');
    g.text('Q', qx, 3, UI.accent);
    g.text(qHint, qx + probe.measure('Q') + 3, 3, UI.muted);
  }
  const slotRects: { x: number; y: number; w: number; h: number }[] = [];
  slots.forEach((s, i) => {
    const x = 3 + i * (size + GAP);
    const y = 12;
    const selected = s.item === equipped;
    g.slot(x, y, size, itemIcon(s.item, palette), 1, { selected, equipped: selected });
    // The key number in the top-right corner (keyboards only).
    if (!layout.touch) g.text(String(s.key), x + size - 5, y + 2, selected ? UI.accent : UI.muted, 'title');
    slotRects.push({ x, y, w: size, h: size });
  });
  return { out: g.out, slotRects };
}
