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
import { identityOfSource, stagedIdentity } from '../blobbi/identity';
import { worldFormSource } from '../blobbi/source';
import { buildEggSprite, EGG_CRACK_LEVELS } from '../blobbi/egg';
import type { WorldFormTraits } from '../blobbi/world-form';
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
  // As the game draws it: a tool in front one world pixel right (round(size / 12) native pixels), M2.3's nudge.
  const nudge = at.behind ? 0 : Math.max(1, Math.round(size / 12));
  const drawTool = () => at.visible && c.blit(at.sprite.buffer, gx + at.dx + nudge - at.sprite.anchorX, gy + at.dy - at.sprite.anchorY);
  if (at.behind) drawTool();
  c.blit(sprite.buffer, gx - sprite.anchorX, gy - sprite.anchorY);
  if (!at.behind) drawTool();
  if (at.tip && animation === 'fishing') c.set(gx + at.tip.dx + nudge, gy + at.tip.dy, hex('#ff3b5c'));
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

/** M11D.2: V1/V2 Blobbis in their temporary world forms beside their original look (the kit's baby art or colours). */
export function worldFormsSheet(size = 32): PixelBuffer {
  const w = Math.round(size * 1.6) + 6;
  const h = Math.round(size * 1.5) + 8;
  const owner = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
  const rows: Row[] = [];
  const looks: { label: string; gen: 'v1' | 'v2'; traits: WorldFormTraits }[] = [
    { label: 'V1 SUNSET STRIPED STAR', gen: 'v1', traits: { base: '#ff9900', secondary: '#3355ff', eye: '#222222', pattern: 'striped', mark: 'star' } },
    { label: 'V1 SKY SPOTTED HEART', gen: 'v1', traits: { base: '#7ad3ff', secondary: '#ffffff', eye: '#3b2a5a', pattern: 'spotted', mark: 'heart' } },
    { label: 'V2 ROSE GRADIENT BLUSH', gen: 'v2', traits: { base: '#e85d9a', secondary: '#ffd1e6', eye: '#401020', pattern: 'gradient', mark: 'blush' } },
    { label: 'V2 VIOLET SOLID SPARKLE', gen: 'v2', traits: { base: '#8b5cf6', secondary: '#c4b5fd', eye: '#1f2937', pattern: 'solid', mark: 'sparkle' } },
  ];
  looks.forEach((l, i) => {
    const source = worldFormSource(owner, getCanonicalBlobbiD(owner, `00000000e${i}`), l.gen, l.traits)!;
    const baby = identityOfSource(source, 'baby');
    const adult = identityOfSource(source, 'adult');
    const swatch = cellOf(w, h);
    [l.traits.base, l.traits.secondary, l.traits.eye].forEach((c, k) => swatch.fillRect(4 + k * 6, 6, 6, h - 14, hex(c)));
    const cells = [stand(buildV1BabySprite(l.traits, REST_POSE, size, l.gen), w, h), swatch];
    for (const v of [VIEWS[0], VIEWS[2], VIEWS[3]]) cells.push(stand(buildBlobbiSprite(baby, { ...REST_POSE, ...v.pose }, size), w, h));
    for (const v of [VIEWS[0], VIEWS[2], VIEWS[3]]) cells.push(stand(buildBlobbiSprite(adult, { ...REST_POSE, ...v.pose }, size), w, h));
    rows.push({ label: `${l.label}: ORIGINAL BABY ART, COLOURS; WORLD FORM BABY F R B; ADULT F R B`, cells });
  });
  return compose(`V1/V2 WORLD FORMS AT ${size} PX (TEMPORARY, LOCAL)`, rows);
}

/** M11D.3: the pixel eggs (the kit's own V3 egg of each sample): every crack level, rocking angles, the hatchling and adult. */
export function eggsSheet(size = 48): PixelBuffer {
  const w = Math.round(size * 1.2) + 6;
  const h = Math.round(size * 1.3) + 8;
  const rows: Row[] = [];
  for (const pet of SAMPLE_PETS) {
    const seed = sampleV3Seed(pet);
    const genome = stagedIdentity(seed, 'baby').genome;
    const cells: PixelBuffer[] = [];
    for (const crack of EGG_CRACK_LEVELS) cells.push(stand(buildEggSprite(genome, { crack, angle: 0 }, size), w, h));
    for (const angle of [-8, -3, 3, 8]) cells.push(stand(buildEggSprite(genome, { crack: 'light', angle }, size), w, h));
    cells.push(stand(buildBlobbiSprite(stagedIdentity(seed, 'baby'), REST_POSE, size), w, h));
    cells.push(stand(buildBlobbiSprite(stagedIdentity(seed, 'adult'), REST_POSE, size), w, h));
    rows.push({ label: `V3 ${pet}: EGG NONE LIGHT MEDIUM HEAVY; ROCKING -8 -3 3 8; BABY; ADULT`, cells });
  }
  return compose(`PIXEL EGGS AT ${size} PX (THE KIT'S OWN EGG; ROCKS, NEVER TURNS)`, rows);
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
    { name: 'world-forms-32', buffer: worldFormsSheet(32) },
    { name: 'eggs-24', buffer: eggsSheet(24) },
    { name: 'eggs-48', buffer: eggsSheet(48) },
  ];
}

export type { Color };
