/**
 * THE PIXEL BLOBBI. `buildBlobbiSprite` is the one renderer every part of
 * the lab uses (the world, the gallery, the comparison lab, the tests): the
 * kit's canonical V3 drawing rasterized with pixel-art rules (`canonical.ts`).
 * The lab's own earlier geometry survives as `native-sprite.ts`, for
 * comparison only.
 */
import type { Sprite } from '../core/pixel';
import type { PixelBlobbiIdentity } from './identity';
import { buildCanonicalSprite, type CanonicalOptions } from './canonical';
import type { BlobbiPose } from './pose';

export { EXPRESSIONS, REST_POSE, poseKey, type BlobbiPose, type Expression, type Facing, type View } from './pose';
export { buildNativeSprite } from './native-sprite';

export type SpriteStrategy = 'canonical' | 'native';

export function buildBlobbiSprite(id: PixelBlobbiIdentity, pose: BlobbiPose, size: number, options: CanonicalOptions = {}): Sprite {
  return buildCanonicalSprite(id.genome, pose, size, options);
}
