/**
 * A POSE is everything about a Blobbi that changes from frame to frame:
 * which way it faces, breathing, lids, expression, walk phase and gaze.
 * Sprites are pure functions of (identity, pose, size), so an animation is a
 * sequence of pose keys and a cache.
 */
export type View = 'front' | 'back' | 'side';
export type Facing = -1 | 1;
export type Expression = 'neutral' | 'happy' | 'excited' | 'sad' | 'surprised' | 'sleepy';
export const EXPRESSIONS: readonly Expression[] = ['neutral', 'happy', 'excited', 'sad', 'surprised', 'sleepy'];

export interface BlobbiPose {
  view: View;
  /** For the side view: 1 faces the viewer's right, -1 the left. */
  facing: Facing;
  /** Breathing: 0 rest, 1 inhaled. */
  breath: 0 | 1;
  /** Eyelids: 0 open, 1 half, 2 closed. */
  lid: 0 | 1 | 2;
  expression: Expression;
  /** Walk cycle phase 0..5 (see `WALK_FRAMES`); -1 standing. */
  walk: -1 | 0 | 1 | 2 | 3 | 4 | 5;
  /** Where the eyes look, each -1, 0 or 1. */
  gazeX: -1 | 0 | 1;
  gazeY: -1 | 0 | 1;
}

export const REST_POSE: BlobbiPose = { view: 'front', facing: 1, breath: 0, lid: 0, expression: 'neutral', walk: -1, gazeX: 0, gazeY: 0 };

export function poseKey(p: BlobbiPose): string {
  return `${p.view}${p.facing}${p.breath}${p.lid}${p.expression}${p.walk}${p.gazeX}${p.gazeY}`;
}
