/**
 * TREES. Morphology, not recolouring: trunk shape × canopy shape × leaf
 * texture × size × foliage ramp × optional fruit or blossom, all from keyed
 * streams of the tree's seed. Every tree shares the shading rules of
 * `core/shade.ts`, so they differ in form and agree in style.
 */
import { stream } from '../core/rng';
import { Mask, PixelBuffer, type Sprite } from '../core/pixel';
import { type Blob, shadedCloud, shadedColumn } from '../core/shade';
import type { Ramp } from '../core/palette';
import type { ObjectInput } from './types';
import { clamp } from '../core/math';
import { shift } from '../core/color';

export const TRUNK_KINDS = ['straight', 'thick', 'forked', 'leaning'] as const;
export const CANOPY_KINDS = ['round', 'tall', 'cloud', 'pine', 'layered'] as const;
export type TrunkKind = (typeof TRUNK_KINDS)[number];
export type CanopyKind = (typeof CANOPY_KINDS)[number];

export interface TreeVariation {
  trunk: TrunkKind;
  canopy: CanopyKind;
  /** Index into the palette's foliage ramps. */
  foliage: number;
  trunkRamp: number;
  fruit: boolean;
  blossom: boolean;
  /** 0..1 amount of leaf texture dabs. */
  texture: number;
}

export interface TreeResult extends Sprite {
  variation: TreeVariation;
}

export function generateTree(input: ObjectInput<TreeVariation>): TreeResult {
  const { seed, palette } = input;
  const growth = clamp(input.growth ?? 1, 0, 1);
  const pickRng = stream(seed, 'tree', 'variation');
  const matureSize = clamp(Math.round(input.size), 12, 64);
  // GROWTH: the same seed, the same morphology, at an earlier age. A seedling
  // and a sapling are drawn as their own small forms; from there the tree is
  // its adult self scaled, fruit arriving only near maturity.
  if (growth < 0.12) return seedling(input, palette.foliage[pickRng.int(0, palette.foliage.length - 1)], growth);
  const size = growth < 0.3 ? clamp(Math.round(matureSize * 0.3), 8, 64) : clamp(Math.round(matureSize * (0.3 + (0.7 * (growth - 0.3)) / 0.7)), 8, 64);
  const v: TreeVariation = {
    trunk: input.variation?.trunk ?? pickRng.weighted(TRUNK_KINDS, [5, 2, 2, 2]),
    canopy: input.variation?.canopy ?? pickRng.weighted(CANOPY_KINDS, [5, 3, 4, 3, 2]),
    foliage: input.variation?.foliage ?? pickRng.int(0, palette.foliage.length - 1),
    trunkRamp: input.variation?.trunkRamp ?? pickRng.int(0, palette.trunk.length - 1),
    fruit: input.variation?.fruit ?? pickRng.chance(0.22),
    blossom: input.variation?.blossom ?? pickRng.chance(0.12),
    texture: input.variation?.texture ?? pickRng.range(0.4, 1),
  };
  if (growth < 0.85) v.fruit = false;
  if (growth < 0.5) v.blossom = false;
  if (growth < 0.3) {
    // A sapling: a thin straight stem and a single small crown, whatever it will become.
    v.trunk = 'straight';
    if (v.canopy !== 'pine') v.canopy = 'round';
  }
  if (v.fruit && v.blossom) v.blossom = false;
  if (v.canopy === 'pine') {
    v.fruit = false;
    v.blossom = false;
  }
  if (v.canopy === 'layered' && size < 24) v.canopy = 'round'; // tiers need pixels to read as tiers
  const foliage = palette.foliage[v.foliage % palette.foliage.length];
  const trunk = palette.trunk[v.trunkRamp % palette.trunk.length];
  const shapeRng = stream(seed, 'tree', 'shape');

  // Proportions: canopy height is ~62-72% of the tree, width from the canopy kind.
  const canopyH = Math.round(size * (v.canopy === 'pine' ? 0.78 : v.canopy === 'tall' ? 0.72 : 0.64));
  const canopyW = Math.round(
    canopyH * (v.canopy === 'tall' ? shapeRng.range(0.7, 0.85) : v.canopy === 'pine' ? shapeRng.range(0.7, 0.9) : v.canopy === 'layered' ? shapeRng.range(1.3, 1.6) : shapeRng.range(1.05, 1.3)),
  );
  const trunkW = Math.max(2, Math.round(size * (v.trunk === 'thick' ? 0.17 : 0.11)));
  const trunkH = size - canopyH + Math.round(canopyH * 0.35); // trunk reaches up into the canopy
  const width = Math.max(canopyW, trunkW) + 6;
  const height = size + 2;
  const buf = new PixelBuffer(width, height);
  const cx = Math.floor(width / 2);
  const groundY = height - 2; // leave a row for the outline below the trunk base

  // ── Trunk ────────────────────────────────────────────────────────────────
  const trunkTop = groundY - trunkH;
  const lean = v.trunk === 'leaning' ? (shapeRng.chance(0.5) ? 1 : -1) : 0;
  const drawTrunk = () => {
    if (v.trunk === 'forked') {
      const stem = Math.round(trunkH * 0.45);
      shadedColumn(buf, cx - Math.floor(trunkW / 2), groundY - stem, trunkW, stem + 1, trunk);
      const bw = Math.max(2, trunkW - 1);
      const spread = Math.max(2, Math.round(canopyW * 0.18));
      // Two branches leaning out, as diagonal columns.
      for (let j = 0; j <= trunkH - stem; j++) {
        const t = j / Math.max(1, trunkH - stem);
        const off = Math.round(spread * t);
        const y = groundY - stem - j;
        shadedColumn(buf, cx - Math.floor(trunkW / 2) - off, y, bw, 1, trunk);
        shadedColumn(buf, cx - Math.floor(trunkW / 2) + off + (trunkW - bw), y, bw, 1, trunk);
      }
    } else if (lean !== 0) {
      for (let j = 0; j <= trunkH; j++) {
        const t = j / trunkH;
        const off = Math.round(lean * t * t * trunkW * 1.2);
        shadedColumn(buf, cx - Math.floor(trunkW / 2) + off, groundY - j, trunkW, 1, trunk);
      }
    } else {
      shadedColumn(buf, cx - Math.floor(trunkW / 2), trunkTop, trunkW, trunkH + 1, trunk);
      // Root flare: one wider row at the base.
      if (trunkW >= 3 && size >= 20) {
        buf.set(cx - Math.floor(trunkW / 2) - 1, groundY, trunk.outline);
        buf.set(cx - Math.floor(trunkW / 2) + trunkW, groundY, trunk.outline);
      }
    }
    // Bottom outline row and a dark base line.
    const b = buf.bounds();
    if (b) buf.hline(b.x, b.x + b.w - 1, groundY + 1, trunk.outline);
  };
  drawTrunk();
  // Trunk outline (the canopy will cover the top).
  buf.outline(trunk.outline);

  // ── Canopy ───────────────────────────────────────────────────────────────
  const canopyCx = cx + (lean !== 0 ? Math.round(lean * trunkW * 1.2) : 0);
  const canopyBottom = groundY - trunkH + Math.round(canopyH * 0.35);
  const canopyTop = canopyBottom - canopyH;
  const canopyCy = (canopyTop + canopyBottom) / 2;
  let mask: Mask;
  const shading = { highlight: 0.68, light: 0.42, dark: 0.0 };
  if (v.canopy === 'round') {
    const blobs: Blob[] = [{ cx: canopyCx, cy: canopyCy, rx: canopyW / 2, ry: canopyH / 2 }];
    // One or two bulges to break the symmetry.
    const n = shapeRng.int(1, 2);
    for (let i = 0; i < n; i++) {
      const side = i === 0 ? (shapeRng.chance(0.5) ? -1 : 1) : -Math.sign(blobs[1].cx - canopyCx);
      blobs.push({ cx: canopyCx + side * canopyW * shapeRng.range(0.18, 0.3), cy: canopyCy + canopyH * shapeRng.range(0.05, 0.2), rx: canopyW * shapeRng.range(0.3, 0.38), ry: canopyH * shapeRng.range(0.3, 0.38) });
    }
    mask = shadedCloud(buf, blobs, foliage, shading, 0.5);
  } else if (v.canopy === 'tall') {
    const blobs: Blob[] = [
      { cx: canopyCx, cy: canopyCy + canopyH * 0.12, rx: canopyW / 2, ry: canopyH * 0.38 },
      { cx: canopyCx + shapeRng.centered() * 1.5, cy: canopyCy - canopyH * 0.2, rx: canopyW * 0.4, ry: canopyH * 0.3 },
    ];
    mask = shadedCloud(buf, blobs, foliage, shading, 0.5);
  } else if (v.canopy === 'cloud') {
    const blobs: Blob[] = [];
    const n = 4 + shapeRng.int(0, 2);
    // Base mass, then clusters around it.
    blobs.push({ cx: canopyCx, cy: canopyCy + canopyH * 0.08, rx: canopyW * 0.36, ry: canopyH * 0.36 });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + shapeRng.range(-0.3, 0.3);
      const r = shapeRng.range(0.2, 0.3);
      blobs.push({
        cx: canopyCx + Math.cos(a) * canopyW * r,
        cy: canopyCy + Math.sin(a) * canopyH * r * 0.9,
        rx: canopyW * shapeRng.range(0.22, 0.3),
        ry: canopyH * shapeRng.range(0.22, 0.3),
      });
    }
    mask = shadedCloud(buf, blobs, foliage, shading, 0.6);
  } else if (v.canopy === 'layered') {
    const tiers = shapeRng.int(2, 3);
    const blobs: Blob[] = [];
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1 || 1);
      blobs.push({
        cx: canopyCx + shapeRng.centered() * 2,
        cy: canopyBottom - canopyH * (0.22 + t * 0.5),
        rx: (canopyW / 2) * (1 - t * 0.3),
        ry: canopyH * 0.27,
      });
    }
    mask = shadedCloud(buf, blobs, foliage, shading, 0.7);
  } else {
    mask = drawPine(buf, canopyCx, canopyTop, canopyBottom, canopyW, foliage, shapeRng.int(3, 4));
  }

  // ── Leaf texture: a few dabs in the light and dark regions ───────────────
  if (v.canopy !== 'pine') {
    const texRng = stream(seed, 'tree', 'texture');
    const area = mask.count();
    const dabs = Math.round((area / 26) * v.texture);
    for (let i = 0; i < dabs; i++) {
      const x = texRng.int(1, width - 2);
      const y = texRng.int(1, height - 2);
      if (!mask.get(x, y)) continue;
      const c = buf.get(x, y);
      if (c === foliage.outline) continue;
      // A leaf dab: 2 pixels in an L or a bar, one shade lighter (left/top region) or darker (bottom/right).
      const dx = texRng.int(-1, 1);
      const dy = dx === 0 ? (texRng.chance(0.5) ? -1 : 1) : 0;
      const lighter = c === foliage.light ? foliage.highlight : c === foliage.mid ? foliage.light : c === foliage.dark ? foliage.mid : undefined;
      const darker = c === foliage.light ? foliage.mid : c === foliage.mid ? foliage.dark : undefined;
      const useLight = y < canopyCy;
      const paint = useLight ? lighter : darker;
      if (paint === undefined) continue;
      buf.set(x, y, paint);
      if (mask.get(x + dx, y + dy) && buf.get(x + dx, y + dy) !== foliage.outline) buf.set(x + dx, y + dy, paint);
    }
  }

  // ── Fruit or blossom: small dots, never touching each other ──────────────
  if (v.fruit || v.blossom) {
    const dotRng = stream(seed, 'tree', v.fruit ? 'fruit' : 'blossom');
    const color = v.fruit ? dotRng.pick(palette.fruit) : dotRng.pick([palette.flowers[3], palette.flowers[2]]);
    const big = size >= 26 && v.fruit;
    const n = Math.round(mask.count() / (big ? 60 : 45));
    const placed: { x: number; y: number }[] = [];
    for (let tries = 0; tries < n * 8 && placed.length < n; tries++) {
      const x = dotRng.int(2, width - 3);
      const y = dotRng.int(2, height - 3);
      if (!mask.get(x, y) || !mask.get(x + 1, y + 1) || !mask.get(x + 1, y) || !mask.get(x, y + 1)) continue;
      if (buf.get(x, y) === foliage.outline || buf.get(x, y) === foliage.highlight) continue;
      if (placed.some((p) => Math.abs(p.x - x) < 4 && Math.abs(p.y - y) < 4)) continue;
      placed.push({ x, y });
      if (big) {
        buf.set(x, y, shift(color, 0.12, 0.9, -10));
        buf.set(x + 1, y, color);
        buf.set(x, y + 1, color);
        buf.set(x + 1, y + 1, shift(color, -0.12, 1.05, 8));
      } else buf.set(x, y, color);
    }
  }

  buf.validate();
  return {
    buffer: buf,
    anchorX: cx,
    anchorY: groundY,
    footRx: Math.max(2, Math.round(canopyW * 0.32)),
    footRy: Math.max(1, Math.round(canopyW * 0.14)),
    swayRow: canopyBottom + 1,
    variation: v,
  };
}

/** The first weeks: a stem with two leaves, then four. */
function seedling(input: ObjectInput<TreeVariation>, foliage: Ramp, growth: number): TreeResult {
  const buf = new PixelBuffer(7, 7);
  const stem = input.palette.trunk[0];
  const tall = growth > 0.06;
  const groundY = 5;
  buf.vline(3, groundY - (tall ? 3 : 2), groundY, stem.dark);
  buf.set(3, groundY + 1, stem.outline);
  buf.set(2, groundY - (tall ? 2 : 1), foliage.mid);
  buf.set(1, groundY - (tall ? 2 : 1), foliage.light);
  buf.set(4, groundY - (tall ? 3 : 2), foliage.mid);
  buf.set(5, groundY - (tall ? 3 : 2), foliage.light);
  if (tall) {
    buf.set(2, groundY - 4, foliage.light);
    buf.set(4, groundY - 1, foliage.mid);
  }
  buf.validate();
  const v: TreeVariation = { trunk: 'straight', canopy: 'round', foliage: 0, trunkRamp: 0, fruit: false, blossom: false, texture: 0 };
  return { buffer: buf, anchorX: 3, anchorY: groundY, footRx: 1, footRy: 1, swayRow: groundY - 1, variation: v };
}

/**
 * A conifer: triangular tiers stacked from the bottom up; each upper tier is
 * drawn over the one below and carries its own bottom outline, so the tiers
 * read as separate layers of branches. Lit on the left, dark on the right.
 */
function drawPine(buf: PixelBuffer, cx: number, top: number, bottom: number, w: number, ramp: Ramp, tiers: number): Mask {
  const mask = new Mask(buf.width, buf.height);
  const total = bottom - top;
  // Tier t (0 = bottom) spans rows [tierTop, tierBottom]; tiers overlap by ~30%.
  const tierH = Math.round((total / tiers) * 1.3);
  for (let t = 0; t < tiers; t++) {
    const tierBottom = bottom - Math.round((t * (total - tierH)) / Math.max(1, tiers - 1));
    const tierTop = Math.max(top, tierBottom - tierH);
    const tierW = Math.round(w * (1 - t * (0.55 / tiers)));
    const rows = tierBottom - tierTop + 1;
    const tier = new Mask(buf.width, buf.height);
    for (let j = 0; j < rows; j++) {
      const half = Math.max(0.5, (tierW / 2) * ((j + 1) / rows));
      const x0 = Math.ceil(cx - half);
      const x1 = Math.floor(cx + half - 0.5);
      const y = tierTop + j;
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5 - cx) / Math.max(1, half);
        const c = u < -0.3 ? ramp.light : u > 0.4 ? ramp.dark : ramp.mid;
        buf.set(x, y, c);
        tier.set(x, y);
      }
    }
    buf.paintMask(tier.edge(), ramp.outline);
    mask.union(tier);
  }
  buf.set(cx, top, ramp.outline);
  buf.set(cx - 1, top + 1, ramp.highlight);
  return mask;
}
