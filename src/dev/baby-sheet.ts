/**
 * M11D.1, THE BABY COMPARISON SHEETS (development only). Pure pictures, built from the same sprite builders the
 * game uses, for the owner to judge the pixel Babies side by side with their adult selves:
 *
 *   generations  V3 Babies (several canonical addresses: colours, patterns, marks) beside their adult; the V1 baby in
 *                a few colourings; the V2 baby (the kit draws the V1 art); every view, a happy face, asleep
 *   movement     the hop: the six walk frames from the side and the front, and the V1 baby's lift
 *   tools        every tool held by "invisible arms", each view, idle / raised / strike (and the rod held out)
 *   scales       one Baby at every native size the camera uses (12, 24, 48, 72 px adult equivalents)
 *
 * Used by `scripts/m11d1-baby-sheet.ts` (PNG files at several pixel scales) and by the dev-only `baby-lab.html`.
 * Nothing here is imported by the game.
 */
import { deriveBlobbiV3Seed, getCanonicalBlobbiD } from '@blobbi-kit/core';
import { PixelBuffer, type Sprite } from '../core/pixel';
import { hex, type Color } from '../core/color';
import { stagedIdentity } from '../blobbi/identity';
import { buildBlobbiSprite, REST_POSE, type BlobbiPose } from '../blobbi/sprite';
import { buildV1BabySprite, type V1Colors } from '../blobbi/v1-baby';
import { attachTool, EquipmentRig, type EquipmentAnimation } from '../game/equipment';
import { ITEMS } from '../game/items';
import { paletteFor } from '../world/generate';
import { drawTinyText } from '../render/live-render';

const BG = hex('#5d9b4a');
const INK = hex('#f4efe4');
const DARK = hex('#1b1f2a');
const LABEL = 8;

/** A fixed test owner: the Babies below are real canonical V3 addresses (pubkey, d), drawn from the kit's seed. */
const OWNER = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
/** Pet ids picked for variety (stripes, spots, a plain body, horns, a mark, different hues). */
export const SAMPLE_PETS = ['0000000004', '00000000a1', '000000003c', '0000000057', '00000000e2', '0000000019'];

export function sampleV3Seed(pet: string): string {
  return deriveBlobbiV3Seed(OWNER, getCanonicalBlobbiD(OWNER, pet));
}

export const V1_SAMPLES: { label: string; colors: V1Colors; generation: 'v1' | 'v2' }[] = [
  { label: 'V1 SUNSET', colors: { base: '#ff9900', secondary: '#3355ff', eye: '#222222' }, generation: 'v1' },
  { label: 'V1 SKY', colors: { base: '#7ad3ff', secondary: '#ffffff', eye: '#3b2a5a' }, generation: 'v1' },
  { label: 'V2 ROSE', colors: { base: '#e85d9a', secondary: '#ffd1e6', eye: '#401020' }, generation: 'v2' },
];

const VIEWS: { name: string; pose: Partial<BlobbiPose> }[] = [
  { name: 'FRONT', pose: { view: 'front' } },
  { name: 'LEFT', pose: { view: 'side', facing: -1 } },
  { name: 'RIGHT', pose: { view: 'side', facing: 1 } },
  { name: 'BACK', pose: { view: 'back' } },
];

interface Row {
  label: string;
  cells: PixelBuffer[];
}

function cellOf(w: number, h: number): PixelBuffer {
  const c = new PixelBuffer(w, h);
  c.fill(BG);
  return c;
}

/** A sprite standing in a cell, its ground point a few pixels above the cell's bottom (and marked with a shadow). */
function stand(sprite: Sprite, w: number, h: number, extra?: (c: PixelBuffer, gx: number, gy: number) => void): PixelBuffer {
  const c = cellOf(w, h);
  const gx = Math.floor(w / 2);
  const gy = h - 4;
  const shadow = hex('#3f7434');
  for (let x = -sprite.footRx; x <= sprite.footRx; x++) c.set(gx + x, gy + 1, shadow);
  c.blit(sprite.buffer, gx - sprite.anchorX, gy - sprite.anchorY);
  extra?.(c, gx, gy);
  return c;
}

function compose(title: string, rows: Row[]): PixelBuffer {
  const w = Math.max(...rows.map((r) => r.cells.reduce((a, c) => a + c.width + 2, 2)), 200);
  const h = LABEL + 2 + rows.reduce((a, r) => a + LABEL + Math.max(...r.cells.map((c) => c.height)) + 4, 0);
  const out = new PixelBuffer(w, h);
  out.fill(DARK);
  drawTinyText(out, title, 2, 2, INK);
  let y = LABEL + 2;
  for (const r of rows) {
    drawTinyText(out, r.label, 2, y + 1, INK);
    y += LABEL;
    let x = 2;
    for (const c of r.cells) {
      out.blit(c, x, y);
      x += c.width + 2;
    }
    y += Math.max(...r.cells.map((c) => c.height)) + 4;
  }
  return out;
}

/** Generations: every V3 sample beside its adult, the V1 and V2 babies. `size` is the adult's native height. */
export function generationsSheet(size = 24): PixelBuffer {
  const w = Math.round(size * 1.6) + 6;
  const h = Math.round(size * 1.5) + 8;
  const rows: Row[] = [];
  for (const pet of SAMPLE_PETS) {
    const seed = sampleV3Seed(pet);
    const adult = stagedIdentity(seed, 'adult');
    const baby = stagedIdentity(seed, 'baby');
    const cells = [stand(buildBlobbiSprite(adult, REST_POSE, size), w, h)];
    for (const v of VIEWS) cells.push(stand(buildBlobbiSprite(baby, { ...REST_POSE, ...v.pose }, size), w, h));
    cells.push(stand(buildBlobbiSprite(baby, { ...REST_POSE, expression: 'happy' }, size), w, h));
    cells.push(stand(buildBlobbiSprite(baby, { ...REST_POSE, expression: 'sad' }, size), w, h));
    cells.push(stand(buildBlobbiSprite(baby, { ...REST_POSE, lid: 2, expression: 'sleepy' }, size), w, h));
    rows.push({ label: `V3 ${pet}: ADULT; BABY FRONT LEFT RIGHT BACK HAPPY SAD ASLEEP`, cells });
  }
  for (const s of V1_SAMPLES) {
    const cells = [cellOf(w, h)];
    drawTinyText(cells[0], 'NO', 2, 4, INK);
    drawTinyText(cells[0], 'V3', 2, 10, INK);
    for (const v of VIEWS) cells.push(stand(buildV1BabySprite(s.colors, { ...REST_POSE, ...v.pose }, size, s.generation), w, h));
    cells.push(stand(buildV1BabySprite(s.colors, { ...REST_POSE, lid: 2 }, size, s.generation), w, h));
    rows.push({ label: `${s.label}${s.generation === 'v2' ? ' (KIT DRAWS THE V1 BABY)' : ''}: FRONT; SIDES = FRONT ART; BACK; ASLEEP`, cells });
  }
  return compose(`BABY GENERATIONS AT ${size} PX (ADULT HEIGHT)`, rows);
}

/** The hop: walk frames 0-5, side and front, for two V3 Babies and a V1 baby. */
export function movementSheet(size = 24): PixelBuffer {
  const w = Math.round(size * 1.3) + 6;
  const h = Math.round(size * 1.2) + 8;
  const rows: Row[] = [];
  for (const pet of SAMPLE_PETS.slice(0, 2)) {
    const baby = stagedIdentity(sampleV3Seed(pet), 'baby');
    for (const v of [VIEWS[2], VIEWS[0], VIEWS[3]]) {
      const cells: PixelBuffer[] = [stand(buildBlobbiSprite(baby, { ...REST_POSE, ...v.pose }, size), w, h)];
      for (let f = 0; f < 6; f++) cells.push(stand(buildBlobbiSprite(baby, { ...REST_POSE, ...v.pose, walk: f as BlobbiPose['walk'] }, size), w, h));
      rows.push({ label: `V3 ${pet} ${v.name}: STANDING, HOP FRAMES 0-5`, cells });
    }
  }
  const s = V1_SAMPLES[0];
  const cells: PixelBuffer[] = [stand(buildV1BabySprite(s.colors, REST_POSE, size), w, h)];
  for (let f = 0; f < 6; f++) cells.push(stand(buildV1BabySprite(s.colors, { ...REST_POSE, walk: f as BlobbiPose['walk'] }, size), w, h));
  rows.push({ label: 'V1 FRONT: STANDING, HOP FRAMES 0-5 (A WHOLE-PIXEL LIFT; THE ART HAS NO RIG)', cells });
  return compose(`BABY MOVEMENT AT ${size} PX`, rows);
}

export const SHEET_TOOLS: { name: string; item: string }[] = [
  { name: 'AXE', item: ITEMS.axe.id },
  { name: 'PICKAXE', item: ITEMS.pickaxe.id },
  { name: 'HOE', item: ITEMS.hoe.id },
  { name: 'CAN', item: ITEMS.wateringCan.id },
  { name: 'ROD', item: 'blobbi-pixel:tool:fishing-rod' },
];

/** A Baby (or adult) holding a tool, as the game layers it: behind or in front, hidden in the far hand at rest. */
export function holding(seed: string, stage: 'adult' | 'baby', item: string, pose: BlobbiPose, animation: EquipmentAnimation, size: number, w: number, h: number): PixelBuffer {
  const identity = stagedIdentity(seed, stage);
  const spriteOf = (p: BlobbiPose) => buildBlobbiSprite(identity, p, size);
  const rig = new EquipmentRig(identity, size);
  const palette = paletteFor('cozy');
  const at = attachTool(item, pose, animation, rig, spriteOf, palette);
  const sprite = spriteOf(pose);
  const c = cellOf(w, h);
  const gx = Math.floor(w / 2);
  const gy = h - 4;
  const drawTool = () => at.visible && c.blit(at.sprite.buffer, gx + at.dx - at.sprite.anchorX, gy + at.dy - at.sprite.anchorY);
  if (at.behind) drawTool();
  c.blit(sprite.buffer, gx - sprite.anchorX, gy - sprite.anchorY);
  if (!at.behind) drawTool();
  if (at.tip && animation === 'fishing') c.set(gx + at.tip.dx, gy + at.tip.dy, hex('#ff3b5c'));
  return c;
}

/** Tools: each tool, each view; idle, walking, raised, strike, and the rod held out over the water. */
export function toolsSheet(size = 24, pet = SAMPLE_PETS[0]): PixelBuffer {
  const seed = sampleV3Seed(pet);
  const w = Math.round(size * 1.9) + 8;
  const h = Math.round(size * 1.7) + 8;
  const rows: Row[] = [];
  for (const tool of SHEET_TOOLS) {
    const cells: PixelBuffer[] = [];
    const anims: EquipmentAnimation[] = tool.name === 'ROD' ? ['idle', 'raise', 'cast', 'fishing'] : ['idle', 'raise', 'strike'];
    for (const v of VIEWS) {
      for (const a of anims) cells.push(holding(seed, 'baby', tool.item, { ...REST_POSE, ...v.pose }, a, size, w, h));
      cells.push(holding(seed, 'baby', tool.item, { ...REST_POSE, ...v.pose, walk: 1 }, 'idle', size, w, h));
    }
    rows.push({ label: `${tool.name}: FRONT LEFT RIGHT BACK, EACH ${anims.map((a) => a.toUpperCase()).join(' ')} THEN WALKING`, cells });
  }
  // The adult reference with the axe, same views.
  const ref: PixelBuffer[] = [];
  for (const v of VIEWS) for (const a of ['idle', 'raise', 'strike'] as EquipmentAnimation[]) ref.push(holding(seed, 'adult', ITEMS.axe.id, { ...REST_POSE, ...v.pose }, a, size, w, h));
  rows.push({ label: 'ADULT REFERENCE, AXE: FRONT LEFT RIGHT BACK, EACH IDLE RAISE STRIKE', cells: ref });
  return compose(`BABY TOOLS AT ${size} PX (NO ARMS: HELD BESIDE THE BODY)`, rows);
}

/** One Baby (and its adult) at every native size the camera draws: 12 overview, 24 exploration, 48 close, 72 up close. */
export function scalesSheet(pet = SAMPLE_PETS[0]): PixelBuffer {
  const seed = sampleV3Seed(pet);
  const rows: Row[] = [];
  for (const size of [12, 24, 48, 72]) {
    const w = Math.round(size * 1.5) + 8;
    const h = Math.round(size * 1.4) + 8;
    const baby = stagedIdentity(seed, 'baby');
    rows.push({
      label: `${size} PX: ADULT; BABY FRONT RIGHT BACK; HOP; AXE; V1 BABY`,
      cells: [
        stand(buildBlobbiSprite(stagedIdentity(seed, 'adult'), REST_POSE, size), w, h),
        stand(buildBlobbiSprite(baby, REST_POSE, size), w, h),
        stand(buildBlobbiSprite(baby, { ...REST_POSE, view: 'side' }, size), w, h),
        stand(buildBlobbiSprite(baby, { ...REST_POSE, view: 'back' }, size), w, h),
        stand(buildBlobbiSprite(baby, { ...REST_POSE, view: 'side', walk: 1 }, size), w, h),
        holding(seed, 'baby', ITEMS.axe.id, { ...REST_POSE, view: 'side', facing: -1 }, 'idle', size, w, h),
        stand(buildV1BabySprite(V1_SAMPLES[0].colors, REST_POSE, size), w, h),
      ],
    });
  }
  return compose('BABY AT EVERY CAMERA SIZE (NATIVE PIXELS, NEVER RESAMPLED)', rows);
}

/** The whole set, by name. */
export function babySheets(): { name: string; buffer: PixelBuffer }[] {
  return [
    { name: 'generations-24', buffer: generationsSheet(24) },
    { name: 'generations-48', buffer: generationsSheet(48) },
    { name: 'movement-24', buffer: movementSheet(24) },
    { name: 'movement-48', buffer: movementSheet(48) },
    { name: 'tools-24', buffer: toolsSheet(24) },
    { name: 'tools-48', buffer: toolsSheet(48) },
    { name: 'scales', buffer: scalesSheet() },
  ];
}

export type { Color };
