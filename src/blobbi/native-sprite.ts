/**
 * THE NATIVE PIXEL BLOBBI (approach A, kept for comparison only). One
 * identity, four views, built from this lab's own pixel geometry:
 * an egg silhouette rasterized row by row, banded sphere shading, and every
 * feature placed in body-relative units so the same individual is the same
 * from every side. Nothing here samples an SVG.
 *
 * The POSE is everything that changes from frame to frame (view, facing,
 * breathing, lids, expression, walk phase, gaze). Sprites are pure functions
 * of (identity, pose, size), so an animation is a sequence of cache keys.
 */
import { Mask, PixelBuffer, type Sprite } from '../core/pixel';
import { blobScore, shadeOf } from '../core/shade';
import { type Color, hex, mix } from '../core/color';
import { clamp } from '../core/math';
import type { PixelBlobbiIdentity } from './identity';

import { type BlobbiPose } from './pose';
export { EXPRESSIONS, REST_POSE, poseKey, type BlobbiPose, type Expression, type Facing, type View } from './pose';

const WHITE = hex('#ffffff');

/**
 * Half-width of the egg at a height fraction `t` (0 top, 1 bottom): two
 * half-ellipses meeting at the widest row `c`. A lower `c` means a narrower
 * crown (the Blobbi egg); `round` pulls it toward a plain ellipse.
 */
function eggHalf(t: number, c: number, round: number): number {
  const egg = t < c ? Math.sqrt(Math.max(0, 1 - ((c - t) / c) ** 2)) : Math.sqrt(Math.max(0, 1 - ((t - c) / (1 - c)) ** 2));
  const ellipse = Math.sqrt(Math.max(0, 1 - ((t - 0.5) / 0.5) ** 2));
  return egg * (1 - round) + ellipse * round;
}

interface Frame {
  /** The body's rows: for each row its left and right extent (inclusive). */
  rows: { y: number; x0: number; x1: number }[];
  top: number;
  bottom: number;
  cx: number;
  halfW: number;
  bodyH: number;
}

/** Build one sprite. `size` is the standing height in pixels (feet to crown, tuft and antennae extra). */
export function buildNativeSprite(id: PixelBlobbiIdentity, pose: BlobbiPose, size: number): Sprite {
  const H = clamp(Math.round(size), 10, 64);
  const g = id.genes;
  const side = pose.view === 'side';
  const away = pose.view === 'back';
  const f = pose.facing;
  const big = H >= 22;

  // ── Proportions ─────────────────────────────────────────────────────────
  const bodyH = Math.round(H * 0.86 * (1 + 0.05 * g.bodyHeight)) + pose.breath;
  const halfW = Math.max(3, (H * 0.43 * (1 + 0.07 * g.bodyWidth) * (side ? 0.84 : 1)) / 1 - pose.breath * 0.3);
  const widest = 0.6 - 0.05 * g.topWidth;
  const round = clamp(0.25 + 0.14 * g.roundness, 0, 0.6);
  const headroom = Math.round(H * 0.45) + 2;
  const width = Math.ceil(halfW * 2) + 10;
  const height = headroom + bodyH + 3;
  const buf = new PixelBuffer(width, height);
  const cx = Math.floor(width / 2);
  const bottom = height - 3; // last body row; feet reach one or two rows lower
  const top = bottom - bodyH + 1;
  const bob = pose.walk === 1 || pose.walk === 4 ? 1 : 0;

  // Rows of the egg.
  const frame: Frame = { rows: [], top: top - bob, bottom: bottom - bob, cx, halfW, bodyH };
  for (let i = 0; i < bodyH; i++) {
    const t = (i + 0.5) / bodyH;
    const half = halfW * eggHalf(t, widest, round);
    if (half < 0.5) continue;
    const y = frame.top + i;
    frame.rows.push({ y, x0: Math.ceil(cx - half), x1: Math.floor(cx + half - 0.5) });
  }
  const bodyMask = new Mask(width, height);
  for (const r of frame.rows) for (let x = r.x0; x <= r.x1; x++) bodyMask.set(x, r.y);
  const rowAt = (y: number) => frame.rows.find((r) => r.y === y);
  const inBody = (x: number, y: number) => bodyMask.get(x, y);

  // ── Feet (behind the body) ──────────────────────────────────────────────
  const footRx = Math.max(1.5, halfW * 0.3 * (1 + 0.08 * g.footSize));
  const footDx = halfW * 0.42 * (1 + 0.07 * g.footSpacing);
  const footY = frame.bottom + 1;
  const footColor = id.body.dark;
  const drawFoot = (fx: number, fy: number) => {
    const m = new Mask(width, height);
    m.fillEllipse(fx, fy, footRx, 1.6);
    buf.paintMask(m, footColor);
    buf.paintMask(m.edge(), id.body.outline);
  };
  if (side) {
    // Two feet seen from the side, the far one a little behind; the walk cycle slides them.
    const stride = pose.walk === 1 || pose.walk === 2 ? 1 : pose.walk === 4 || pose.walk === 5 ? -1 : 0;
    drawFoot(cx - f * 1.5 - f * stride * 1.5, footY);
    drawFoot(cx + f * 1.5 + f * stride * 1.5, footY);
  } else {
    const lift = (which: -1 | 1) => ((pose.walk === 1 || pose.walk === 2) && which === -1) || ((pose.walk === 4 || pose.walk === 5) && which === 1) ? -1 : 0;
    drawFoot(cx - footDx, footY + lift(-1));
    drawFoot(cx + footDx, footY + lift(1));
  }

  // ── Tail (behind the body: side and back views) ────────────────────────
  if (id.tail.kind !== 'none' && (away || side)) {
    const ty = frame.bottom - Math.round(bodyH * 0.22);
    const tx = away ? cx : cx - f * (halfW + 0.5);
    const tailColor = id.body.light;
    if (id.tail.kind === 'nub') {
      buf.fillEllipse(tx + (away ? 0 : -f * 0.5), ty + 0.5, 1.6, 1.4, tailColor);
      buf.outline(id.body.outline, maskOf(buf, (c) => c === tailColor));
    } else if (id.tail.kind === 'curl') {
      const dir = away ? 1 : -f;
      buf.set(tx, ty, tailColor);
      buf.set(tx + dir, ty - 1, tailColor);
      buf.set(tx + dir * 2, ty - 2, tailColor);
      buf.set(tx + dir * 2, ty - 3, id.accent);
      buf.set(tx + dir, ty - 3, id.accent);
    } else {
      const dir = away ? 1 : -f;
      buf.set(tx, ty, id.body.dark);
      buf.set(tx + dir, ty, id.body.dark);
      buf.set(tx + dir * 2, ty - 1, hex('#6fc53c'));
      buf.set(tx + dir * 3, ty - 1, hex('#6fc53c'));
      buf.set(tx + dir * 2, ty - 2, hex('#8ede5c'));
      buf.set(tx + dir * 3, ty - 2, hex('#6fc53c'));
    }
  }

  // ── Body: banded sphere shading, lit from the viewer's top-left ─────────
  for (const r of frame.rows) {
    const t = (r.y - frame.top + 0.5) / bodyH;
    const half = (r.x1 - r.x0 + 1) / 2;
    for (let x = r.x0; x <= r.x1; x++) {
      const u = (x + 0.5 - cx) / Math.max(1, half);
      const v = (t - 0.5) * 2;
      let c = shadeOf(blobScore(u, v * 0.9, 0.9), id.body, { highlight: 0.74, light: 0.4, dark: 0.0 });
      // Gradient pattern: the base deepens toward the markings colour.
      if (id.pattern.kind === 'gradient' && t > 0.55) {
        const k = clamp((t - 0.55) / 0.45, 0, 1) * (0.35 + 0.15 * id.pattern.gradientStrength);
        c = mix(c, id.secondary, k);
      }
      buf.set(x, r.y, c);
    }
  }

  // ── Belly patch ─────────────────────────────────────────────────────────
  if (id.belly && !away) {
    const by = frame.bottom - Math.round(bodyH * 0.3);
    const brx = Math.max(1.5, halfW * 0.42);
    const bry = Math.max(1.5, bodyH * 0.2);
    const bellyColor = mix(id.body.light, WHITE, 0.45);
    const m = new Mask(width, height);
    m.fillEllipse(cx + (side ? f * halfW * 0.15 : 0), by, brx, bry);
    buf.paintMaskWith(m, (x, y) => (inBody(x, y) && buf.get(x, y) !== id.body.outline ? bellyColor : undefined));
  }

  // ── Patterns in the markings colour ─────────────────────────────────────
  if (id.pattern.kind === 'striped') {
    const bands = id.pattern.stripes;
    for (let b = 0; b < bands; b++) {
      const t = 0.12 + (b / bands) * 0.7;
      const y = frame.top + Math.round(t * bodyH);
      const r = rowAt(y);
      if (!r) continue;
      const w = r.x1 - r.x0 + 1;
      // From the front the stripes wrap round the back: only their ends show at the flanks.
      // From the side they cover the rear two thirds; from behind they run across.
      let x0 = r.x0;
      let x1 = r.x1;
      if (!away && !side) {
        const reach = Math.max(1, Math.round(w * (t < 0.3 ? 0.5 : 0.16)));
        paintBand(buf, r.x0, r.x0 + reach - 1, y, id.secondary, big);
        paintBand(buf, r.x1 - reach + 1, r.x1, y, id.secondary, big);
        continue;
      }
      if (side) {
        if (f > 0) x1 = r.x0 + Math.round(w * 0.62);
        else x0 = r.x1 - Math.round(w * 0.62);
      }
      paintBand(buf, x0, x1, y, id.secondary, big);
    }
  } else if (id.pattern.kind === 'spotted') {
    const n = id.pattern.spots;
    const spots: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const t = 0.3 + (i / n) * 0.45;
      const y = frame.top + Math.round(t * bodyH);
      const r = rowAt(y);
      if (!r) continue;
      const w = r.x1 - r.x0 + 1;
      if (away) spots.push([r.x0 + Math.round(w * (0.25 + 0.5 * ((i * 7) % 3) / 2)), y]);
      else if (side) spots.push([f > 0 ? r.x0 + Math.round(w * (0.18 + 0.16 * (i % 2))) : r.x1 - Math.round(w * (0.18 + 0.16 * (i % 2))), y]);
      else spots.push([i % 2 === 0 ? r.x0 + 1 : r.x1 - 1, y]);
    }
    for (const [sx, sy] of spots) {
      buf.set(sx, sy, id.secondary);
      if (big) {
        buf.set(sx + 1, sy, id.secondary);
        buf.set(sx, sy + 1, id.secondary);
        buf.set(sx + 1, sy + 1, id.secondary);
      }
    }
  }

  // ── Outline of the body (over patterns) ─────────────────────────────────
  buf.paintMask(bodyMask.edge(), id.body.outline);

  // ── Special mark ────────────────────────────────────────────────────────
  if (id.mark.kind !== 'none') {
    const markColor = id.accent === id.body.highlight ? mix(id.body.highlight, WHITE, 0.5) : id.accent;
    const my = frame.top + Math.round(bodyH * (away ? 0.5 : 0.68));
    const mx = away ? cx + id.mark.side * Math.round(halfW * 0.35) : side ? cx - f * Math.round(halfW * 0.25) : cx + id.mark.side * Math.round(halfW * 0.4);
    drawMark(buf, mx, my, id.mark.kind, markColor, (x, y) => inBody(x, y) && buf.get(x, y) !== id.body.outline);
  }

  // ── Arms: small paddles at the flanks ───────────────────────────────────
  const armY = frame.top + Math.round(bodyH * 0.58);
  const armH = big ? 3 : 2;
  const armW = big ? 2 : 2;
  const drawArm = (ax: number, dir: -1 | 1) => {
    // A rounded paddle just outside the flank, lit on top, outlined where it meets air.
    const m = new Mask(width, height);
    m.fillEllipse(ax + dir * (armW / 2), armY + armH / 2, armW / 2 + 0.6, armH / 2 + 0.6);
    buf.paintMaskWith(m, (x, y) => (inBody(x, y) ? undefined : y < armY + 1 ? id.body.light : id.body.mid));
    buf.paintMaskWith(m.edge(), (x, y) => (inBody(x, y) ? undefined : id.body.outline));
  };
  if (side) {
    // The near arm hangs over the middle of the body.
    const ax = cx + f * Math.round(halfW * 0.25);
    for (let j = 0; j < armH; j++) {
      buf.set(ax, armY + j, id.body.light);
      buf.set(ax + f, armY + j, id.body.mid);
    }
    for (let j = -1; j <= armH; j++) {
      buf.set(ax - f, armY + j, id.body.dark);
      buf.set(ax + 2 * f, armY + j, id.body.dark);
    }
    buf.set(ax, armY - 1, id.body.dark);
    buf.set(ax + f, armY - 1, id.body.dark);
    buf.set(ax, armY + armH, id.body.dark);
    buf.set(ax + f, armY + armH, id.body.dark);
  } else if (!away) {
    const r = rowAt(armY) ?? frame.rows[Math.floor(frame.rows.length / 2)];
    drawArm(r.x0 - 1, -1);
    drawArm(r.x1 + 1, 1);
  }

  // ── Ears ────────────────────────────────────────────────────────────────
  if (id.ears.kind !== 'none') {
    const ey = frame.top + Math.round(bodyH * 0.2);
    const r = rowAt(ey);
    if (r) {
      const sides: Array<-1 | 1> = side ? [-f as -1 | 1] : [-1, 1];
      for (const d of sides) {
        const ex = d < 0 ? r.x0 - 1 : r.x1 + 1;
        if (id.ears.kind === 'round') {
          const m = new Mask(width, height);
          m.fillEllipse(ex + d * 0.5, ey - 1, big ? 2.2 : 1.6, big ? 2.6 : 2);
          buf.paintMaskWith(m, (x, y) => (inBody(x, y) ? undefined : id.body.mid));
          buf.paintMaskWith(m.edge(), (x, y) => (inBody(x, y) ? undefined : id.body.outline));
          buf.set(ex + d, ey - 1, mix(id.cheek, id.body.light, 0.5));
        } else {
          const len = big ? 4 : 3;
          for (let i = 0; i < len; i++) {
            const yy = ey - i;
            buf.set(ex + d * Math.floor(i / 2), yy, i === len - 1 ? id.body.outline : id.body.mid);
            buf.set(ex + d * (Math.floor(i / 2) + 1), yy, id.body.outline);
          }
          buf.set(ex, ey + 1, id.body.outline);
          buf.set(ex + d, ey + 1, id.body.outline);
        }
      }
    }
  }

  // ── Face (front and side) ───────────────────────────────────────────────
  if (!away) {
    const eyeW = Math.max(2, Math.round(halfW * 0.42 * (1 + 0.09 * g.eyeSize)));
    const eyeH = eyeW + (big ? 2 : 1);
    const eyeCy = frame.top + Math.round(bodyH * (0.42 + 0.04 * g.eyeHeight));
    const eyeDx = Math.max(eyeW, Math.round(halfW * 0.45 * (1 + 0.08 * g.eyeSpacing)));
    const eyes: { x: number; forward: number }[] = side ? [{ x: cx + f * Math.round(halfW * 0.4), forward: f }] : [{ x: cx - eyeDx, forward: 0 }, { x: cx + eyeDx - 1, forward: 0 }];
    const lid = pose.lid === 2 || pose.expression === 'sleepy' ? 2 : pose.lid === 1 || pose.expression === 'sad' ? 1 : 0;
    const irisScale = pose.expression === 'surprised' || pose.expression === 'excited' ? 0.8 : 1;
    for (const e of eyes) {
      const ex0 = e.x - Math.floor(eyeW / 2);
      const ey0 = eyeCy - Math.floor(eyeH / 2);
      if (lid === 2) {
        // Closed: a dark line with a gentle downward curve.
        buf.hline(ex0, ex0 + eyeW - 1, eyeCy, id.body.outline);
        if (eyeW >= 3) {
          buf.set(ex0, eyeCy - 1, id.body.outline);
          buf.set(ex0 + eyeW - 1, eyeCy - 1, id.body.outline);
          buf.set(ex0, eyeCy, id.body.mid);
          buf.set(ex0 + eyeW - 1, eyeCy, id.body.mid);
        }
        continue;
      }
      // White, with the top rows covered by a half lid.
      const m = new Mask(width, height);
      for (let j = 0; j < eyeH; j++) for (let i = 0; i < eyeW; i++) {
        const corner = (j === 0 || j === eyeH - 1) && (i === 0 || i === eyeW - 1) && eyeW >= 3;
        if (!corner) m.set(ex0 + i, ey0 + j);
      }
      const lidRows = lid === 1 ? Math.max(1, Math.round(eyeH * 0.4)) : 0;
      buf.paintMaskWith(m, (_x, y) => (y < ey0 + lidRows ? id.body.mid : WHITE));
      if (lidRows) buf.hline(ex0, ex0 + eyeW - 1, ey0 + lidRows - 1, id.body.outline);
      // Iris: the eye colour, large but leaving a white ring, pulled toward the gaze; a highlight top-left.
      const irisW = Math.max(1, Math.round((eyeW - 2) * irisScale) || 1);
      const irisH = Math.max(1, Math.round((eyeH - 2) * irisScale) || 1);
      const forward = e.forward;
      const gx = clamp(pose.gazeX + forward, -1, 1);
      const ix = ex0 + Math.floor((eyeW - irisW) / 2) + (eyeW - irisW >= 2 ? gx : 0);
      const iy = ey0 + Math.floor((eyeH - irisH) / 2) + (eyeH - irisH >= 2 ? clamp(pose.gazeY + 1, 0, 1) : 0) + (eyeH - irisH >= 3 ? 0 : 0);
      for (let j = 0; j < irisH; j++) for (let i = 0; i < irisW; i++) if (m.get(ix + i, iy + j) && iy + j >= ey0 + lidRows) buf.set(ix + i, iy + j, id.eye);
      if (irisW >= 2 && irisH >= 2) {
        buf.set(ix, iy, WHITE);
        if (irisW >= 3 && irisH >= 3) buf.set(ix + irisW - 1, iy + irisH - 1, mix(id.eye, WHITE, 0.35));
      } else if (m.get(ix, iy - 1) && iy - 1 >= ey0 + lidRows) buf.set(ix, iy, mix(id.eye, WHITE, 0.3));
      // Brows for expressions.
      const browY = ey0 - 2;
      if (pose.expression === 'sad' || pose.expression === 'surprised' || pose.expression === 'excited') {
        const inner = e.forward !== 0 ? -e.forward : e.x < cx ? 1 : -1;
        if (pose.expression === 'sad') {
          buf.set(ex0 + (inner > 0 ? eyeW - 1 : 0), browY, id.body.outline);
          buf.set(ex0 + (inner > 0 ? eyeW - 2 : 1), browY + 1, id.body.outline);
        } else {
          buf.hline(ex0, ex0 + eyeW - 1, browY - 1, id.body.outline);
        }
      }
    }
    // Mouth.
    const mouthY = eyeCy + Math.ceil(eyeH / 2) + (big ? 2 : 1);
    const mouthX = side ? cx + f * Math.round(halfW * 0.5) : cx;
    const mw = g.mouthWidth > 0.3 ? 2 : 1; // half width
    const mouth = id.body.outline;
    switch (pose.expression) {
      case 'happy':
      case 'excited':
        if (side) {
          buf.set(mouthX, mouthY, mouth);
          buf.set(mouthX - f, mouthY + 1, mouth);
          buf.set(mouthX - f * 2, mouthY + 1, mouth);
        } else {
          buf.hline(cx - mw, cx + mw, mouthY + 1, mouth);
          buf.set(cx - mw - 1, mouthY, mouth);
          buf.set(cx + mw + 1, mouthY, mouth);
          if (pose.expression === 'excited') buf.hline(cx - mw + 1, cx + mw - 1, mouthY + 2, mix(id.cheek, mouth, 0.3));
        }
        break;
      case 'sad':
        if (side) {
          buf.set(mouthX, mouthY + 1, mouth);
          buf.set(mouthX - f, mouthY, mouth);
          buf.set(mouthX - f * 2, mouthY, mouth);
        } else {
          buf.hline(cx - mw, cx + mw, mouthY, mouth);
          buf.set(cx - mw - 1, mouthY + 1, mouth);
          buf.set(cx + mw + 1, mouthY + 1, mouth);
        }
        break;
      case 'surprised':
        buf.fillRect(side ? mouthX - (f > 0 ? 1 : 0) : cx - 1, mouthY, 2, 2, mouth);
        break;
      case 'sleepy':
        buf.hline(side ? mouthX - (f > 0 ? 1 : 0) : cx - 1, side ? mouthX + (f > 0 ? 0 : 1) : cx, mouthY, mouth);
        break;
      default:
        if (side) {
          buf.set(mouthX, mouthY, mouth);
          buf.set(mouthX - f, mouthY + (g.mouthCurve > -0.3 ? 1 : 0), mouth);
        } else {
          // A small smile: ends one pixel up when the curve gene says so.
          buf.hline(cx - mw + 1, cx + mw - 1, mouthY + 1, mouth);
          if (g.mouthCurve > -0.4) {
            buf.set(cx - mw, mouthY, mouth);
            buf.set(cx + mw, mouthY, mouth);
          } else buf.hline(cx - mw, cx + mw, mouthY + 1, mouth);
        }
    }
    // Cheeks.
    if (pose.expression !== 'sad') {
      const cheekY = mouthY - (big ? 1 : 0);
      const cheekW = big && g.cheekSize > -0.3 ? 2 : 1;
      const cheek = pose.expression === 'excited' ? mix(id.cheek, hex('#ff4d8d'), 0.4) : id.cheek;
      if (side) {
        const cxk = cx + f * Math.round(halfW * 0.1);
        for (let i = 0; i < cheekW; i++) if (inBody(cxk - f * i, cheekY) && buf.get(cxk - f * i, cheekY) !== id.body.outline) buf.set(cxk - f * i, cheekY, cheek);
      } else {
        for (const e of eyes) {
          const dir = e.x < cx ? -1 : 1;
          const start = e.x + dir * (Math.ceil(eyeW / 2) + 1);
          for (let i = 0; i < cheekW; i++) {
            const x = start + dir * i;
            if (inBody(x, cheekY) && buf.get(x, cheekY) !== id.body.outline) buf.set(x, cheekY, cheek);
          }
        }
      }
      // Freckles: two dark dots under the cheeks.
      if (id.freckles && big && !side) {
        for (const e of eyes) {
          const dir = e.x < cx ? -1 : 1;
          const x = e.x + dir * (Math.ceil(eyeW / 2) + 2);
          if (inBody(x, cheekY + 2) && buf.get(x, cheekY + 2) !== id.body.outline) buf.set(x, cheekY + 2, id.body.dark);
        }
      }
    }
  }

  // ── Crown: tuft, antennae, horns ────────────────────────────────────────
  const apexRow = frame.rows[0];
  const apexX = cx + (side ? -f * 1 : 0);
  const apexY = apexRow.y;
  // Tuft: a sprig of two or three leaves in the body's dark tone, leaning with the gene (and back, in profile).
  {
    const lean = side ? -f : Math.sign(g.tuftTilt) * (Math.abs(g.tuftTilt) > 0.3 ? 1 : 0);
    const len = big ? 3 : 2;
    const tuft = id.body.dark;
    for (let i = 1; i <= len; i++) buf.set(apexX + lean * Math.floor(i / 2), apexY - i, i === len ? id.body.mid : tuft);
    if (g.tuftSize > -0.4) {
      buf.set(apexX - lean - 1 + (lean === 0 ? 0 : 0), apexY - 1, tuft);
      if (big) buf.set(apexX - lean - 1 - (lean === 0 ? 1 : 0), apexY - 2, id.body.mid);
    }
    if (big && g.tuftSize > 0.3) buf.set(apexX + 1 + lean, apexY - 1, tuft);
  }
  // Antennae: thin stalks with a ball tip in the accent colour.
  if (id.antenna.count > 0) {
    const n = id.antenna.count;
    const len = Math.round(H * (0.26 + 0.05 * id.antenna.length));
    const positions: number[] = [];
    if (side) positions.push(n === 2 ? -f * 1 : -f * 1);
    else if (n === 2) {
      const d = Math.max(2, Math.round(halfW * (0.5 + 0.1 * id.antenna.position)));
      positions.push(-d, d);
    } else positions.push((away ? -1 : 1) * id.antenna.side * Math.max(2, Math.round(halfW * (0.45 + 0.1 * id.antenna.position))));
    positions.forEach((px) => {
      // Root on the crown surface: the first row whose span contains this x.
      let ry = apexY;
      for (const r of frame.rows) if (cx + px >= r.x0 && cx + px <= r.x1) {
        ry = r.y;
        break;
      }
      const outward = side ? -f : Math.sign(px) || 1;
      const tilt = (0.3 + 0.2 * id.antenna.tilt) * outward;
      const curve = 0.4 * id.antenna.curvature;
      let lx = cx + px;
      let ly = ry - 1;
      const stalk = id.body.dark;
      for (let i = 1; i <= len; i++) {
        const s = i / len;
        const xx = Math.round(cx + px + tilt * i + curve * outward * s * s * len * 0.8 + (side ? -f * s * s * len * 0.5 : 0));
        const yy = ry - i;
        buf.line(lx, ly, xx, yy, stalk);
        lx = xx;
        ly = yy;
      }
      // The tip ball, with a highlight.
      const tipR = big ? 1.5 : 1;
      const tm = new Mask(width, height);
      tm.fillEllipse(lx + 0.5, ly - tipR + 0.5, tipR, tipR);
      buf.paintMask(tm, id.accent);
      buf.paintMask(tm.edge(), mix(id.accent, id.body.outline, 0.55));
      if (big) buf.set(lx, ly - 2, mix(id.accent, WHITE, 0.5));
    });
  }
  // Horns: short plump cones in cream.
  if (id.horns.kind !== 'none') {
    const hornLen = big ? 4 : 3;
    const drawHorn = (hx: number, hy: number, dir: number, up: boolean) => {
      for (let i = 0; i < hornLen; i++) {
        const w = Math.max(1, Math.round((hornLen - i) * 0.6));
        const yy = up ? hy - i : hy + Math.round(i * 0.3);
        const xx = hx + Math.round(dir * i * (up ? 0.35 : 0.9));
        for (let j = 0; j < w; j++) buf.set(xx + (dir < 0 ? -j : j), yy, j === 0 ? id.horn.light : id.horn.mid);
      }
      buf.outline(id.horn.outline, maskOf(buf, (c) => c === id.horn.light || c === id.horn.mid));
    };
    if (id.horns.kind === 'forehead') {
      if (!away) drawHorn(cx + (side ? f * 1 : 0), apexY + (side ? 1 : 2) - 1, side ? f : 0, true);
    } else if (id.horns.kind === 'top') {
      const d = Math.max(2, Math.round(halfW * 0.45));
      if (side) drawHorn(cx - f * 1, apexY + 1, -f, true);
      else {
        drawHorn(cx - d, apexY + 2, -1, true);
        drawHorn(cx + d, apexY + 2, 1, true);
      }
    } else {
      const hy = frame.top + Math.round(bodyH * 0.22);
      const r = rowAt(hy) ?? apexRow;
      if (side) drawHorn(f > 0 ? r.x0 : r.x1, hy, -f, false);
      else {
        drawHorn(r.x0, hy, -1, false);
        drawHorn(r.x1, hy, 1, false);
      }
    }
  }

  buf.validate();
  return { buffer: buf, anchorX: cx, anchorY: footY + 1, footRx: Math.max(2, Math.round(halfW * 0.8)), footRy: 2 };
}

function paintBand(buf: PixelBuffer, x0: number, x1: number, y: number, c: Color, thick: boolean): void {
  buf.hline(x0, x1, y, c);
  if (thick) buf.hline(x0 + 1, x1 - 1, y + 1, c);
}

function maskOf(buf: PixelBuffer, pred: (c: Color) => boolean): Mask {
  const m = new Mask(buf.width, buf.height);
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (pred(buf.get(x, y))) m.set(x, y);
  return m;
}

/** 3×3 glyphs for the special marks. */
const MARK_GLYPHS: Record<Exclude<PixelBlobbiIdentity['mark']['kind'], 'none'>, string[]> = {
  star: ['.#.', '###', '.#.'],
  heart: ['#.#', '###', '.#.'],
  sparkle: ['.#.', '#.#', '.#.'],
  moon: ['##.', '#..', '##.'],
};

function drawMark(buf: PixelBuffer, cx: number, cy: number, kind: keyof typeof MARK_GLYPHS, color: Color, ok: (x: number, y: number) => boolean): void {
  const rows = MARK_GLYPHS[kind];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (rows[j][i] === '#' && ok(cx - 1 + i, cy - 1 + j)) buf.set(cx - 1 + i, cy - 1 + j, color);
}
