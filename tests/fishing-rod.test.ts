/**
 * M10 fishing rod: the line leaves the rod's tip as drawn — in every direction, every casting phase and camera
 * scale — never the face or the body; it is hidden by the Blobbi exactly when the rod is; the cast winds back,
 * swings and throws the float out from the tip.
 */
import { describe, expect, it } from 'vitest';
import { attachTool, EquipmentRig, toolSprite, type EquipmentAnimation, type ToolOrientation } from '../src/game/equipment';
import { blobbiIdentity } from '../src/blobbi/identity';
import { buildBlobbiSprite, type BlobbiPose } from '../src/blobbi/sprite';
import { REST_POSE } from '../src/blobbi/pose';
import { paletteFor } from '../src/world/generate';
import { LiveWorld, CAST } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer, DEFAULT_VIEW_UI } from '../src/render/view-renderer';
import { ViewCamera, worldBounds, type CameraModeId } from '../src/render/view-camera';
import { LINE_COLOUR } from '../src/render/fishing-line';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { stand } from '../src/dev/scripted-play';

const ROD = 'blobbi-pixel:tool:fishing-rod';
const palette = paletteFor('cozy');
const ORIENTATIONS: ToolOrientation[] = ['rest', 'carry', 'raised', 'strike', 'strike-down', 'strike-up', 'fish', 'fish-down', 'fish-up'];
const VIEWS: [string, Partial<BlobbiPose>][] = [
  ['down', { view: 'front' }],
  ['up', { view: 'back' }],
  ['left', { view: 'side', facing: -1 }],
  ['right', { view: 'side', facing: 1 }],
];

describe('the rod sprite', () => {
  it('has a tip in every orientation, mirrored and scaled with the rod, on a drawn pixel', () => {
    for (const o of ORIENTATIONS)
      for (const scale of [1, 2, 3])
        for (const m of [false, true]) {
          const s = toolSprite(ROD, o, palette, m, scale);
          expect(s.tipX, o).not.toBeNull();
          expect(s.buffer.get(s.tipX!, s.tipY!) >>> 24, `${o} ${scale} ${m}`).toBe(255);
          const plain = toolSprite(ROD, o, palette, !m, scale);
          // Mirroring mirrors the tip (within the centre-of-block rounding when scaled).
          expect(Math.abs(s.tipX! + plain.tipX! - (s.buffer.width - 1))).toBeLessThanOrEqual(1);
          // Far from the grip: the rod's length.
          expect(Math.hypot(s.tipX! - s.gripX, s.tipY! - s.gripY)).toBeGreaterThan(3 * scale);
        }
  });
});

describe('the tip in every direction and phase', () => {
  const identity = blobbiIdentity('blobbi-9');
  for (const size of [16, 24, 48]) {
    const rig = new EquipmentRig(identity, size);
    const spriteOf = (p: BlobbiPose) => buildBlobbiSprite(identity, p, size);
    for (const [dir, v] of VIEWS)
      it(`${dir} at ${size} px: the tip is off the body while fishing, and away from the face whenever a line is out`, () => {
        const pose = { ...REST_POSE, ...v } as BlobbiPose;
        const body = spriteOf(pose);
        const opaque = (dx: number, dy: number) => (body.buffer.get(Math.round(dx) + body.anchorX, Math.round(dy) + body.anchorY) >>> 24) > 0;
        // (While the rod is wound back no line is drawn: see 'the cast'.)
        for (const phase of ['cast', 'fishing'] as EquipmentAnimation[]) {
          const at = attachTool(ROD, pose, phase, rig, spriteOf, palette);
          expect(at.visible).toBe(true);
          expect(at.tip).not.toBeNull();
          // The face: the middle of the body, a little above (eyes and mouth).
          const face = { x: 0, y: -size * 0.55 };
          expect(Math.hypot(at.tip!.dx - face.x, at.tip!.dy - face.y), phase).toBeGreaterThan(size * 0.3);
          if (phase === 'fishing') expect(opaque(at.tip!.dx, at.tip!.dy), `${dir} tip on the body`).toBe(false);
        }
      });
  }
});

/** A stage-2 island (the shore reaches the rim), the Blobbi with its rod out, facing `dir`. */
function fishingWorld(dir: 'up' | 'down' | 'left' | 'right'): LiveWorld {
  const store = memoryStore();
  const make = () => generateTurtleWorld('island-m10', { turtleSeed: 'turtle-m10', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
  const probe = new LiveWorld(make(), 'blobbi-9', 16, { store });
  probe.growth = { stage: 2, version: 3, history: [], regions: [] };
  probe.save();
  const live = new LiveWorld(make(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  live.inventory.add(ROD, 1);
  live.equip(ROD);
  const { width, height } = live.world.terrain;
  for (let y = 10; y < height - 10; y += 3)
    for (let x = 10; x < width - 10; x += 3) {
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      stand(live, x, y, dir);
      const t = live.fishTarget();
      if (t && Math.hypot(t.x - x, t.y - y) >= 18 && live.fish()) return live;
    }
  throw new Error(`nowhere to fish facing ${dir}`);
}

describe('the line on screen', () => {
  for (const [dir] of VIEWS)
    for (const mode of ['exploration', 'closeup'] as CameraModeId[])
      it(`${dir}, ${mode}: starts at the rod's tip, never on the face, hidden by the body when the rod is`, () => {
        const live = fishingWorld(dir as never);
        const view = new ViewRenderer(live, new LiveRenderer(live));
        (live.clock as { time: number }).time = live.fishing!.start + 1.2; // waiting for a bite, line out
        live.bubble = null; // ("cast..." would cover the tip above the head)
        const cam = new ViewCamera(mode);
        const W = 640;
        const H = 400;
        const b = worldBounds(live.world);
        const v = cam.update(0, live.cameraTarget(), W, H, b, true);
        const rest = cam.restScale(mode, W, H, b);
        const screen = view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, lighting: false, hud: false, indicator: false, goals: false, prompt: false });
        const shown = view.lastBlobbi!;
        const native = view.native(shown.size);
        const at = attachTool(ROD, live.blobbi.animator.pose(live.clock.time), live.equipmentAnimation(live.clock.time), native ? native.rig : live.rig, (p) => (native ? native.sprite(p) : live.blobbiSprite(p)), paletteFor(live.world.options.palette));
        expect(live.equipmentAnimation(live.clock.time)).toBe('fishing');
        const s = v.scale;
        const tx = shown.x + Math.round(at.tip!.dx) + (at.behind ? 0 : Math.round(s));
        const ty = shown.y + Math.round(at.tip!.dy);
        const isLine = (x: number, y: number) => screen.get(x, y) === LINE_COLOUR;
        // A line pixel right at the tip.
        let near = false;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isLine(tx + dx, ty + dy)) near = true;
        expect(near, `line at the tip (${tx}, ${ty})`).toBe(true);
        // None on the Blobbi's face, and none over its body when the rod is behind it.
        const sp = shown.sprite;
        let onFace = 0;
        let onBody = 0;
        for (let y = 0; y < sp.buffer.height; y++)
          for (let x = 0; x < sp.buffer.width; x++) {
            if (!(sp.buffer.get(x, y) >>> 24)) continue;
            const sx = shown.x - sp.anchorX + x;
            const sy = shown.y - sp.anchorY + y;
            if (!isLine(sx, sy)) continue;
            onBody++;
            if (Math.abs(x - sp.anchorX) < shown.size * 0.3 && Math.abs(sp.anchorY - y - shown.size * 0.55) < shown.size * 0.2) onFace++;
          }
        expect(onFace).toBe(0);
        if (at.behind) expect(onBody).toBe(0);
      });
});

describe('the cast', () => {
  it('winds back, swings, then holds the rod out; the float flies from the tip to the water', () => {
    const live = fishingWorld('down');
    const f = live.fishing!;
    const phase = (t: number) => live.equipmentAnimation(f.start + t);
    expect(phase(0.05)).toBe('raise');
    expect(phase((CAST.back + CAST.release) / 2)).toBe('cast');
    expect(phase(CAST.land)).toBe('fishing');
    expect(live.castProgress(f.start + CAST.back)).toBe(0);
    expect(live.castProgress(f.start + CAST.land)).toBe(1);
  });

  it('draws no line while the rod is wound back, then the float flies out from the tip', () => {
    const live = fishingWorld('left');
    const f = live.fishing!;
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const frameAt = (t: number) => {
      (live.clock as { time: number }).time = f.start + t;
      live.bubble = null;
      const cam = new ViewCamera('closeup');
      const b = worldBounds(live.world);
      const v = cam.update(0, live.cameraTarget(), 640, 400, b, true);
      return view.render(v, cam.restScale('closeup', 640, 400, b), live.clock.time, DEFAULT_LIVE_OPTIONS, { ...DEFAULT_VIEW_UI, lighting: false, hud: false, indicator: false, goals: false, prompt: false }).clone();
    };
    const lines = (buf: ReturnType<typeof frameAt>) => buf.data.filter((c) => c === LINE_COLOUR).length;
    expect(lines(frameAt(CAST.back * 0.5))).toBe(0);
    // Early in the flight the line is short (the float near the tip); landed, it reaches the water.
    const early = lines(frameAt(CAST.release + 0.02));
    const landed = lines(frameAt(CAST.land + 0.3));
    expect(early).toBeGreaterThan(0);
    expect(landed).toBeGreaterThan(early);
  });

  it('the classic renderer also starts the line at the tip, with the rod in the painter\'s order', () => {
    const live = fishingWorld('right');
    (live.clock as { time: number }).time = live.fishing!.start + 1.2;
    const r = new LiveRenderer(live);
    const ox = Math.round(live.blobbi.x) - 60;
    const oy = Math.round(live.blobbi.y) - 50;
    const frame = r.render(120, 90, ox, oy, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false });
    const at = attachTool(ROD, live.blobbi.animator.pose(live.clock.time), 'fishing', live.rig, (p) => live.blobbiSprite(p), paletteFor(live.world.options.palette));
    const tx = Math.round(live.blobbi.x) + at.tip!.dx + (at.behind ? 0 : 1) - ox;
    const ty = Math.round(live.blobbi.y) + at.tip!.dy - oy;
    let near = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (frame.get(tx + dx, ty + dy) === LINE_COLOUR) near = true;
    expect(near).toBe(true);
  });
});
