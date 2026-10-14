/**
 * M11D.5, THE BLOBBI IN THE MENUS: the walking Blobbi drawn large beside the words that are about it (naming it,
 * saving it for other worlds, the Nostr reveal), plus the few pixel decorations those pages share: twinkles for a
 * happy moment, the two backup icons, and little islands joined by travelling lights. All presentation; with REDUCED
 * MOTION everything is still (no hop, no twinkle, no travelling light), and nothing here changes the game.
 */
import { hex, type Color } from '../core/color';
import { REST_POSE, buildBlobbiSprite, type BlobbiPose, type Expression } from '../blobbi/sprite';
import type { PixelBlobbiIdentity } from '../blobbi/identity';
import type { Sprite } from '../core/pixel';
import { fromTemplate } from './icons';
import { UI, type Gfx } from './gfx';
import type { GameUI } from './game-ui';

export interface PortraitOptions {
  expression?: Expression;
  /** Whole-pixel magnification (2 or 3 for a big portrait on a roomy page). */
  scale?: 1 | 2 | 3;
  /** Happy hops (a celebration). */
  hop?: boolean;
  /** Stand on a little grassy island (the menus' stage) instead of a bare shadow. */
  island?: boolean;
  /** The island's largest half width (the frame it must fit). */
  islandMax?: number;
  /**
   * M11D.6: draw THIS Blobbi instead of the walking one (a restored Blobbi, before it walks anywhere): its identity
   * (from its canonical address and stage) and size. Drawn even with no live world.
   */
  subject?: { identity: PixelBlobbiIdentity; size: number };
}

/** The few sprites a subject portrait needs (one per pose), kept small. */
const subjectSprites = new Map<string, Sprite>();
function subjectSprite(s: { identity: PixelBlobbiIdentity; size: number }, pose: BlobbiPose): Sprite {
  const key = `${s.identity.seed}|${s.identity.stage}|${s.size}|${pose.expression}|${pose.breath}|${pose.lid}`;
  let hit = subjectSprites.get(key);
  if (!hit) {
    if (subjectSprites.size > 32) subjectSprites.clear();
    hit = buildBlobbiSprite(s.identity, pose, s.size);
    subjectSprites.set(key, hit);
  }
  return hit;
}

/**
 * Draw the walking Blobbi standing on (cx, groundY), facing the player: it breathes and blinks, and hops when
 * `hop`. Returns the drawn height. Nothing is drawn without a live world.
 */
export function drawPortrait(g: Gfx, ui: GameUI, cx: number, groundY: number, o: PortraitOptions = {}): number {
  const live = ui.live;
  if (!live && !o.subject) return 0;
  const still = ui.settings.reducedMotion;
  const t = ui.now;
  const blink = !still && t % 3.4 < 0.14;
  const pose: BlobbiPose = { ...REST_POSE, expression: o.expression ?? 'happy', breath: !still && t % 1.6 < 0.8 ? 1 : 0, lid: blink ? 2 : 0 };
  const sprite = o.subject ? subjectSprite(o.subject, pose) : live!.blobbiSprite(pose);
  const k = o.scale ?? 1;
  const big = k === 1 ? sprite.buffer : sprite.buffer.scaled(k);
  const lift = o.hop && !still ? Math.round(Math.abs(Math.sin(t * 6)) * 3 * k) : 0;
  if (o.island) {
    // A little island: grass on top, a rim, earth below, a ripple of sea.
    // As wide as the Blobbi's body and a bit more, never wider than the portrait's frame.
    const ir = Math.max(16, Math.min(o.islandMax ?? 30, Math.round(sprite.buffer.trimmed().buffer.width * k * 0.8)));
    for (let dy = -3; dy <= 5; dy++) {
      const half = Math.round(ir * Math.sqrt(Math.max(0, 1 - ((dy - 1) / 5) ** 2)));
      const c = dy <= 0 ? hex('#6fcf6a') : dy === 1 ? hex('#3f8f4f') : dy <= 3 ? hex('#8a6a44') : hex('#5c4630');
      for (let dx = -half; dx <= half; dx++) g.buf.set(cx + dx, groundY + dy, c);
    }
    for (let dx = -ir + 2; dx <= ir - 2; dx += 3) g.buf.set(cx + dx, groundY + 7, hex('#4f8fbf'));
    g.buf.set(cx - ir + 4, groundY - 3, hex('#ffe07a'));
    g.buf.set(cx + ir - 6, groundY - 2, hex('#ff9ad5'));
  }
  // A soft shadow the size of the Blobbi's own body, then the Blobbi.
  const shadowRx = o.subject || !live ? Math.max(2, Math.round(sprite.buffer.trimmed().buffer.width / 2) - 1) : live.blobbi.shadowRx;
  const rx = Math.max(3, Math.round((shadowRx + 1) * k));
  const shade = o.island ? hex('#3c8a48') : hex('#151925');
  for (let dx = -rx; dx <= rx; dx++) g.buf.set(cx + dx, groundY - (o.island ? 1 : 0), shade);
  for (let dx = -rx + 2; dx <= rx - 2; dx++) g.buf.set(cx + dx, groundY + (o.island ? 0 : 1), shade);
  g.buf.blit(big, cx - sprite.anchorX * k, groundY - sprite.anchorY * k - lift);
  return big.height;
}

/** Twinkles around a point (a celebration); none with reduced motion, a few fixed ones when `still` is wanted. */
export function drawTwinkles(g: Gfx, ui: GameUI, cx: number, cy: number, radius: number, count = 7): void {
  const still = ui.settings.reducedMotion;
  const colours: Color[] = [UI.accent, UI.good, hex('#ff9ad5'), hex('#9ad5ff')];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (still ? 0 : ui.now * 0.6);
    const r = radius * (0.7 + 0.3 * Math.sin(i * 2.1 + (still ? 0 : ui.now * 2)));
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r * 0.6);
    const on = still || (ui.now * 3 + i * 0.7) % 2 < 1.4;
    if (!on) continue;
    const c = colours[i % colours.length];
    g.buf.set(x, y, c);
    if ((i + Math.floor(still ? 0 : ui.now * 2)) % 3 === 0) {
      g.buf.set(x - 1, y, c);
      g.buf.set(x + 1, y, c);
      g.buf.set(x, y - 1, c);
      g.buf.set(x, y + 1, c);
    }
  }
}

/** The Recovery Key: a plain brass key. */
export const KEY_ICON = fromTemplate(['.aaa.......', 'a...a......', 'a...aaaaaaa', 'a...a..a.a.', '.aaa.......'], { a: '#ffd36b' });
/** The Protected Key: a key behind a padlock. */
export const LOCK_ICON = fromTemplate(['..bbbbb..', '.b.....b.', '.b.....b.', 'aaaaaaaaa', 'aaaacaaaa', 'aaaacaaaa', 'aaaaaaaaa'], { a: '#7fd4ff', b: '#c9d3e6', c: '#1b1f2a' });

/**
 * Connected worlds: little islands in a row, joined by dotted paths with a light travelling along them (still with
 * reduced motion). The walking Blobbi is drawn by the caller on the middle one.
 */
export function drawConnectedWorlds(g: Gfx, ui: GameUI, x: number, y: number, w: number): void {
  const still = ui.settings.reducedMotion;
  const centres = [x + 10, x + Math.round(w / 2), x + w - 10];
  const lands = [hex('#5fbf6a'), hex('#e0c26a'), hex('#8fb7ff')];
  centres.forEach((cx, i) => {
    for (let dx = -8; dx <= 8; dx++) g.buf.set(cx + dx, y + 2, hex('#2e6b8f'));
    for (let dx = -7; dx <= 7; dx++) g.buf.set(cx + dx, y + 1, lands[i]);
    for (let dx = -5; dx <= 5; dx++) g.buf.set(cx + dx, y, lands[i]);
  });
  for (let i = 0; i < 2; i++) {
    const a = centres[i] + 10;
    const b = centres[i + 1] - 10;
    for (let px = a; px <= b; px += 3) {
      const f = (px - a) / Math.max(1, b - a);
      g.buf.set(px, y - 2 - Math.round(Math.sin(f * Math.PI) * 6), UI.muted);
    }
    const f = still ? 0.5 : (ui.now * 0.35 + i * 0.5) % 1;
    const lx = Math.round(a + (b - a) * f);
    const ly = y - 2 - Math.round(Math.sin(f * Math.PI) * 6);
    g.buf.set(lx, ly, UI.accent);
    g.buf.set(lx + 1, ly, UI.accent);
    g.buf.set(lx, ly - 1, UI.accent);
  }
}
