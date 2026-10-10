import { describe, expect, it } from 'vitest';
import { generateGenome } from '@blobbi-kit/renderer/procedural';
import { canvasFor, downsampleMode2x, labSprite, scoreAgainst, SCALE_STRATEGIES } from '../src/blobbi/scale-lab';
import { buildBlobbiSprite, REST_POSE } from '../src/blobbi/sprite';
import { blobbiIdentity } from '../src/blobbi/identity';
import { PixelBuffer } from '../src/core/pixel';
import { rgba } from '../src/core/color';

describe('the 32 px scale lab (isolated from gameplay)', () => {
  it('puts every strategy on the gameplay canvas and anchor, deterministically; "direct" is the gameplay sprite', () => {
    const genome = generateGenome('blobbi-9');
    const c = canvasFor(32);
    const game = buildBlobbiSprite(blobbiIdentity('blobbi-9'), REST_POSE, 32);
    for (const s of SCALE_STRATEGIES) {
      const a = labSprite(s.id, genome, REST_POSE, 32);
      const b = labSprite(s.id, genome, REST_POSE, 32);
      expect([a.buffer.width, a.buffer.height]).toEqual([c.width, c.height]);
      expect([a.anchorX, a.anchorY]).toEqual([game.anchorX, game.anchorY]);
      expect(a.buffer.data).toEqual(b.buffer.data);
      expect(a.buffer.opaqueCount()).toBeGreaterThan(300);
    }
    expect(labSprite('direct', genome, REST_POSE, 32).buffer.data).toEqual(game.buffer.data);
  });

  it('reduces 2x by majority colour and scores identical images perfectly', () => {
    const src = new PixelBuffer(4, 2);
    const a = rgba(200, 10, 10);
    const b = rgba(10, 10, 200);
    src.set(0, 0, a);
    src.set(1, 0, a);
    src.set(0, 1, b);
    src.set(2, 0, b);
    const out = downsampleMode2x(src, 2, 1);
    expect(out.get(0, 0)).toBe(a);
    expect(out.get(1, 0) >>> 24).toBe(0); // one opaque pixel of four: transparent
    const genome = generateGenome('blobbi-1');
    const s = labSprite('direct', genome, REST_POSE, 32).buffer;
    expect(scoreAgainst(s, s)).toMatchObject({ silhouetteIoU: 1, colourError: 0, inkIoU: 1 });
  });
});
