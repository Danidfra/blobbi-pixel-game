import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { paletteFor } from '../src/world/generate';
import { generateWhaleGenome, renderWhale, whaleAnatomy, whalePose } from '../src/carriers/whale';
import { generateMantaGenome, mantaAnatomy, renderManta } from '../src/carriers/manta';
import { SPECIES, islandGrowth, renderSpeciesPreview } from '../src/carriers/species';
import { SFX } from '../src/audio/sfx';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { worldIdentity } from '../src/game/persistence';
import { hash32 } from '../src/core/rng';

const pal = paletteFor('cozy');
const W = 120;
const H = 160;
const sig = (data: Uint32Array) => hash32(Array.from(data, (c) => c.toString(36)).join(','));
const box = (m: { bounds(): { x: number; y: number; w: number; h: number } | null }) => m.bounds()!;

describe('new Carrier species: deterministic, seed-based', () => {
  it('the same seed renders the same pixels; different seeds differ', () => {
    for (const sp of ['whale', 'manta'] as const) {
      const a = renderSpeciesPreview(sp, `${sp}-1`, W, H, 0.7, pal);
      const b = renderSpeciesPreview(sp, `${sp}-1`, W, H, 0.7, pal);
      const c = renderSpeciesPreview(sp, `${sp}-2`, W, H, 0.7, pal);
      expect(sig(a.data)).toBe(sig(b.data));
      expect(sig(a.data)).not.toBe(sig(c.data));
    }
  });

  it('genomes vary within their species ranges', () => {
    const whales = Array.from({ length: 20 }, (_, i) => generateWhaleGenome(`w${i}`));
    for (const g of whales) {
      expect(g.length).toBeGreaterThanOrEqual(0.78);
      expect(g.length).toBeLessThanOrEqual(0.86);
      expect(g.knuckles).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(whales.map((g) => g.finPale)).size).toBe(2);
    const mantas = Array.from({ length: 20 }, (_, i) => generateMantaGenome(`m${i}`));
    expect(new Set(mantas.map((g) => g.spots.length)).size).toBeGreaterThan(2);
  });
});

describe('genuinely different anatomy', () => {
  it('a whale is long, a manta is wide, a turtle is round', () => {
    const wf = renderWhale(whaleAnatomy(generateWhaleGenome('w'), 240, 320), 0, pal);
    const mf = renderManta(mantaAnatomy(generateMantaGenome('m'), 240, 320), 0, pal);
    const wb = box(wf.body);
    const mb = box(mf.body);
    expect(wb.h / wb.w).toBeGreaterThan(1.4);
    expect(mb.w / mb.h).toBeGreaterThan(1.1);
    const t = generateTurtleWorld('turtle-0').turtle!;
    expect(t.ry / t.rx).toBeGreaterThan(0.8);
    expect(t.ry / t.rx).toBeLessThan(1.6);
    // Island shapes follow the body: long and narrow on the whale, wide and flat on the manta.
    const wi = box(wf.island.mask);
    const mi = box(mf.island.mask);
    expect(wi.h).toBeGreaterThan(wi.w);
    expect(mi.w).toBeGreaterThan(mi.h);
  });

  it('every island sits on its creature; heads face the viewer (south), tails behind (north)', () => {
    const a = whaleAnatomy(generateWhaleGenome('w3'), 240, 320);
    const wf = renderWhale(a, 0, pal);
    const wi = box(wf.island.mask);
    for (let y = wi.y; y < wi.y + wi.h; y++) for (let x = wi.x; x < wi.x + wi.w; x++) if (wf.island.mask.get(x, y)) expect(wf.body.get(x, y)).toBe(true);
    expect(a.blowhole.y).toBeGreaterThan(wi.y + wi.h); // the spout is in front of the island
    expect(a.ySnout).toBeGreaterThan(a.yTail);
    expect(a.fluke.cy).toBeLessThan(a.yTail + 1);
    const m = mantaAnatomy(generateMantaGenome('m3'), 240, 320);
    const mf = renderManta(m, 0, pal);
    const mi = box(mf.island.mask);
    for (let y = mi.y; y < mi.y + mi.h; y++) for (let x = mi.x; x < mi.x + mi.w; x++) if (mf.island.mask.get(x, y)) expect(mf.body.get(x, y)).toBe(true);
    // The tail whip reaches north of the disc.
    const mb = box(mf.body);
    expect(mb.y).toBeLessThan(m.cy - m.C * 0.5);
  });
});

describe('movement and animation', () => {
  it('the body moves; the island stays exactly where it is', () => {
    const a = whaleAnatomy(generateWhaleGenome('w'), 240, 320);
    expect(whalePose(a, 0).fluke).not.toBeCloseTo(whalePose(a, 1.6).fluke, 2);
    const f0 = renderWhale(a, 0, pal);
    const f1 = renderWhale(a, 1.6, pal);
    expect(sig(f0.buffer.data)).not.toBe(sig(f1.buffer.data));
    expect(Array.from(f0.island.mask.data)).toEqual(Array.from(f1.island.mask.data));
    const m = mantaAnatomy(generateMantaGenome('m'), 240, 320);
    const m0 = renderManta(m, 0, pal);
    const m1 = renderManta(m, 0.9, pal);
    expect(Array.from(m0.body.data)).not.toEqual(Array.from(m1.body.data)); // the wings move
    expect(Array.from(m0.island.mask.data)).toEqual(Array.from(m1.island.mask.data));
  });
});

describe('growth geometry (designed, preview only)', () => {
  it('the whale lengthens toward the tail, its front edge fixed; the manta widens', () => {
    const w = islandGrowth('whale', 'w', 240, 320);
    for (let i = 1; i < 4; i++) {
      expect(w[i].ry).toBeGreaterThan(w[i - 1].ry);
      expect(w[i].cy + w[i].ry).toBeCloseTo(w[0].cy + w[0].ry, 5);
    }
    const m = islandGrowth('manta', 'm', 240, 320);
    for (let i = 1; i < 4; i++) expect(m[i].rx).toBeGreaterThan(m[i - 1].rx);
    expect(m[3].rx / m[0].rx).toBeGreaterThan(m[3].ry / m[0].ry);
  });
});

describe('species definitions and safety', () => {
  it('every species has its personality, movement, island, growth, sounds and lore; the turtle and the manta are playable, the whale a prototype', () => {
    for (const def of Object.values(SPECIES)) {
      for (const k of ['personality', 'movement', 'environment', 'island', 'growth'] as const) expect(def[k].length).toBeGreaterThan(10);
      expect(SFX[def.sounds.call]).toBeDefined();
      expect(SFX[def.sounds.ambient]).toBeDefined();
      expect(def.lore.length).toBeGreaterThan(0);
    }
    expect(SPECIES.turtle.status).toBe('playable');
    expect(SPECIES.whale.status).toBe('prototype');
    expect(SPECIES.manta.status).toBe('playable');
  });

  it('turtle worlds are untouched: world generation never imports the new species, identities are unchanged', () => {
    // No runtime import of the creature carriers from world generation (a type-only reference in types.ts is erased).
    for (const f of readdirSync('src/world')) expect(readFileSync(`src/world/${f}`, 'utf8')).not.toMatch(/from '\.\.\/carriers\//);
    expect(readFileSync('src/sim/live-world.ts', 'utf8')).not.toMatch(/from '\.\.\/carriers\//);
    expect(worldIdentity(generateTurtleWorld('turtle-0'))).toBe('seed=turtle-0|kind=turtle|turtle=turtle-0|variant=2|704x576|scale=1.6|palette=cozy|density=1|islands=1');
  });
});
