import { describe, expect, it } from 'vitest';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { ViewCamera, gridSteps, worldBounds } from '../src/render/view-camera';
import { memoryStore } from '../src/game/persistence';
import { IntroCinematic, type IntroResult } from '../src/cinematic/intro';
import { introPreviewWorld, isIntroSpecies } from '../src/cinematic/preview';
import { fullTiming, reducedTiming, sceneAt, surfacingOrder, subjectOf, INTRO_MESSAGE } from '../src/cinematic/script';
import { FULLY_GROWN, FULLY_SURFACED, movingPartsMask, OpenSea, SOIL_BAND } from '../src/cinematic/sea';
import { bareCarrierLayer, formation, isLand, revealScale, revealSubject, terrainOnlyLayer } from '../src/cinematic/layers';
import { IntroAudio } from '../src/cinematic/audio';
import { SFX } from '../src/audio/sfx';
import type { AudioEngine } from '../src/audio/engine';
import type { CarrierSpecies } from '../src/game/archipelago';
import { paletteFor } from '../src/world/generate';
import { turtleUnderlay } from '../src/render/compose';
import { whaleGrowRange } from '../src/carriers/whale-world';
import { mantaBody, MANTA_CORE, MANTA_PERIOD } from '../src/carriers/manta';
import { CREATURE_FRAMES } from '../src/carriers/creature-render';
import { T } from '../src/world/types';
import { hash32 } from '../src/core/rng';
import type { PixelBuffer } from '../src/core/pixel';

const SPECIES: CarrierSpecies[] = ['turtle', 'manta', 'whale'];
const W = 480;
const H = 270;
const NO_UI = { hud: false, indicator: false, goals: false, prompt: false, lighting: false, uiScale: 2 };

function scene(kind: CarrierSpecies, opts: { reducedMotion?: boolean; audio?: AudioEngine | null; onComplete?: (r: IntroResult) => void; onSkip?: () => void } = {}) {
  const store = memoryStore();
  const live = new LiveWorld(introPreviewWorld(kind), 'blobbi-9', 16, { store });
  const renderer = new LiveRenderer(live);
  const view = new ViewRenderer(live, renderer);
  const intro = new IntroCinematic({ live, renderer, view }, opts);
  return { store, live, renderer, view, intro };
}

type Scene = ReturnType<typeof scene>;

/** Play until cinematic time `t` (inclusive), at 30 fps. */
function playTo(s: Scene, t: number, w = W, h = H): PixelBuffer {
  let f = s.intro.lastScreen!;
  while (!s.intro.done && s.intro.elapsed < t) f = s.intro.frame(1 / 30, w, h);
  return f;
}

/** A snapshot of everything the simulation owns that the cinematic must not touch. */
function worldState(live: LiveWorld) {
  return {
    time: live.clock.time,
    worldTime: live.worldTime,
    step: live.clock.step,
    x: live.blobbi.x,
    y: live.blobbi.y,
    items: live.inventory.entries().length,
    growth: JSON.stringify(live.growth),
    objects: live.world.objects.length,
    firstObject: JSON.stringify(live.world.objects[0]),
    identity: live.identity,
    buildings: live.buildings.length,
    turtle: { ...live.turtleAnim },
  };
}

const frameHash = (b: PixelBuffer) => hash32(Array.from(b.data, (c) => c.toString(36)).join(','));

/** A recording engine: what the cinematic asked the audio to do, without Web Audio. */
function fakeEngine() {
  const calls: string[] = [];
  const engine = {
    play: (name: string) => (calls.push(`play:${name}`), true),
    bed: (name: string, level: number) => calls.push(`bed:${name}:${level}`),
    setMood: (mood: string | null) => calls.push(`mood:${mood}`),
    tickMusic: () => 0,
  } as unknown as AudioEngine;
  return { engine, calls };
}

describe('intro cinematic: the timeline', () => {
  it('runs about half a minute in five scenes, the island forming only after the bare Carrier is up', () => {
    for (const s of SPECIES) {
      const tm = fullTiming(s);
      expect(tm.end).toBeGreaterThanOrEqual(25);
      expect(tm.end).toBeLessThanOrEqual(35);
      const order = [tm.ocean, tm.carrier, tm.island, tm.blobbi, tm.beginning, tm.end];
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(sceneAt(0, tm)).toBe('ocean');
      expect(sceneAt(tm.carrier + 0.1, tm)).toBe('carrier');
      expect(sceneAt(tm.island + 0.1, tm)).toBe('island');
      expect(sceneAt(tm.blobbi + 0.1, tm)).toBe('blobbi');
      expect(sceneAt(tm.beginning + 0.1, tm)).toBe('beginning');
      // Emergence, then formation, then life, then the arrival, then the greeting.
      expect(tm.surfacing[1]).toBeLessThan(tm.landForming[0]);
      expect(tm.carrierBeat).toBeLessThan(tm.landForming[0]);
      expect(tm.landForming[0]).toBeLessThan(tm.lifeForming[0]);
      expect(tm.landForming[1]).toBeLessThanOrEqual(tm.lifeForming[1]);
      expect(tm.lifeForming[1]).toBeLessThanOrEqual(tm.arrival);
      expect(tm.arrival + 3.6).toBeLessThan(tm.looks[0]);
      expect(tm.looks[1]).toBeLessThan(tm.notices);
      expect(tm.notices).toBeLessThan(tm.happy);
      expect(tm.happy).toBeLessThan(tm.beginning);
    }
    const r = reducedTiming();
    expect(r.end).toBeLessThan(fullTiming('turtle').end);
    expect(r.arrival + 2.16).toBeLessThan(r.looks[0]);
    expect(INTRO_MESSAGE).toEqual(['Every little world has a story.', 'This one begins with you.']);
  });

  it('orders the surfacing by species: dome first, snout first, disc first', () => {
    for (const s of SPECIES) {
      const world = introPreviewWorld(s);
      const bounds = worldBounds(world);
      const order = surfacingOrder(world, s, bounds);
      const { width } = world.terrain;
      const at = (x: number, y: number) => order[Math.round(y) * width + Math.round(x)];
      for (let i = 0; i < order.length; i += 97) expect(order[i] >= 0 && order[i] <= 1).toBe(true);
      const sub = subjectOf(bounds);
      if (s === 'turtle') {
        const a = world.turtle!;
        expect(at(a.cx, a.cy)).toBeLessThan(at(a.head.cx, a.head.cy));
        expect(at(a.cx, a.cy)).toBeLessThan(0.1);
      } else if (s === 'whale') {
        const a = world.creature!.anatomy as { xSnout: number; xTail: number; cy: number };
        expect(at(a.xSnout - 4, a.cy)).toBeLessThan(at((a.xSnout + a.xTail) / 2, a.cy));
        expect(at((a.xSnout + a.xTail) / 2, a.cy)).toBeLessThan(at(a.xTail + 4, a.cy));
      } else {
        const a = world.creature!.anatomy as { cx: number; cy: number };
        expect(at(a.cx, a.cy)).toBeLessThan(at(sub.x0 + 6, a.cy));
        expect(at(a.cx, a.cy)).toBeLessThan(0.1);
      }
    }
  });

  it('knows where the moving parts of a Carrier can be drawn over open water', () => {
    const manta = introPreviewWorld('manta');
    const mask = movingPartsMask(manta);
    let overDeep = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] && manta.terrain.cls[i] === T.DEEP) overDeep++;
    expect(overDeep).toBeGreaterThan(500); // the wing tips and the whip
    expect(movingPartsMask(introPreviewWorld('whale')).reduce((n, v) => n + v, 0)).toBeGreaterThan(2000); // fins and flukes
    expect(movingPartsMask(introPreviewWorld('turtle')).reduce((n, v) => n + v, 0)).toBeGreaterThan(100); // head and flippers
  });

  it("paints open water beyond the edge with the terrain painter's own deep-water rule", () => {
    const { live, renderer } = scene('turtle');
    const sea = new OpenSea(live.world, paletteFor(live.world.options.palette));
    const { width, height, cls } = live.world.terrain;
    let checked = 0;
    for (let y = 0; y < height; y += 7)
      for (let x = 0; x < width; x += 11) {
        if (cls[y * width + x] !== T.DEEP) continue;
        expect(sea.base(x, y)).toBe(renderer.staticLayer.get(x, y));
        checked++;
      }
    expect(checked).toBeGreaterThan(200);
    expect(sea.base(-50, -20) >>> 24).toBe(0xff);
    let strokes = 0;
    for (let cy = -20; cy < 20; cy++)
      for (let cx = -20; cx < 20; cx++) {
        const s = sea.stroke(cx, cy);
        if (!s) continue;
        strokes++;
        expect([3, 5]).toContain(s.len);
      }
    expect(strokes).toBeGreaterThan(100);
    expect(strokes).toBeLessThan(600);
  });
});

describe('intro cinematic: the bare Carrier and the birth of the island', () => {
  for (const kind of SPECIES)
    it(`${kind}: the bare picture has the animal where the land will be, the formation starts at a patch inside it`, () => {
      const world = introPreviewWorld(kind);
      const live = new LiveWorld(world, 'blobbi-9', 16);
      const renderer = new LiveRenderer(live);
      const bare = bareCarrierLayer(world);
      const land = terrainOnlyLayer(world, turtleUnderlay(world, { head: false, flippers: false }));
      const { width, height, cls } = world.terrain;
      let landPx = 0;
      let changed = 0;
      let waterSame = 0;
      let waterAll = 0;
      for (let i = 0; i < cls.length; i++) {
        if (isLand(cls[i])) {
          landPx++;
          if (bare.data[i] !== land.data[i]) changed++;
          expect(bare.data[i] >>> 24).toBe(0xff); // the animal's body shows, never a hole
        } else if (cls[i] === T.DEEP) {
          waterAll++;
          if (bare.data[i] === renderer.staticLayer.data[i] && land.data[i] === renderer.staticLayer.data[i]) waterSame++;
        }
      }
      // Nearly every land pixel looks different bare (a few may coincide by colour); open water is untouched.
      expect(changed / landPx).toBeGreaterThan(0.95);
      expect(waterSame / waterAll).toBeGreaterThan(0.999);
      // The land picture is the game's static layer where no object casts a shadow.
      let same = 0;
      let n = 0;
      for (let i = 0; i < cls.length; i += 13) {
        if (!isLand(cls[i])) continue;
        n++;
        if (land.data[i] === renderer.staticLayer.data[i]) same++;
      }
      expect(same / n).toBeGreaterThan(0.9);
      const f = formation(world, bare, land);
      expect(f.set.reduce((a, v) => a + v, 0)).toBeGreaterThanOrEqual(changed);
      // The first patch is on land, near the land's centre; the later ones on land too, delayed.
      const [first, ...later] = f.patches;
      expect(isLand(cls[first.y * width + first.x])).toBe(true);
      expect(first.delay).toBe(0);
      expect(Math.abs(first.x - f.land.cx)).toBeLessThan(f.land.rx * 0.3);
      expect(Math.abs(first.y - f.land.cy)).toBeLessThan(f.land.ry * 0.3);
      expect(later.length).toBe(2);
      for (const p of later) {
        expect(isLand(cls[p.y * width + p.x])).toBe(true);
        expect(p.delay).toBeGreaterThan(0);
      }
      // The order starts at the first patch and grows outward: the patch is earliest, the land's edge late.
      const at = (x: number, y: number) => f.order[Math.round(y) * width + Math.round(x)];
      expect(at(first.x, first.y)).toBeLessThan(0.08);
      let edgeMax = 0;
      for (let i = 0; i < cls.length; i++) if (f.set[i]) edgeMax = Math.max(edgeMax, f.order[i]);
      expect(edgeMax).toBeCloseTo(1, 5);
      // Species: the land grows over the animal's own carrying surface and never over its moving parts.
      const parts = movingPartsMask(world);
      let overParts = 0;
      for (let i = 0; i < cls.length; i++) if (f.set[i] && parts[i] && cls[i] === T.DEEP) overParts++;
      expect(overParts).toBe(0);
      if (kind === 'whale') {
        const range = whaleGrowRange(world.creature!.anatomy as never);
        for (const p of f.patches) {
          expect(p.x).toBeGreaterThan(range.x0);
          expect(p.x).toBeLessThan(range.x1);
        }
      }
      if (kind === 'turtle') {
        const a = world.turtle!;
        expect(Math.hypot(first.x - a.cx, first.y - a.cy)).toBeLessThan(a.rx * 0.25);
        // Bare, the dome is a shell (plates), not the flat colour under the land: many distinct colours.
        const colours = new Set<number>();
        for (let y = Math.round(a.cy - a.ry * 0.5); y < a.cy + a.ry * 0.5; y += 3) for (let x = Math.round(a.cx - a.rx * 0.5); x < a.cx + a.rx * 0.5; x += 3) colours.add(bare.get(x, y));
        expect(colours.size).toBeGreaterThan(6);
      }
      void height;
    });

  it('shows the bare Carrier up before any land, then a small patch, then the whole island, then life', () => {
    for (const kind of SPECIES) {
      const s = scene(kind);
      const tm = s.intro.timing;
      const { width, cls } = s.live.world.terrain;
      const f = s.intro.formation;
      const bare = (wx: number, wy: number) => (s.intro as unknown as { bare: PixelBuffer }).bare.data[wy * width + wx];
      const landAt = (wx: number, wy: number) => (s.intro as unknown as { land: PixelBuffer }).land.data[wy * width + wx];
      const first = f.patches[0];
      const parts = movingPartsMask(s.live.world);
      // Walk the screen: every pixel that samples a forming land pixel (not under a moving part).
      const survey = () => {
        const v = s.intro.lastView!;
        const scr = s.intro.lastScreen!;
        let total = 0;
        let bareCount = 0;
        for (let sy = 0; sy < v.screenH; sy += 3)
          for (let sx = 0; sx < v.screenW; sx += 3) {
            const wx = Math.floor(v.originX + (sx + 0.5) / v.scale);
            const wy = Math.floor(v.originY + (sy + 0.5) / v.scale);
            if (wx < 0 || wy < 0 || wx >= width || wy >= s.live.world.terrain.height) continue;
            const wi = wy * width + wx;
            if (!isLand(cls[wi]) || !f.set[wi] || parts[wi]) continue;
            total++;
            if (scr.data[sy * v.screenW + sx] === bare(wx, wy)) bareCount++;
          }
        return { total, bareCount };
      };
      // Up, bare: every land pixel on screen shows the animal.
      playTo(s, tm.carrierBeat + 0.1);
      expect(s.intro.surfacing(s.intro.elapsed)).toBeGreaterThanOrEqual(FULLY_SURFACED);
      expect(s.intro.landProgress(s.intro.elapsed)).toBe(0);
      const up = survey();
      expect(up.total).toBeGreaterThan(300);
      expect(up.bareCount).toBe(up.total);
      // A moment into the formation: the first patch has turned, most of the island has not.
      playTo(s, tm.landForming[0] + 0.7);
      const lp = s.intro.landProgress(s.intro.elapsed);
      expect(lp).toBeGreaterThan(0);
      expect(lp).toBeLessThan(0.2);
      const v1 = s.intro.lastView!;
      const sx1 = Math.floor((first.x + 0.5 - v1.originX) * v1.scale);
      const sy1 = Math.floor((first.y + 0.5 - v1.originY) * v1.scale);
      const wx1 = Math.floor(v1.originX + (sx1 + 0.5) / v1.scale);
      const wy1 = Math.floor(v1.originY + (sy1 + 0.5) / v1.scale);
      expect(s.intro.lastScreen!.data[sy1 * v1.screenW + sx1]).not.toBe(bare(wx1, wy1));
      const early = survey();
      expect(early.bareCount).toBeGreaterThan(early.total * 0.7);
      // Land complete: no sampled pixel is bare; life not yet everywhere.
      playTo(s, tm.landForming[1] + 0.05);
      expect(s.intro.landProgress(s.intro.elapsed)).toBeGreaterThanOrEqual(1 + SOIL_BAND - 1e-9);
      expect(s.intro.vegProgress(s.intro.elapsed)).toBeLessThan(FULLY_GROWN);
      const done = survey();
      expect(done.bareCount).toBe(0);
      // Life complete, before the arrival: the frame's land is the game's own (objects included).
      playTo(s, tm.lifeForming[1] + 0.05);
      expect(s.intro.vegProgress(s.intro.elapsed)).toBeGreaterThanOrEqual(FULLY_GROWN - 1e-9);
      const v = s.intro.lastView!;
      const game = s.view.render(v, 2, s.intro.worldTime(), { ...DEFAULT_LIVE_OPTIONS, hud: false }, NO_UI).clone();
      // The view renderer's buffer is shared: redraw the cinematic's frame and compare the island's rows.
      const mine = s.intro.frame(0, W, H);
      // (The skip hint sits in the bottom-right corner: left out of the comparison.)
      let diff = 0;
      for (let y = 0; y < H - 40; y++)
        for (let x = 0; x < W; x++) {
          const wx = Math.floor(v.originX + (x + 0.5) / v.scale);
          const wy = Math.floor(v.originY + (y + 0.5) / v.scale);
          if (isLand(cls[wy * width + wx] ?? 0) && game.data[y * W + x] !== mine.data[y * W + x]) diff++;
        }
      expect(diff).toBe(0);
      void landAt;
    }
  });

  it('frames the whole animal for the reveal, wing tips and flukes included, at several screen sizes', () => {
    for (const kind of SPECIES) {
      const world = introPreviewWorld(kind);
      const parts = movingPartsMask(world);
      const sub = revealSubject(world, worldBounds(world), parts);
      const { width } = world.options;
      // The subject holds every moving-part pixel (the old overview subject did not: the manta's tips were cut).
      for (let i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        const x = i % width;
        const y = Math.floor(i / width);
        expect(x >= sub.x0 && x < sub.x1 && y >= sub.y0 && y < sub.y1).toBe(true);
      }
      for (const [w, h] of [
        [960, 540],
        [800, 450],
        [1280, 720],
        [1440, 900],
      ]) {
        const s = scene(kind);
        const tm = s.intro.timing;
        const { view: v } = s.intro.viewAt(tm.carrierBeat, w, h);
        expect(v.scale).toBe(revealScale(w, h, sub));
        expect(v.originX).toBeLessThanOrEqual(sub.x0 + 1);
        expect(v.originY).toBeLessThanOrEqual(sub.y0 + 1);
        expect(v.originX + w / v.scale).toBeGreaterThanOrEqual(sub.x1 - 1);
        expect(v.originY + h / v.scale).toBeGreaterThanOrEqual(sub.y1 - 1);
        if (kind === 'manta' && w <= 960) {
          // The manta's wing tips are drawn on screen: skin-coloured pixels within the subject's outer columns.
          while (s.intro.elapsed < tm.carrierBeat) s.intro.frame(0.1, w, h);
          const a = world.creature!.anatomy as { genome: { skin: { mid: number; dark: number; light: number } } };
          const skin = new Set([a.genome.skin.mid, a.genome.skin.dark, a.genome.skin.light]);
          const scr = s.intro.lastScreen!;
          const lv = s.intro.lastView!;
          const count = (x0: number, x1: number) => {
            let n = 0;
            for (let sy = 0; sy < h; sy++)
              for (let sx = Math.max(0, Math.floor((x0 - lv.originX) * lv.scale)); sx < Math.min(w, Math.ceil((x1 - lv.originX) * lv.scale)); sx++) if (skin.has(scr.data[sy * w + sx])) n++;
            return n;
          };
          expect(count(sub.x0, sub.x0 + 48)).toBeGreaterThan(20);
          expect(count(sub.x1 - 48, sub.x1)).toBeGreaterThan(20);
        }
      }
    }
  });

  it("keeps the manta's wings whole under the water: no band of open sea where a wing crosses the shore bands round the disc", () => {
    // The sea's foam, shallow and water bands hug the still disc; the wings beyond it are drawn over those bands.
    // While the Carrier is beneath the surface (the shadow, then the surfacing), a wing pixel over a band must
    // be the submerged animal, not the sea: the old compositor painted every band pixel as water, which cut each
    // wing with a vertical strip of open sea just outside the disc and left the tips as detached pieces.
    const world = introPreviewWorld('manta');
    const a = world.creature!.anatomy as { cx: number; S: number; w: number; h: number };
    const half = a.S * MANTA_CORE;
    for (const [w, h] of [
      [960, 540],
      [1280, 800],
      [480, 270],
    ]) {
      const s = scene('manta');
      const tm = s.intro.timing;
      const seaColours = new Set<number>();
      for (let ty = -1; ty <= 1; ty++) for (let tx = -1; tx <= 1; tx++) for (const c of s.intro.sea.tile(tx, ty)) seaColours.add(c);
      // Under the shadow (before any surfacing), and half-way through the surfacing.
      for (const t of [tm.surfacing[0] - 0.25, (tm.surfacing[0] + tm.surfacing[1]) / 2]) {
        const scr = playTo(s, t, w, h);
        const v = s.intro.lastView!;
        const T = s.intro.worldTime();
        const k = Math.floor(((((T % MANTA_PERIOD) + MANTA_PERIOD) % MANTA_PERIOD) / MANTA_PERIOD) * CREATURE_FRAMES) % CREATURE_FRAMES;
        const body = mantaBody(a as Parameters<typeof mantaBody>[0], (k / CREATURE_FRAMES) * MANTA_PERIOD).all;
        let wing = 0;
        let sea = 0;
        for (let sy = 0; sy < h; sy++)
          for (let sx = 0; sx < w; sx++) {
            const wx = Math.floor(v.originX + (sx + 0.5) / v.scale);
            const wy = Math.floor(v.originY + (sy + 0.5) / v.scale);
            if (wx < 0 || wy < 0 || wx >= a.w || wy >= a.h || !body.get(wx, wy)) continue;
            if (Math.abs(wx + 0.5 - a.cx) <= half) continue; // the still disc: the terrain's own skin
            wing++;
            if (seaColours.has(scr.data[sy * w + sx])) sea++;
          }
        expect(wing).toBeGreaterThan(1000);
        // A wave stroke may cross a wing; a strip of sea across it is a defect.
        expect(sea / wing).toBeLessThan(0.02);
      }
    }
  });
});

describe('intro cinematic: playing it', () => {
  for (const kind of SPECIES)
    it(`${kind}: plays to the end, hands over the game's own exploration framing, changes nothing in the world`, () => {
      const { store, live, view, intro } = scene(kind);
      const before = worldState(live);
      const bounds = worldBounds(live.world);
      let frames = 0;
      let minScale = 99;
      let maxScale = 0;
      const seen = new Set<string>();
      while (!intro.done) {
        const f = intro.frame(1 / 30, W, H);
        expect(f.width).toBe(W);
        expect(f.height).toBe(H);
        const v = intro.lastView!;
        expect(Number.isFinite(v.originX) && Number.isFinite(v.originY) && Number.isFinite(v.scale)).toBe(true);
        minScale = Math.min(minScale, v.scale);
        maxScale = Math.max(maxScale, v.scale);
        if (!v.transitioning) expect([v.originX, v.originY].every((o) => Math.abs(o * gridSteps(v.scale) - Math.round(o * gridSteps(v.scale))) < 1e-6)).toBe(true); // on the grid: crisp blocks
        seen.add(intro.scene);
        frames++;
      }
      expect(frames).toBe(Math.ceil(intro.duration * 30));
      expect(minScale).toBeGreaterThanOrEqual(0.5);
      expect(maxScale).toBeLessThanOrEqual(4);
      expect([...seen]).toEqual(['ocean', 'carrier', 'island', 'blobbi', 'beginning', 'done']);
      // Nothing in the simulation changed, and nothing was saved.
      expect(worldState(live)).toEqual(before);
      expect(store.data.size).toBe(0);
      // A valid play state: the Blobbi present, facing the player, awake, its blinks and glances due soon.
      expect(live.teleport.state).toBe('present');
      const s = live.blobbi.animator.state;
      expect(s.direction).toBe('down');
      expect(s.sleeping).toBe(false);
      expect(s.moving).toBe(false);
      expect(s.nextBlink).toBeGreaterThanOrEqual(live.clock.time);
      expect(s.nextBlink).toBeLessThanOrEqual(live.clock.time + 5);
      expect(s.nextGlance).toBeLessThanOrEqual(live.clock.time + 5);
      // The last view is the exploration camera at rest on the Blobbi, as the game itself would snap to it.
      const v = intro.lastView!;
      const cam = new ViewCamera('exploration').update(0, { x: live.blobbi.x, y: live.blobbi.y, size: live.blobbi.size }, W, H, bounds, true);
      expect([v.scale, v.originX, v.originY, v.mode]).toEqual([2, cam.originX, cam.originY, 'exploration']);
      // And below the message band the frame is the game's own first frame, pixel for pixel: the complete island.
      const last = intro.lastScreen!.clone();
      const game = view.render(cam, 2, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false }, NO_UI);
      let diff = 0;
      for (let y = Math.floor(H * 0.45); y < H; y++) for (let x = 0; x < W; x++) if (game.data[y * W + x] !== last.data[y * W + x]) diff++;
      expect(diff).toBe(0);
    });

  it('keeps the Blobbi away until its island exists, then brings it by the existing teleport arrival', () => {
    for (const kind of SPECIES) {
      const s = scene(kind);
      const tm = s.intro.timing;
      const tp = s.live.teleport;
      let particlesBefore = 0;
      let particlesDuring = 0;
      while (!s.intro.done && s.intro.elapsed < tm.arrival - 1 / 30) {
        s.intro.frame(1 / 30, W, H);
        expect(tp.state).toBe('absent');
        expect(tp.visible(s.intro.worldTime())).toBe(0);
        particlesBefore += s.view.teleportParticles;
      }
      expect(particlesBefore).toBe(0);
      playTo(s, tm.arrival + 0.5);
      expect(tp.state).toBe('arriving');
      while (!s.intro.done && tp.state === 'arriving') {
        s.intro.frame(1 / 30, W, H);
        particlesDuring += s.view.teleportParticles;
      }
      expect(particlesDuring).toBeGreaterThan(50);
      expect(tp.state).toBe('present');
      expect(s.intro.elapsed).toBeGreaterThan(tm.arrival + 3.5);
      expect(s.intro.elapsed).toBeLessThan(tm.arrival + 3.8);
      // The arrival's own phases sounded, in order.
      const played = s.intro.audio.played;
      const idx = (n: string) => played.indexOf(n);
      expect(idx('teleport-incoming')).toBeGreaterThanOrEqual(0);
      expect(idx('teleport-rebuild')).toBeGreaterThan(idx('teleport-incoming'));
      expect(idx('teleport-arrived')).toBeGreaterThan(idx('teleport-rebuild'));
      // And it landed with the game's own smile and hop.
      const r = s.live.blobbi.animator.state.reaction;
      expect(r?.expression).toBe('happy');
      expect(r?.hop).toBe(3);
    }
  });

  it('performs: a look each way, surprised at you, then happy with a readable hello', () => {
    const s = scene('turtle');
    const tm = s.intro.timing;
    const anim = s.live.blobbi.animator;
    const poseNow = () => anim.pose(s.intro.worldTime());
    playTo(s, tm.looks[0] + 0.4);
    const p1 = poseNow();
    expect(p1.view).toBe('side');
    const facing1 = p1.facing;
    playTo(s, tm.looks[1] + 0.4);
    const p2 = poseNow();
    expect(p2.view).toBe('side');
    expect(p2.facing).toBe(-facing1);
    expect(s.intro.audio.played.filter((n) => n === 'curious').length).toBeGreaterThanOrEqual(1);
    playTo(s, tm.notices + 0.3);
    const p3 = poseNow();
    expect(p3.view).toBe('front');
    expect(p3.expression).toBe('surprised');
    expect(s.live.bubble).toBeNull();
    playTo(s, tm.happy + 0.3);
    const p4 = poseNow();
    expect(p4.view).toBe('front');
    expect(p4.expression).toBe('happy');
    expect(s.live.bubble?.text).toBe('hello!');
    expect(s.intro.audio.played).toContain('happy');
    // Up close the bubble is drawn at twice the UI scale: its white card is wide on screen.
    const f = s.intro.lastScreen!;
    let white = 0;
    for (let i = 0; i < f.data.length; i++) if (f.data[i] === 0xfff0faff) white++; // #fffaf0 as ABGR
    expect(white).toBeGreaterThan(600);
    playTo(s, tm.happy + 2.5);
    expect(s.live.bubble).toBeNull();
    // Not too fast: the beats are at least half a second apart.
    expect(tm.looks[1] - tm.looks[0]).toBeGreaterThanOrEqual(0.5);
    expect(tm.notices - tm.looks[1]).toBeGreaterThanOrEqual(0.5);
    expect(tm.happy - tm.notices).toBeGreaterThanOrEqual(0.5);
  });

  it('is deterministic: the same world and frame times give the same pixels', () => {
    const a = scene('whale');
    const b = scene('whale');
    const samples = [2, 7.5, 13, 16, 20, 24, 29];
    const hashes = (s: typeof a) => {
      const out: number[] = [];
      let next = 0;
      while (!s.intro.done) {
        const f = s.intro.frame(1 / 30, W, H);
        if (next < samples.length && s.intro.elapsed >= samples[next]) {
          out.push(frameHash(f));
          next++;
        }
      }
      return out;
    };
    const ha = hashes(a);
    const hb = hashes(b);
    expect(ha.length).toBe(samples.length);
    expect(hb).toEqual(ha);
  });

  it('skips at every phase into the complete real world and a valid play state', () => {
    const kinds: CarrierSpecies[] = ['turtle', 'manta', 'whale'];
    const tmAll = fullTiming('turtle');
    const moments = [1, tmAll.carrier + 2, tmAll.island + 2, tmAll.lifeForming[0] + 1, tmAll.arrival + 1.5, tmAll.looks[0] + 0.3, tmAll.happy + 0.3, tmAll.beginning + 1];
    moments.forEach((at, i) => {
      const kind = kinds[i % kinds.length];
      const calls: string[] = [];
      const s = scene(kind, { onSkip: () => calls.push('skip'), onComplete: (r) => calls.push(`complete:${r.skipped}:${r.cameraMode}`) });
      const before = worldState(s.live);
      playTo(s, at);
      s.intro.skip();
      expect(s.intro.done).toBe(true);
      expect(calls).toEqual(['skip', 'complete:true:exploration']);
      s.intro.skip(); // idempotent
      expect(calls.length).toBe(2);
      // The world: untouched, the Blobbi present, settled.
      expect(worldState(s.live)).toEqual(before);
      expect(s.live.teleport.state).toBe('present');
      expect(s.live.teleport.reducedMotion).toBe(false);
      const st = s.live.blobbi.animator.state;
      expect(st.reaction).toBeNull();
      expect(st.blinkStart).toBe(-1);
      expect(st.nextBlink).toBeGreaterThanOrEqual(s.live.clock.time);
      expect(st.nextBlink).toBeLessThanOrEqual(s.live.clock.time + 5);
      expect(st.glance.until).toBe(0);
      expect(st.direction).toBe('down');
      expect(s.live.bubble).toBeNull();
      // The game's first frame after the skip shows the complete island: the Blobbi is drawn, the land is whole.
      const hv = s.intro.handoffView(W, H);
      s.view.render(hv, 2, s.live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false }, NO_UI);
      expect(s.view.teleportAnchor).toBeNull();
      expect(s.view.lastBlobbi).not.toBeNull();
      const f = s.intro.frame(1 / 30, W, H); // one more frame still draws
      expect(f.width).toBe(W);
      s.intro.dispose();
      expect(() => s.intro.frame(1 / 30, W, H)).toThrow();
    });
  });

  it('cancelling (dispose) settles the world without callbacks', () => {
    const calls: string[] = [];
    const { live, intro } = scene('whale', { onSkip: () => calls.push('skip'), onComplete: () => calls.push('complete') });
    for (let i = 0; i < 60; i++) intro.frame(1 / 30, W, H);
    intro.dispose();
    expect(calls).toEqual([]);
    expect(live.teleport.state).toBe('present');
    expect(live.blobbi.animator.state.nextBlink).toBeLessThanOrEqual(live.clock.time + 5);
    intro.dispose(); // idempotent
  });

  it('reduced motion: cuts only, no hops, the short arrival, all frames on whole screen pixels', () => {
    const { live, intro } = scene('turtle', { reducedMotion: true });
    expect(intro.duration).toBeLessThanOrEqual(22);
    let hops = 0;
    const scales = new Set<number>();
    let arrivedAt = -1;
    const tp = live.teleport;
    let wasArriving = false;
    while (!intro.done) {
      intro.frame(1 / 30, W, H);
      const v = intro.lastView!;
      expect(v.transitioning).toBe(false);
      expect([v.originX, v.originY].every((o) => Math.abs(o * gridSteps(v.scale) - Math.round(o * gridSteps(v.scale))) < 1e-6)).toBe(true); // on the grid: crisp blocks
      scales.add(v.scale);
      if (live.blobbi.animator.hop(intro.worldTime()) !== 0) hops++;
      if (tp.state === 'arriving') wasArriving = true;
      if (wasArriving && tp.state === 'present' && arrivedAt < 0) arrivedAt = intro.elapsed;
    }
    expect(hops).toBe(0);
    expect(scales.size).toBeLessThanOrEqual(2);
    expect(scales.has(2)).toBe(true);
    expect(arrivedAt).toBeGreaterThan(intro.timing.arrival + 2);
    expect(arrivedAt).toBeLessThan(intro.timing.arrival + 2.4); // the teleport's own 0.6× form
    expect(tp.reducedMotion).toBe(false); // the game's own setting restored
  });

  it('survives a resize in the middle and keeps drawing at the new size', () => {
    const { intro } = scene('manta');
    let f = intro.frame(1 / 30, 320, 180);
    expect([f.width, f.height]).toEqual([320, 180]);
    while (intro.elapsed < 10) f = intro.frame(1 / 30, 320, 180);
    f = intro.frame(1 / 30, 1280, 720);
    expect([f.width, f.height]).toEqual([1280, 720]);
    while (intro.elapsed < 24) f = intro.frame(1 / 30, 1280, 720);
    f = intro.frame(1 / 30, 640, 400);
    expect([f.width, f.height]).toEqual([640, 400]);
    while (!intro.done) f = intro.frame(1 / 30, 640, 400);
    const hv = intro.handoffView(640, 400);
    expect([intro.lastView!.originX, intro.lastView!.originY]).toEqual([hv.originX, hv.originY]);
  });

  it('clamps a stalled frame, so a long pause never jumps the choreography', () => {
    const { intro } = scene('turtle');
    intro.frame(5, W, H);
    expect(intro.elapsed).toBeLessThanOrEqual(0.1);
  });
});

describe('intro cinematic: sound', () => {
  it("plays only existing effects, the Carrier's own voice, the formation and arrival cues, and moves the music mystery → day → special", () => {
    for (const kind of SPECIES) {
      const { engine, calls } = fakeEngine();
      const { intro } = scene(kind, { audio: engine });
      while (!intro.done) intro.frame(1 / 30, W, H);
      for (const name of intro.audio.played) expect(SFX[name]).toBeDefined();
      const voice = { turtle: 'carrier-call', manta: 'manta-call', whale: 'whale-song' }[kind];
      for (const n of [voice, 'splash', 'grow', 'plant', 'recipe', 'bird', 'teleport-incoming', 'teleport-rebuild', 'teleport-arrived', 'curious', 'happy', 'friend']) expect(intro.audio.played).toContain(n);
      if (kind === 'whale') expect(intro.audio.played).toContain('whale-blow');
      expect(calls.filter((c) => c.startsWith('mood:'))).toEqual(['mood:mystery', 'mood:day', 'mood:special']);
      expect(calls.some((c) => c.startsWith('bed:ocean:'))).toBe(true);
    }
  }, 180_000); // three full cinematics with audio: slow under a fully parallel run

  it('is silent without an engine, and ignores unknown names', () => {
    const quiet = new IntroAudio(null, 'x');
    expect(quiet.enabled).toBe(false);
    quiet.cue('not-a-sound');
    quiet.cue('happy');
    quiet.beds(1, 1);
    quiet.mood('day');
    quiet.tick();
    expect(quiet.played).toEqual(['happy']);
    const { intro } = scene('turtle', { audio: null });
    for (let i = 0; i < 30; i++) intro.frame(1 / 30, W, H);
    expect(intro.audio.enabled).toBe(false);
  });
});

describe('intro cinematic: preview worlds', () => {
  it('has one fixed world per species, and the preview live world never touches a store', () => {
    for (const kind of SPECIES) {
      const world = introPreviewWorld(kind);
      expect(world.creature?.species ?? 'turtle').toBe(kind);
      const live = new LiveWorld(world, 'blobbi-9', 16, { store: null });
      expect(live.species).toBe(kind);
      live.save(); // nothing to save to
    }
    expect(isIntroSpecies('whale')).toBe(true);
    expect(isIntroSpecies('dragon')).toBe(false);
  });
});
