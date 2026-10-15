// RELEASE AUDIT (2026-10-15): the colour contract between Blobbi Pixel and the kit. A V3 Blobbi's look comes from its
// address only: Pixel must derive the SAME seed as the kit (`deriveBlobbiV3Seed(owner, d)`), read the SAME genome
// colours, and draw with the kit's own palette (`derivePalette`), the sprite being the kit's SVG rasterized with banded
// gradients. These tests pin that no transformation of its own changes a Blobbi's colours: the main body colour
// of a drawn sprite (its outline aside) lies on the kit's own body gradient (between its stops), for adults and babies, and a V1/V2 world form keeps the
// colours its event states. World lighting (day and night) is applied later to the whole frame and is not part of it.
import { describe, expect, it } from 'vitest';
import { deriveBlobbiV3Seed, getCanonicalBlobbiD } from '@blobbi-kit/core';
import { derivePalette, generateGenome } from '@blobbi-kit/renderer/procedural';
import { resolveBlobbi, worldFormSource } from '../src/blobbi/source';
import { identityOfSource } from '../src/blobbi/identity';
import { buildBlobbiSprite, REST_POSE } from '../src/blobbi/sprite';
import { hex, shift, toOklch } from '../src/core/color';
import type { PixelBuffer } from '../src/core/pixel';

// Fixed public test keys (no real identity): 64 hex digits each.
const OWNERS = ['1'.repeat(64), '2b'.repeat(32), 'c3d4'.repeat(16), '9f'.repeat(32)];
const PETS = ['a1b2c3d4e5', '0a0a0a0a0a', 'b0cab0cab0'];

/** Whether colour `c` lies on the kit's gradient through `stops` (a mix of two neighbouring stops, within `tol` per channel). */
const onGradient = (c: number, stops: readonly number[], tol = 3): boolean => {
  const ch = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff];
  const [r, g, b] = ch(c);
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = ch(stops[i]);
    const z = ch(stops[i + 1]);
    for (let k = 0; k <= 64; k++) {
      const t = k / 64;
      const m = a.map((v, j) => v + (z[j] - v) * t);
      if (Math.abs(m[0] - r) <= tol && Math.abs(m[1] - g) <= tol && Math.abs(m[2] - b) <= tol) return true;
    }
  }
  return false;
};
/** The most frequent opaque colour of a sprite, leaving out its one-pixel outline (Pixel's own line, from `bodyDark`). */
const dominantBody = (buf: PixelBuffer, outline: number): number => {
  const count = new Map<number, number>();
  for (const c of buf.data) if (c >>> 24 !== 0 && c !== outline) count.set(c, (count.get(c) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

describe('the V3 colour contract (Pixel and the kit)', () => {
  for (const owner of OWNERS)
    for (const pet of PETS) {
      const d = getCanonicalBlobbiD(owner, pet);
      it(`${owner.slice(0, 4)}/${pet}: the kit's seed, genome colours and palette, adult and baby`, () => {
        const r = resolveBlobbi({ pubkey: owner, d });
        if (!r.ok) throw new Error(r.error);
        expect(r.source.seed).toBe(deriveBlobbiV3Seed(owner, d));
        const genome = generateGenome(deriveBlobbiV3Seed(owner, d));
        const palette = derivePalette(genome.colors);
        for (const stage of ['adult', 'baby'] as const) {
          const id = identityOfSource(r.source, stage);
          expect(id.genome.colors).toEqual(genome.colors);
          expect(id.body.mid).toBe(hex(genome.colors.base!));
          const ramps = (stage === 'adult' ? [[palette.bodyLight, palette.bodyMid, palette.bodyDark]] : [[palette.babyLight, palette.babyMid, palette.babyDark], [palette.bodyLight, palette.bodyMid, palette.bodyDark]]).map((r) => r.map(hex));
          const outline = shift(hex(palette.bodyDark), -0.16, 1.05, 6);
          const main = dominantBody(buildBlobbiSprite(id, REST_POSE, 48).buffer, outline);
          const rgb = [main & 0xff, (main >>> 8) & 0xff, (main >>> 16) & 0xff].map((v) => v.toString(16).padStart(2, '0')).join('');
          if (stage === 'adult') expect(ramps.some((r) => onGradient(main, r)), `adult: the body's main colour #${rgb} lies on the kit's own gradient`).toBe(true);
          else {
            // A baby's body also carries the kit's shadow band (darker than babyDark): its HUE is the kit's baby hue.
            const hueGap = Math.abs(((toOklch(main).h - toOklch(hex(palette.babyMid)).h + 540) % 360) - 180);
            expect(hueGap, `baby: the body's main colour #${rgb} has the kit's baby hue`).toBeLessThanOrEqual(12);
          }
        }
      });
    }

  it('a V1/V2 world form keeps the colours its event states (no V3 creature in their place)', () => {
    const owner = '5'.repeat(64);
    const d = getCanonicalBlobbiD(owner, 'c1c2c3c4c5');
    const traits = { base: '#f14b83', secondary: '#822c00', eye: '#4a0024', pattern: 'solid', mark: 'none' } as const;
    const src = worldFormSource(owner, d, 'v2', traits as never);
    expect(src).not.toBeNull();
    const id = identityOfSource(src!, 'adult');
    expect(id.genome.colors.base).toBe('#f14b83');
    expect(id.body.mid).toBe(hex('#f14b83'));
    const palette = derivePalette(id.genome.colors);
    const main = dominantBody(buildBlobbiSprite(id, REST_POSE, 48).buffer, shift(hex(palette.bodyDark), -0.16, 1.05, 6));
    expect(onGradient(main, [palette.bodyLight, palette.bodyMid, palette.bodyDark].map(hex))).toBe(true);
  });
});
