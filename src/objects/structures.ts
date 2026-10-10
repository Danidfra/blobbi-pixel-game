/**
 * STRUCTURES: modular pixel geometry. A house is a wall box, a roof shape,
 * a door and windows, assembled from a seed; a bridge is planks and rails
 * laid along an axis; a fence is posts and rails. Nothing is a stored sprite.
 */
import { stream } from '../core/rng';
import { Mask, PixelBuffer, type Sprite } from '../core/pixel';
import { shadedColumn, shadedEllipse } from '../core/shade';
import { hex, shift } from '../core/color';
import { clamp } from '../core/math';
import type { ObjectInput } from './types';

// ─── House ───────────────────────────────────────────────────────────────────

export interface HouseVariation {
  roof: 'gable' | 'hip' | 'round';
  roofRamp: number;
  wallRamp: number;
  windows: number;
  chimney: boolean;
  /** Plank texture on the wall instead of plain plaster. */
  planks: boolean;
}

export interface HouseResult extends Sprite {
  /** Top of the chimney in sprite pixels, for smoke; null without one. */
  chimney: { x: number; y: number } | null;
}

export function generateHouse(input: ObjectInput<HouseVariation>): HouseResult {
  const { seed, palette } = input;
  const w = clamp(Math.round(input.size), 16, 64);
  const rng = stream(seed, 'house', 'variation');
  const v: HouseVariation = {
    roof: input.variation?.roof ?? rng.weighted(['gable', 'hip', 'round'] as const, [4, 3, 2]),
    roofRamp: input.variation?.roofRamp ?? rng.int(0, palette.roof.length - 1),
    wallRamp: input.variation?.wallRamp ?? rng.int(0, palette.wall.length - 1),
    windows: input.variation?.windows ?? (w >= 24 ? rng.int(1, 2) : 1),
    chimney: input.variation?.chimney ?? rng.chance(0.6),
    planks: input.variation?.planks ?? rng.chance(0.4),
  };
  const roof = palette.roof[v.roofRamp % palette.roof.length];
  const wall = palette.wall[v.wallRamp % palette.wall.length];
  const wood = palette.wood;
  const wallH = Math.round(w * 0.5);
  const roofH = Math.round(w * (v.roof === 'round' ? 0.5 : 0.55));
  const eave = 2;
  const width = w + eave * 2 + 2;
  const height = wallH + roofH + 3;
  const buf = new PixelBuffer(width, height);
  const groundY = height - 2;
  const wallX = eave + 1;
  const wallTop = groundY - wallH + 1;

  // Wall: a flat face lit from the left, plus a shadow row under the eave.
  buf.fillRect(wallX, wallTop, w, wallH, wall.mid);
  buf.fillRect(wallX, wallTop, Math.round(w * 0.3), wallH, wall.light);
  buf.fillRect(wallX, wallTop, w, 2, wall.dark); // under the eave
  if (v.planks) for (let y = wallTop + 3; y < groundY; y += 3) buf.hline(wallX, wallX + w - 1, y, wall.dark);
  buf.strokeRect(wallX, wallTop, w, wallH, wall.outline);
  buf.hline(wallX, wallX + w - 1, groundY, wall.outline);

  // Door: centred or offset, wood, with a knob and a dark top.
  // The door: tall enough for a small creature. About a third of the house's width.
  const doorW = clamp(Math.round(w * 0.2), 5, 11);
  const doorH = clamp(Math.round(w * 0.32), 6, Math.max(6, wallH - 3));
  const doorX = wallX + (v.windows === 2 ? Math.round(w / 2 - doorW / 2) : Math.round(w * 0.6));
  const doorY = groundY - doorH;
  buf.fillRect(doorX, doorY, doorW, doorH, wood.mid);
  buf.fillRect(doorX + 1, doorY + 1, doorW - 2, 1, wood.light);
  buf.vline(doorX + Math.floor(doorW / 2), doorY + 1, doorY + doorH - 2, wood.dark);
  buf.strokeRect(doorX, doorY, doorW, doorH + 1, wood.outline);
  buf.set(doorX + doorW - 2, doorY + Math.floor(doorH / 2), hex('#ffd93b'));
  if (doorH >= 9) buf.hline(doorX + 1, doorX + doorW - 2, doorY + 2, wood.dark); // a lintel line

  // Windows: glass with a cross frame.
  const glass = palette.shallow;
  const winS = w >= 36 ? 7 : 5; // window size
  const winY = wallTop + Math.max(3, Math.round(wallH * 0.2));
  const winSlots = v.windows === 2 ? [wallX + 3, wallX + w - winS - 3] : [wallX + Math.round(w * 0.2)];
  for (const wx of winSlots) {
    if (wx + winS > doorX && wx < doorX + doorW && winY + winS > doorY) continue;
    buf.fillRect(wx, winY, winS, winS, glass.light);
    buf.set(wx + 1, winY + 1, glass.highlight);
    if (winS >= 7) buf.set(wx + 2, winY + 1, glass.highlight);
    buf.hline(wx, wx + winS - 1, winY + Math.floor(winS / 2), wood.dark);
    buf.vline(wx + Math.floor(winS / 2), winY, winY + winS - 1, wood.dark);
    buf.strokeRect(wx, winY, winS, winS, wood.outline);
    buf.hline(wx - 1, wx + winS, winY + winS, wood.dark); // sill
  }

  // Roof.
  const roofBottom = wallTop + 1;
  const roofTop = roofBottom - roofH;
  const roofMask = new Mask(width, height);
  const rx0 = wallX - eave;
  const rw = w + eave * 2;
  if (v.roof === 'gable') {
    // A pentagon: a rectangle whose top is a peak. From the front-top it reads as a gabled roof.
    const peakH = Math.round(roofH * 0.45);
    for (let y = roofTop; y <= roofBottom; y++) {
      const t = (y - roofTop) / peakH;
      const half = y - roofTop < peakH ? Math.max(1, (rw / 2) * Math.min(1, t)) : rw / 2;
      const x0 = Math.ceil(rx0 + rw / 2 - half);
      const x1 = Math.floor(rx0 + rw / 2 + half - 0.5);
      for (let x = x0; x <= x1; x++) roofMask.set(x, y);
    }
  } else if (v.roof === 'hip') {
    // A trapezoid: narrower ridge, wider eave.
    const ridge = Math.round(rw * 0.5);
    for (let y = roofTop; y <= roofBottom; y++) {
      const t = (y - roofTop) / roofH;
      const half = (ridge + (rw - ridge) * t) / 2;
      const x0 = Math.ceil(rx0 + rw / 2 - half);
      const x1 = Math.floor(rx0 + rw / 2 + half - 0.5);
      for (let x = x0; x <= x1; x++) roofMask.set(x, y);
    }
  } else {
    // A dome: half ellipse on a short band.
    roofMask.fillEllipse(rx0 + rw / 2, roofBottom, rw / 2, roofH);
    for (let y = roofBottom + 1; y < height; y++) for (let x = 0; x < width; x++) roofMask.set(x, y, false);
  }
  // Shade the roof: left third light, a dark eave band, shingle lines every third row.
  const roofCx = rx0 + rw / 2;
  buf.paintMaskWith(roofMask, (x, y) => {
    const u = (x + 0.5 - roofCx) / (rw / 2);
    const nearBottom = roofBottom - y <= 1;
    if (nearBottom) return roof.dark;
    const row = y - roofTop;
    if (row % 3 === 2 && u > -0.2) return roof.dark;
    if (u < -0.3) return row % 3 === 2 ? roof.mid : roof.light;
    return roof.mid;
  });
  buf.paintMask(roofMask.edge(), roof.outline);
  // Ridge highlight for the gable and hip.
  if (v.roof !== 'round') {
    const topRow = roofMask.bounds()!.y;
    for (let x = 0; x < width; x++) if (roofMask.get(x, topRow) && roofMask.get(x, topRow + 1) && !roofMask.get(x, topRow - 1)) buf.set(x, topRow, roof.highlight);
  } else {
    buf.set(Math.round(roofCx) - 2, roofTop + 2, roof.highlight);
    buf.set(Math.round(roofCx) - 3, roofTop + 3, roof.highlight);
  }
  // Chimney: a stone stack on the right side of the roof.
  let chimney: { x: number; y: number } | null = null;
  if (v.chimney) {
    const cxm = rx0 + Math.round(rw * 0.72);
    const cy = roofTop + Math.round(roofH * 0.25);
    chimney = { x: cxm + 1, y: cy - 1 };
    const cw = w >= 36 ? 4 : 3;
    const ch = w >= 36 ? 7 : 5;
    buf.fillRect(cxm, cy, cw, ch, palette.stone.mid);
    buf.vline(cxm, cy, cy + ch - 1, palette.stone.light);
    buf.strokeRect(cxm - 1, cy - 1, cw + 2, ch + 2, palette.stone.outline);
    buf.fillRect(cxm, cy - 1, cw, 1, palette.stone.light);
  }
  buf.validate();
  return { buffer: buf, anchorX: Math.floor(width / 2), anchorY: groundY, footRx: Math.round(width / 2), footRy: 3, chimney };
}

// ─── Bridge ──────────────────────────────────────────────────────────────────

export interface BridgeVariation {
  axis: 'h' | 'v';
  /** Length along the axis in pixels (overrides `size` when given). */
  length: number;
  /** Deck width across the axis. */
  width: number;
  /** A pier: posts at the sides but no rails. */
  pier: boolean;
}

export function generateBridge(input: ObjectInput<BridgeVariation>): Sprite {
  const { palette } = input;
  const axis = input.variation?.axis ?? 'h';
  const length = Math.max(8, Math.round(input.variation?.length ?? input.size));
  const deck = Math.max(5, Math.round(input.variation?.width ?? 7));
  const wood = palette.wood;
  const pier = input.variation?.pier ?? false;
  const railH = pier ? 2 : 3; // posts rise above the deck
  if (axis === 'h') {
    const width = length;
    const height = deck + railH + 1;
    const buf = new PixelBuffer(width, height);
    const deckTop = railH;
    // Planks across the deck: 3px wide, seams one shade darker.
    for (let x = 0; x < width; x++) {
      const seam = x % 3 === 2;
      for (let y = deckTop; y < deckTop + deck; y++) buf.set(x, y, seam ? wood.dark : y === deckTop ? wood.light : wood.mid);
    }
    buf.hline(0, width - 1, deckTop + deck - 1, wood.outline);
    buf.hline(0, width - 1, deckTop, wood.outline);
    // Rails: a top rail with posts, and a bottom rail drawn over the deck's lower edge. A pier keeps only the posts.
    for (let x = 1; x < width; x += 6) {
      shadedColumn(buf, x, 0, 2, railH + 1, wood, false);
      buf.set(x, 0, wood.outline);
      buf.set(x + 1, 0, wood.outline);
      shadedColumn(buf, x, deckTop + deck - 2, 2, 3, wood, false);
    }
    if (!pier) {
      buf.hline(0, width - 1, 1, wood.light);
      buf.hline(0, width - 1, deckTop + deck, wood.dark);
    }
    buf.vline(0, 0, height - 1, wood.outline);
    buf.vline(width - 1, 0, height - 1, wood.outline);
    buf.validate();
    return { buffer: buf, anchorX: 0, anchorY: deckTop, footRx: 0, footRy: 0 };
  }
  const width = deck + 2;
  const height = length;
  const buf = new PixelBuffer(width, height);
  for (let y = 0; y < height; y++) {
    const seam = y % 3 === 2;
    for (let x = 1; x < 1 + deck; x++) buf.set(x, y, seam ? wood.dark : x === 1 ? wood.light : wood.mid);
  }
  buf.vline(0, 0, height - 1, wood.outline);
  buf.vline(width - 1, 0, height - 1, wood.outline);
  buf.vline(1, 0, height - 1, wood.light);
  buf.vline(width - 2, 0, height - 1, wood.dark);
  for (let y = 1; y < height; y += 6) {
    buf.fillRect(0, y, 2, 2, wood.mid);
    buf.fillRect(width - 2, y, 2, 2, wood.mid);
    buf.set(0, y, wood.outline);
    buf.set(width - 1, y, wood.outline);
  }
  if (pier) {
    // The far end: a dark edge and two post tops.
    buf.hline(1, width - 2, height - 1, wood.outline);
  }
  buf.validate();
  return { buffer: buf, anchorX: 1, anchorY: 0, footRx: 0, footRy: 0 };
}

// ─── Fence ───────────────────────────────────────────────────────────────────

export interface FenceVariation {
  posts: number;
}

export function generateFence(input: ObjectInput<FenceVariation>): Sprite {
  const { palette } = input;
  const posts = clamp(Math.round(input.variation?.posts ?? input.size / 5), 2, 9);
  const gap = 5;
  const width = (posts - 1) * gap + 2;
  const height = 7;
  const buf = new PixelBuffer(width, height);
  const wood = palette.wood;
  for (let i = 0; i < posts; i++) {
    const x = i * gap;
    shadedColumn(buf, x, 1, 2, 6, wood, false);
    buf.set(x, 0, wood.outline);
    buf.set(x + 1, 0, wood.outline);
  }
  buf.hline(0, width - 1, 2, wood.light);
  buf.hline(0, width - 1, 3, wood.dark);
  buf.hline(0, width - 1, 4, wood.mid);
  buf.hline(0, width - 1, 5, wood.dark);
  for (let i = 0; i < posts; i++) {
    const x = i * gap;
    buf.set(x, 6, wood.outline);
    buf.set(x + 1, 6, wood.outline);
    buf.vline(x, 1, 5, wood.light);
    buf.vline(x + 1, 1, 5, wood.dark);
  }
  buf.validate();
  return { buffer: buf, anchorX: Math.floor(width / 2), anchorY: 6, footRx: Math.floor(width / 2), footRy: 1 };
}

// ─── Decor ───────────────────────────────────────────────────────────────────

export const DECOR_KINDS = ['sign', 'lantern', 'barrel', 'stump', 'mushroom', 'crate', 'well'] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

export interface DecorVariation {
  kind: DecorKind;
}

export function generateDecor(input: ObjectInput<DecorVariation>): Sprite {
  const { seed, palette } = input;
  const rng = stream(seed, 'decor', 'variation');
  const kind = input.variation?.kind ?? rng.pick(DECOR_KINDS);
  const wood = palette.wood;
  switch (kind) {
    case 'sign': {
      const buf = new PixelBuffer(9, 11);
      shadedColumn(buf, 4, 5, 2, 6, wood, false);
      buf.set(4, 10, wood.outline);
      buf.set(5, 10, wood.outline);
      buf.fillRect(1, 1, 7, 5, wood.light);
      buf.hline(2, 5, 2, wood.dark);
      buf.hline(2, 6, 4, wood.dark);
      buf.strokeRect(0, 0, 9, 7, wood.outline);
      buf.validate();
      return { buffer: buf, anchorX: 4, anchorY: 10, footRx: 2, footRy: 1 };
    }
    case 'lantern': {
      const buf = new PixelBuffer(5, 12);
      shadedColumn(buf, 1, 4, 3, 8, wood);
      buf.hline(1, 3, 11, wood.outline);
      buf.fillRect(0, 0, 5, 4, hex('#ffd93b'));
      buf.set(1, 1, hex('#fff4b0'));
      buf.strokeRect(0, 0, 5, 4, shift(hex('#ffd93b'), -0.35, 1, 10));
      buf.validate();
      return { buffer: buf, anchorX: 2, anchorY: 11, footRx: 2, footRy: 1 };
    }
    case 'barrel': {
      const buf = new PixelBuffer(7, 9);
      shadedColumn(buf, 0, 1, 7, 7, wood);
      buf.fillEllipse(3.5, 1, 3.5, 1.2, wood.light);
      buf.hline(0, 6, 3, palette.stone.dark);
      buf.hline(0, 6, 6, palette.stone.dark);
      buf.outline(wood.outline);
      buf.validate();
      return { buffer: buf, anchorX: 3, anchorY: 8, footRx: 3, footRy: 1 };
    }
    case 'crate': {
      const buf = new PixelBuffer(8, 8);
      buf.fillRect(0, 0, 8, 8, wood.mid);
      buf.fillRect(1, 1, 2, 6, wood.light);
      buf.line(1, 1, 6, 6, wood.dark);
      buf.line(6, 1, 1, 6, wood.dark);
      buf.strokeRect(0, 0, 8, 8, wood.outline);
      buf.validate();
      return { buffer: buf, anchorX: 4, anchorY: 7, footRx: 4, footRy: 1 };
    }
    case 'stump': {
      const buf = new PixelBuffer(9, 8);
      const trunk = palette.trunk[0];
      shadedColumn(buf, 1, 3, 7, 4, trunk);
      // The cut top: a pale disc with one growth ring, outlined.
      buf.fillEllipse(4.5, 2.5, 4.5, 2.2, trunk.outline);
      buf.fillEllipse(4.5, 2.5, 3.5, 1.5, trunk.highlight);
      buf.fillEllipse(4.5, 2.5, 2, 0.9, trunk.light);
      buf.fillEllipse(4.5, 2.5, 1, 0.5, trunk.highlight);
      buf.hline(1, 7, 7, trunk.outline);
      buf.vline(1, 3, 7, trunk.outline);
      buf.vline(7, 3, 7, trunk.outline);
      buf.validate();
      return { buffer: buf, anchorX: 4, anchorY: 7, footRx: 4, footRy: 2 };
    }
    case 'well': {
      // A stone ring, a wooden frame and a little roof.
      const buf = new PixelBuffer(11, 14);
      const stone = palette.stone;
      const roofRamp = palette.roof[1];
      // Roof: a small gable.
      for (let j = 0; j < 4; j++) {
        const half = 1 + j;
        buf.hline(5 - half, 5 + half, j, j === 3 ? roofRamp.dark : roofRamp.mid);
        buf.set(5 - half, j, roofRamp.outline);
        buf.set(5 + half, j, roofRamp.outline);
        if (j > 0) buf.set(5 - half + 1, j, roofRamp.light);
      }
      buf.hline(1, 9, 4, roofRamp.outline);
      // Posts.
      shadedColumn(buf, 1, 5, 2, 5, wood);
      shadedColumn(buf, 8, 5, 2, 5, wood);
      // Ring: an ellipse of stone with a dark mouth.
      buf.fillEllipse(5.5, 10.5, 5, 3.2, stone.mid);
      buf.fillEllipse(5.5, 9.8, 3, 1.4, hex('#1f2c4d'));
      buf.hline(2, 8, 12, stone.dark);
      buf.outline(stone.outline, maskOfColor(buf, stone.mid, stone.dark));
      buf.set(2, 11, stone.light);
      buf.set(3, 12, stone.light);
      buf.validate();
      return { buffer: buf, anchorX: 5, anchorY: 13, footRx: 5, footRy: 2 };
    }
    case 'mushroom': {
      const buf = new PixelBuffer(7, 7);
      const cap = palette.roof[0];
      buf.fillRect(2, 4, 3, 3, hex('#f3e3c3'));
      buf.vline(4, 4, 6, hex('#d6c3a0'));
      shadedEllipse(buf, 3.5, 2.6, 3.5, 2.4, cap, { highlight: 0.6, light: 0.3 });
      buf.set(2, 1, hex('#ffffff'));
      buf.set(4, 2, hex('#ffffff'));
      buf.outline(cap.outline);
      buf.validate();
      return { buffer: buf, anchorX: 3, anchorY: 6, footRx: 2, footRy: 1 };
    }
  }
}

function maskOfColor(buf: PixelBuffer, ...colors: number[]): Mask {
  const m = new Mask(buf.width, buf.height);
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (colors.includes(buf.get(x, y))) m.set(x, y);
  return m;
}
