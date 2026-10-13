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
import { babyHeightFor, buildCanonicalSprite } from '../blobbi/canonical';
import type { PixelBlobbiIdentity } from '../blobbi/identity';
import { ITEMS } from './items';

/** How the tool is held: at rest, pulled back, or striking (sideways, down toward the viewer, up away). */
export type SwingOrientation = 'rest' | 'carry' | 'raised' | 'strike' | 'strike-down' | 'strike-up';
/** A rod held out over the water (M10): forward and up (side), down toward the viewer, up away from them. */
export type FishOrientation = 'fish' | 'fish-down' | 'fish-up';
export type ToolOrientation = SwingOrientation | FishOrientation;
/** The swing's phases, from the live world; a rod's cast (wound back with `raise`, then `cast`) and its hold. */
export type EquipmentAnimation = 'idle' | 'raise' | 'strike' | 'recover' | 'cast' | 'fishing';

export interface Attachment {
  sprite: Sprite;
  /** World offset of the sprite's anchor from the Blobbi's ground point. */
  dx: number;
  dy: number;
  /** Drawn behind the Blobbi (a hand on the far side) or in front. */
  behind: boolean;
  /** Whether to draw it at all: a tool in the far hand is occluded by the body while it hangs there. */
  visible: boolean;
  /** The kit arm part the tool is attached to (`right-arm`, `left-arm`, `near-arm`, `far-arm`). */
  arm: string;
  orientation: ToolOrientation;
  mirrored: boolean;
  /** A rod's tip (where the line leaves it), as an offset from the Blobbi's ground point like `dx`, `dy`. */
  tip: { dx: number; dy: number } | null;
}

/** The Blobbi's anatomical hands. Tools are held in one hand in every view; the kit names arms by screen side. */
export type Hand = 'left' | 'right';

/**
 * The kit arm part that is the given anatomical hand in a pose. From the front the Blobbi's left is the viewer's
 * right (`right-arm`); from the back it is the viewer's left (`left-arm`); facing screen-left it is the near
 * arm, facing screen-right the far one.
 */
export function armForHand(pose: BlobbiPose, hand: Hand): string {
  if (pose.view === 'front') return hand === 'left' ? 'right-arm' : 'left-arm';
  if (pose.view === 'back') return hand === 'left' ? 'left-arm' : 'right-arm';
  const near = (hand === 'left') === (pose.facing < 0);
  return near ? 'near-arm' : 'far-arm';
}

/**
 * Template characters: h/H/d handle mid/light/dark, s/S/k steel mid/light/dark, g the grip pixel (handle); a rod's
 * c cork, r/R reel (dark/light), t its tip (the top guide, where the line leaves it).
 */
type Template = readonly string[];
type Templates = Record<SwingOrientation, Template> & Partial<Record<FishOrientation, Template>>;

const AXE: Templates = {
  // Handle up, head on top, the cutting edge (k) outward (to the right; mirrored when needed).
  rest: ['..Ssk..', '.Ssssk.', '..hssk.', '..h....', '..H....', '..h....', '..g....'],
  // Carried over the shoulder (the side views' rest): head up and behind, away from the face, edge forward.
  carry: ['.Ssk...', 'Sssk...', '..h....', '...H...', '....h..', '.....g.'],
  // Pulled back for the swing: higher and further behind.
  raised: ['Ssk....', 'ssk....', '.h.....', '.h.....', '..H....', '..h....', '...g...'],
  // Sideways strike: the head forward, edge down into the trunk.
  strike: ['.....Ss', 'gHhhhss', '.....sk', '......k'],
  // Strike toward the viewer (front view): the head below the hand, edge down.
  'strike-down': ['..g..', '..h..', '..H..', '..h..', '.Ss..', '.ssS.', '.kkk.'],
  // Strike away from the viewer (back view): the head above, edge up.
  'strike-up': ['.kkk.', '.sSs.', '.Ss..', '..h..', '..H..', '..h..', '..g..'],
};

// The pickaxe: the same handle and grip conventions, a curved two-pointed steel head across the handle's end.
const PICKAXE: Templates = {
  rest: ['.sSSs.', 'k.h..k', '..h...', '..H...', '..h...', '..g...'],
  carry: ['....k..', '...S...', '..s....', '.s.h...', 'k...H..', '.....h.', '......g'],
  raised: ['.sSs...', 'k.h.k..', '..h....', '..H....', '...h...', '...g...'],
  strike: ['......k', '.....S.', 'gHhhhs.', '.....s.', '......k'],
  'strike-down': ['..g..', '..h..', '..H..', '..h..', '.sSs.', 'k...k'],
  'strike-up': ['k...k', '.sSs.', '..h..', '..H..', '..h..', '..g..'],
};

// The hoe: the same handle, a flat steel blade bent down at the end (its edge, k, cuts the soil).
const HOE: Templates = {
  rest: ['.hSsk', '.h..k', '.h...', '.H...', '.h...', '.g...'],
  carry: ['kSs....', 'k.h....', '...h...', '....H..', '.....h.', '......g'],
  raised: ['ksS....', 'k.h....', '..h....', '..H....', '...h...', '...g...'],
  strike: ['gHhhhS', '.....s', '.....k'],
  'strike-down': ['..g..', '..h..', '..H..', '..h..', '..h..', '.sSs.', '.kkk.'],
  'strike-up': ['.kkk.', '.sSs.', '..h..', '..H..', '..h..', '..g..'],
};

// The watering can: a steel can (s/S), its spout (k), held by the handle on top (g).
const CAN: Templates = {
  rest: ['..g..', '.sss.', 'sSSsk', 'sSSs.', 'ssss.'],
  carry: ['..g..', '.sss.', 'sSSsk', 'sSSs.', 'ssss.'],
  raised: ['..g..', '.sss.', 'sSSsk', 'sSSs.', 'ssss.'],
  strike: ['g.....', 'sss...', 'sSSsk.', 'ssss.k'],
  'strike-down': ['..g..', '.sss.', 'sSSs.', 'ssss.', '..k..'],
  'strike-up': ['..k..', 'ssss.', 'sSSs.', '.sss.', '..g..'],
};

// The fishing rod (M10): a cork grip in the hand, a little reel just above it, a long tapering blank, a pale tip.
// Every orientation has a `t`: the line is drawn from there. Unmirrored the rod points right (mirrored for left).
const ROD: Templates = {
  // Hanging at the side, tip up.
  rest: ['...t', '...h', '..h.', '..h.', '.H..', 'rc..', 'Rg..'],
  // Over the shoulder (side views), tip up and back, clear of the face.
  carry: ['t.....', '.h....', '..h...', '...H..', '....cr', '.....g'],
  // Wound back for the cast, tip high behind.
  raised: ['t.....', '.h....', '.h....', '..h...', '..H...', '...cr.', '...g..'],
  // The cast's swing, sideways, down toward the viewer, up away.
  strike: ['.r.......', 'gcHhhhhht'],
  'strike-down': ['g.', 'cr', 'H.', 'h.', 'h.', 'h.', 't.'],
  'strike-up': ['t.', 'h.', 'h.', 'h.', 'H.', 'cr', 'g.'],
  // Held out over the water: forward and up, then the line falls from the tip.
  fish: ['.........t', '.......hh.', '.....Hh...', '...cH.....', '.rc.......', '.Rg.......'],
  // Facing the viewer: down and a little out.
  'fish-down': ['g.....', 'cr....', '.cR...', '..H...', '..h...', '...h..', '...h..', '....h.', '....t.'],
  // Facing away: up from the hand and in over the head (drawn mirrored for the hand on the left, so it leans in),
  // mostly hidden by the body, its tip showing above the head.
  'fish-up': ['t........', 't........', '.h.......', '.h.......', '.h.......', '..h......', '..h......', '..h......', '...h.....', '...H.....', '...H.....', '....H....', '....H....', '.....cR..', '.....cr..', '......g..'],
};

export interface EquipmentVisual {
  item: string;
  templates: Templates;
  /** The anatomical hand that holds it, in every view. */
  hand: Hand;
  /** The metal of its head (steel unless set: copper tools). */
  metal?: Ramp;
}

export const COPPER: Ramp = ramp(hex('#d8843a'), { step: 0.1, hueShift: 8 });

export const EQUIPMENT: Record<string, EquipmentVisual> = {
  [ITEMS.axe.id]: { item: ITEMS.axe.id, templates: AXE, hand: 'left' },
  [ITEMS.pickaxe.id]: { item: ITEMS.pickaxe.id, templates: PICKAXE, hand: 'left' },
  [ITEMS.hoe.id]: { item: ITEMS.hoe.id, templates: HOE, hand: 'left' },
  [ITEMS.wateringCan.id]: { item: ITEMS.wateringCan.id, templates: CAN, hand: 'left' },
  'blobbi-pixel:tool:copper-axe': { item: 'blobbi-pixel:tool:copper-axe', templates: AXE, hand: 'left', metal: COPPER },
  'blobbi-pixel:tool:copper-pickaxe': { item: 'blobbi-pixel:tool:copper-pickaxe', templates: PICKAXE, hand: 'left', metal: COPPER },
  'blobbi-pixel:tool:copper-hoe': { item: 'blobbi-pixel:tool:copper-hoe', templates: HOE, hand: 'left', metal: COPPER },
  'blobbi-pixel:tool:copper-can': { item: 'blobbi-pixel:tool:copper-can', templates: CAN, hand: 'left', metal: COPPER },
  'blobbi-pixel:tool:fishing-rod': { item: 'blobbi-pixel:tool:fishing-rod', templates: ROD, hand: 'left', metal: ramp(hex('#e8ecf4'), { step: 0.06 }) },
};

export const STEEL: Ramp = ramp(hex('#aeb7c2'), { step: 0.1, hueShift: 4 });
/** A rod's cork grip and its pale tip guide. */
const CORK = hex('#c99a62');
const ROD_TIP = hex('#f4efe4');

export interface ToolSprite extends Sprite {
  /** The grip pixel inside the buffer. */
  gripX: number;
  gripY: number;
  /** A rod's tip pixel inside the buffer (the centre of its block when scaled), or null. */
  tipX: number | null;
  tipY: number | null;
}

const toolCache = new Map<string, ToolSprite>();

/** The tool's sprite for an orientation, in the world's wood colours, mirrored and scaled as asked. */
export function toolSprite(item: string, orientation: ToolOrientation, palette: WorldPalette, mirrored = false, scale = 1): ToolSprite {
  const key = `${palette.name}|${item}|${orientation}|${mirrored ? 'm' : ''}|${scale}`;
  const hit = toolCache.get(key);
  if (hit) return hit;
  const visual = EQUIPMENT[item];
  if (!visual) throw new Error(`no equipment visual for ${item}`);
  // A tool without fishing orientations holds them as its strike (nothing else ever asks it to).
  const template = visual.templates[orientation] ?? visual.templates.strike;
  const rows = template.map((r) => (mirrored ? [...r].reverse().join('') : r));
  const w = rows[0].length;
  const h = rows.length;
  const buf = new PixelBuffer(w + 2, h + 2);
  const metal = visual.metal ?? STEEL;
  const colours: Record<string, Color> = { h: palette.wood.mid, H: palette.wood.light, d: palette.wood.dark, g: palette.wood.dark, s: metal.mid, S: metal.light, k: metal.dark, c: CORK, r: STEEL.dark, R: STEEL.light, t: ROD_TIP };
  let gripX = 1;
  let gripY = h;
  let tipX: number | null = null;
  let tipY: number | null = null;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      buf.set(x + 1, y + 1, colours[ch]);
      if (ch === 'g') {
        gripX = x + 1;
        gripY = y + 1;
      }
      if (ch === 't') {
        tipX = x + 1;
        tipY = y + 1;
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
        if (c === metal.mid || c === metal.light || c === metal.dark || c === STEEL.dark || c === STEEL.light) steel = true;
      }
      buf.set(x, y, steel ? metal.outline : palette.wood.outline);
    }
  let sprite: ToolSprite = { buffer: buf, anchorX: gripX, anchorY: gripY, footRx: 0, footRy: 0, gripX, gripY, tipX, tipY };
  const half = Math.floor(scale / 2);
  if (scale > 1) sprite = { ...sprite, buffer: buf.scaled(scale), anchorX: gripX * scale, anchorY: gripY * scale, gripX: gripX * scale, gripY: gripY * scale, tipX: tipX === null ? null : tipX * scale + half, tipY: tipY === null ? null : tipY * scale + half };
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
  /**
   * M11D.1, a baby seen from the side: how far (sprite pixels, signed) the invisible hand moves forward to the body's
   * front edge for a strike, a cast or a held rod. Absent for adults (their hand is on the kit's arm).
   */
  forward?: number;
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
    if (this.identity.stage === 'baby') {
      const point = babyHand(pose, arm, full);
      this.hands.set(key, point);
      return point;
    }
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

/**
 * M11D.1, THE BABY'S INVISIBLE HANDS. The kit's baby has no arms (`procedural/plan/baby.ts`), and none is drawn
 * here. A tool is held against the side of the droplet body as though by an arm nobody sees: the grip sits one
 * pixel outside the silhouette at the body's widest height (its lower middle), on the side the adult's hand would
 * be; seen from the side, the near hand holds it against the front half of the body, the far hand behind it. It is
 * measured on the very sprite drawn, so the tool rides every hop frame with the body.
 */
export function babyHand(pose: BlobbiPose, arm: string, full: Sprite): HandPoint {
  const buf = full.buffer;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < buf.height; y++)
    for (let x = 0; x < buf.width; x++)
      if (buf.get(x, y) >>> 24) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
  const behind = pose.view === 'back';
  if (top < 0) return { dx: 0, dy: -4, behind, guessed: true };
  // The widest row of the droplet's lower half (ties: the lower one), where an arm would hang.
  const span = (y: number): [number, number] => {
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < buf.width; x++)
      if (buf.get(x, y) >>> 24) {
        if (x0 < 0) x0 = x;
        x1 = x;
      }
    return [x0, x1];
  };
  const mid = Math.round(top + (bottom - top) * 0.45);
  let row = mid;
  let widest = -1;
  for (let y = mid; y <= Math.round(top + (bottom - top) * 0.8); y++) {
    const [x0, x1] = span(y);
    if (x1 - x0 >= widest) {
      widest = x1 - x0;
      row = y;
    }
  }
  const [x0, x1] = span(row);
  if (pose.view === 'side') {
    // Seen from the side the tool hangs just behind the body's back edge (never across the face, the M2.3 lesson),
    // and the swing carries the hand to the front edge (`forward`), so the blow lands ahead of the baby.
    const back = pose.facing > 0 ? x0 - 1 : x1 + 1;
    const front = pose.facing > 0 ? x1 + 1 : x0 - 1;
    return { dx: back - full.anchorX, dy: row - full.anchorY, behind, guessed: false, forward: front - back };
  }
  const x = arm === 'right-arm' ? x1 + 1 : x0 - 1;
  return { dx: x - full.anchorX, dy: row - full.anchorY, behind, guessed: false };
}

/**
 * Where the tool goes for a pose and animation state: the arm that is the holding hand in this view, the hand on
 * it, orientation, mirroring, layer, offset and visibility. The tool never changes hands: facing screen-right the
 * holding (left) hand is the far one, so the tool sits behind the body, hidden while it hangs there and showing
 * only where a swing carries it past the silhouette.
 */
export function attachTool(item: string, pose: BlobbiPose, animation: EquipmentAnimation, rig: EquipmentRig, spriteOf: (pose: BlobbiPose) => Sprite, palette: WorldPalette): Attachment {
  const visual = EQUIPMENT[item];
  const arm = armForHand(pose, visual.hand);
  const baby = rig.identity.stage === 'baby';
  const hand = rig.hand(pose, arm, spriteOf);
  // A baby's tool is sized to the baby (about two thirds of its adult self's), so it never swamps the little body.
  const scale = Math.max(1, Math.round((baby ? babyHeightFor(rig.size) : rig.size) / 16));
  const farSide = arm === 'far-arm';
  // The edge faces away from the body (front and back views) or forward (side views).
  const outward = pose.view === 'side' ? pose.facing : hand.dx < 0 ? -1 : 1;
  const mirrored = outward < 0;
  // At rest the axe hangs at the side (front and back) or rides on the shoulder (side views, clear of the face).
  // A baby has no shoulder to rest it on: from the side it hangs at the back edge too (M11D.1).
  let orientation: ToolOrientation = pose.view === 'side' && !baby ? 'carry' : 'rest';
  let behind = hand.behind || farSide;
  if (animation === 'raise') orientation = 'raised';
  else if (animation === 'strike' || animation === 'cast') orientation = pose.view === 'front' ? 'strike-down' : pose.view === 'back' ? 'strike-up' : 'strike';
  else if (animation === 'fishing') orientation = pose.view === 'front' ? 'fish-down' : pose.view === 'back' ? 'fish-up' : 'fish';
  // Striking or raising from the back view brings the axe above the head, in front of the body. A rod held out
  // while facing away stays beyond the body (behind it), its tip showing above the head.
  if (pose.view === 'back' && (animation === 'raise' || animation === 'strike' || animation === 'cast')) behind = false;
  // In the far hand the tool is occluded by the body: not drawn while it hangs or walks there; during a swing it
  // is drawn behind the body, so only what the swing carries past the silhouette shows.
  const visible = !farSide || animation !== 'idle';
  const sprite = toolSprite(item, orientation, palette, mirrored, scale);
  // The baby's invisible hand swings to the body's front edge for the blow, the cast and the held rod.
  const dx = hand.dx + (hand.forward !== undefined && (animation === 'strike' || animation === 'cast' || animation === 'fishing') ? hand.forward : 0);
  const tip = sprite.tipX === null || sprite.tipY === null ? null : { dx: dx + sprite.tipX - sprite.anchorX, dy: hand.dy + sprite.tipY - sprite.anchorY };
  return { sprite, dx, dy: hand.dy, behind, visible, arm, orientation, mirrored, tip };
}
