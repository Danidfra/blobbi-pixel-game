/**
 * THE EQUIPMENT LAYER. Tools the Blobbi visibly holds. The Blobbi itself is the canonical sprite, untouched;
 * a tool is a separate small sprite attached to a hand. The hand is found from the canonical drawing itself:
 * the sprite is rasterized once more without its arm, and the pixels that disappear are the arm; the arm
 * pixel farthest from the body's centre is the hand. That follows the kit's own arm swing through the walk
 * cycle and every view, so the tool never floats or slides.
 *
 *   tool id ─► EquipmentVisual (orientation templates, grip, icon) ─► attachment for (view, facing, animation
 *   state) ─► one drawable before or after the Blobbi.
 */
import { hex, type Color } from '../core/color';
import { ramp, type Ramp, type WorldPalette } from '../core/palette';
import { PixelBuffer, type Sprite } from '../core/pixel';
import { poseKey, type BlobbiPose } from '../blobbi/sprite';
import { buildCanonicalSprite } from '../blobbi/canonical';
import type { PixelBlobbiIdentity } from '../blobbi/identity';
import { ITEMS } from './items';

/** How the tool is held: at rest, pulled back, or striking (sideways, down toward the viewer, up away). */
export type ToolOrientation = 'rest' | 'lowered' | 'raised' | 'strike' | 'strike-down' | 'strike-up';
/** The swing's phases, from the live world. */
export type EquipmentAnimation = 'idle' | 'raise' | 'strike' | 'recover';

export interface Attachment {
  sprite: Sprite;
  /** World offset of the sprite's anchor from the Blobbi's ground point. */
  dx: number;
  dy: number;
  /** Drawn behind the Blobbi (a hand on the far side) or in front. */
  behind: boolean;
  orientation: ToolOrientation;
  mirrored: boolean;
}

/** Template characters: h/H/d handle mid/light/dark, s/S/k steel mid/light/dark, g the grip pixel (handle). */
type Template = readonly string[];

const AXE: Record<ToolOrientation, Template> = {
  // Handle up, head on top, the cutting edge (k) outward (to the right; mirrored when needed).
  rest: ['..Ssk..', '.Ssssk.', '..hssk.', '..h....', '..H....', '..h....', '..g....'],
  // Held low at the side (the side views' rest): the head hangs below the near hand, edge forward. Compact, so it
  // reads as one tool in one hand and never crosses the body to the far arm or the face.
  lowered: ['..g....', '..h....', '..H....', '..hssk.', '.Ssssk.', '..Ssk..'],
  // Pulled back for the swing: higher and further behind.
  raised: ['Ssk....', 'ssk....', '.h.....', '.h.....', '..H....', '..h....', '...g...'],
  // Sideways strike: the head forward, edge down into the trunk.
  strike: ['.....Ss', 'gHhhhss', '.....sk', '......k'],
  // Strike toward the viewer (front view): the head below the hand, edge down.
  'strike-down': ['..g..', '..h..', '..H..', '..h..', '.Ss..', '.ssS.', '.kkk.'],
  // Strike away from the viewer (back view): the head above, edge up.
  'strike-up': ['.kkk.', '.sSs.', '.Ss..', '..h..', '..H..', '..h..', '..g..'],
};

export interface EquipmentVisual {
  item: string;
  templates: Record<ToolOrientation, Template>;
  /** Which hand holds it, per view: the `data-part` of the arm. */
  arm: { front: string; back: string; side: string };
}

export const EQUIPMENT: Record<string, EquipmentVisual> = {
  [ITEMS.axe.id]: { item: ITEMS.axe.id, templates: AXE, arm: { front: 'right-arm', back: 'right-arm', side: 'near-arm' } },
};

export const STEEL: Ramp = ramp(hex('#aeb7c2'), { step: 0.1, hueShift: 4 });

export interface ToolSprite extends Sprite {
  /** The grip pixel inside the buffer. */
  gripX: number;
  gripY: number;
}

const toolCache = new Map<string, ToolSprite>();

/** The tool's sprite for an orientation, in the world's wood colours, mirrored and scaled as asked. */
export function toolSprite(item: string, orientation: ToolOrientation, palette: WorldPalette, mirrored = false, scale = 1): ToolSprite {
  const key = `${palette.name}|${item}|${orientation}|${mirrored ? 'm' : ''}|${scale}`;
  const hit = toolCache.get(key);
  if (hit) return hit;
  const visual = EQUIPMENT[item];
  if (!visual) throw new Error(`no equipment visual for ${item}`);
  const rows = visual.templates[orientation].map((r) => (mirrored ? [...r].reverse().join('') : r));
  const w = rows[0].length;
  const h = rows.length;
  const buf = new PixelBuffer(w + 2, h + 2);
  const colours: Record<string, Color> = { h: palette.wood.mid, H: palette.wood.light, d: palette.wood.dark, g: palette.wood.dark, s: STEEL.mid, S: STEEL.light, k: STEEL.dark };
  let gripX = 1;
  let gripY = h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      buf.set(x + 1, y + 1, colours[ch]);
      if (ch === 'g') {
        gripX = x + 1;
        gripY = y + 1;
      }
    }
  const mask = buf.opaqueMask();
  const grown = mask.dilate();
  for (let y = 0; y < buf.height; y++)
    for (let x = 0; x < buf.width; x++) {
      if (!grown.get(x, y) || mask.get(x, y)) continue;
      // Outline in the wood's outline beside the handle, the steel's beside the head.
      let steel = false;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = buf.get(x + ox, y + oy);
        if (c === STEEL.mid || c === STEEL.light || c === STEEL.dark) steel = true;
      }
      buf.set(x, y, steel ? STEEL.outline : palette.wood.outline);
    }
  let sprite: ToolSprite = { buffer: buf, anchorX: gripX, anchorY: gripY, footRx: 0, footRy: 0, gripX, gripY };
  if (scale > 1) sprite = { ...sprite, buffer: buf.scaled(scale), anchorX: gripX * scale, anchorY: gripY * scale, gripX: gripX * scale, gripY: gripY * scale };
  toolCache.set(key, sprite);
  return sprite;
}

/** The inventory icon of a tool: its resting sprite. */
export function toolIcon(item: string, palette: WorldPalette, scale = 1): ToolSprite {
  return toolSprite(item, 'rest', palette, false, scale);
}

export interface HandPoint {
  /** Offset from the Blobbi sprite's anchor (ground point), in sprite pixels. */
  dx: number;
  dy: number;
  /** Whether the arm lies behind the body in this pose (drawn under it by the kit). */
  behind: boolean;
  /** Fallback used when the arm has no visible pixels. */
  guessed: boolean;
}

/**
 * Finds hands on the canonical sprite: for a pose, the arm's pixels are those that vanish when the sprite is
 * drawn without that arm; the one farthest from the body's centre is the hand. Cached per pose.
 */
export class EquipmentRig {
  private readonly hands = new Map<string, HandPoint>();
  constructor(
    readonly identity: PixelBlobbiIdentity,
    readonly size: number,
  ) {}

  hand(pose: BlobbiPose, arm: string, spriteOf: (pose: BlobbiPose) => Sprite): HandPoint {
    const key = `${poseKey(pose)}|${arm}`;
    const hit = this.hands.get(key);
    if (hit) return hit;
    const full = spriteOf(pose);
    // The arm alone: the canonical drawing with every other part left out (so a hand hidden behind the body in
    // the back view is still found), without the outline.
    const names = new Set([...buildCanonicalSprite(this.identity.genome, pose, this.size).svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]));
    names.delete('character');
    names.delete(arm);
    const skip = [...names].filter((n) => !arm.startsWith(n));
    const armOnly = buildCanonicalSprite(this.identity.genome, pose, this.size, { skipParts: skip, outline: false });
    const cx = full.anchorX;
    const cy = full.anchorY - this.size * 0.5;
    let best: { x: number; y: number; d: number } | null = null;
    let count = 0;
    for (let y = 0; y < armOnly.buffer.height; y++)
      for (let x = 0; x < armOnly.buffer.width; x++) {
        if (!(armOnly.buffer.get(x, y) >>> 24)) continue;
        count++;
        // Prefer the far end of the arm: distance from the body's centre, weighted down a little (hands hang).
        const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 0.9) + (y + 0.5 - cy) * 0.05;
        if (!best || d > best.d) best = { x, y, d };
      }
    const behind = pose.view === 'back';
    const point: HandPoint = best && count >= 2 ? { dx: best.x - full.anchorX, dy: best.y - full.anchorY, behind, guessed: false } : { dx: (pose.view === 'side' ? pose.facing : pose.view === 'back' ? 1 : -1) * Math.round(full.footRx * 1.1), dy: -Math.round(this.size * 0.42), behind, guessed: true };
    this.hands.set(key, point);
    return point;
  }
}

/** Where the tool goes for a pose and animation state: orientation, mirroring, layer and offset. */
export function attachTool(item: string, pose: BlobbiPose, animation: EquipmentAnimation, rig: EquipmentRig, spriteOf: (pose: BlobbiPose) => Sprite, palette: WorldPalette): Attachment {
  const visual = EQUIPMENT[item];
  const arm = pose.view === 'front' ? visual.arm.front : pose.view === 'back' ? visual.arm.back : visual.arm.side;
  const hand = rig.hand(pose, arm, spriteOf);
  const scale = Math.max(1, Math.round(rig.size / 16));
  // The edge faces away from the body (front and back views) or forward (side views).
  const outward = pose.view === 'side' ? pose.facing : hand.dx < 0 ? -1 : 1;
  const mirrored = outward < 0;
  // At rest the axe hangs head-up at the side (front and back) or head-down from the near hand (side views).
  let orientation: ToolOrientation = pose.view === 'side' ? 'lowered' : 'rest';
  let behind = hand.behind;
  if (animation === 'raise') orientation = 'raised';
  else if (animation === 'strike') orientation = pose.view === 'front' ? 'strike-down' : pose.view === 'back' ? 'strike-up' : 'strike';
  // Striking or raising from the back view brings the axe above the head, in front of the body.
  if (pose.view === 'back' && (animation === 'raise' || animation === 'strike')) behind = false;
  const sprite = toolSprite(item, orientation, palette, mirrored, scale);
  return { sprite, dx: hand.dx, dy: hand.dy, behind, orientation, mirrored };
}
