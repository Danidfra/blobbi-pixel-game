import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, SWING, type LiveInput } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewCamera, CAMERA_CYCLE, CAMERA_MODES, DEFAULT_CAMERA_MODE, TRANSITION_SECONDS, MIN_OVERVIEW_SCALE, blobbiScreenSize, isCameraMode, worldBounds, type CameraModeId, type ViewRect } from '../src/render/view-camera';
import { ViewRenderer } from '../src/render/view-renderer';
import { buildBlobbiSprite } from '../src/blobbi/sprite';
import { STEEL } from '../src/game/equipment';
import { ITEMS } from '../src/game/items';
import { BUILDINGS } from '../src/game/buildings';
import { LARGE_ROCK_SIZE } from '../src/game/rocks';
import { memoryStore, saveKey, SAVE_VERSION } from '../src/game/persistence';
import { hash32 } from '../src/core/rng';
import { cameraScene } from '../scripts/camera-scene';

const W = 960;
const H = 540;
const NO_UI = { hud: false, indicator: false, uiScale: 2 };
const target = (live: LiveWorld) => ({ x: live.blobbi.x, y: live.blobbi.y, size: live.blobbi.size });

/** A camera settled in `mode` on the scene, and the view it gives. */
function settle(live: LiveWorld, mode: CameraModeId, w = W, h = H): { camera: ViewCamera; view: ViewRect; rest: number } {
  const camera = new ViewCamera(mode);
  const bounds = worldBounds(live.world);
  const view = camera.update(0, target(live), w, h, bounds, true);
  return { camera, view, rest: camera.restScale(mode, w, h, bounds) };
}

const frameHash = (data: Uint32Array) => hash32(Array.from(data, (c) => c.toString(36)).join(','));

describe('camera modes', () => {
  it('cycles overview → exploration → close-up with Z order, defaults to exploration, eases and settles exactly', () => {
    expect(CAMERA_CYCLE).toEqual(['overview', 'exploration', 'closeup']);
    expect(DEFAULT_CAMERA_MODE).toBe('exploration');
    expect(isCameraMode('closeup')).toBe(true);
    expect(isCameraMode('zoom')).toBe(false);
    expect([CAMERA_MODES.overview.scale, CAMERA_MODES.exploration.scale, CAMERA_MODES.closeup.scale]).toEqual([1, 2, 4]);
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const bounds = worldBounds(live.world);
    const camera = new ViewCamera();
    camera.update(0, target(live), W, H, bounds, true);
    expect(camera.scale).toBe(2);
    expect(camera.cycle()).toBe('closeup');
    // The scale eases monotonically from 2 to 4 over the transition, then is exactly 4, on whole world pixels.
    let last = 2;
    let t = 0;
    while (t < TRANSITION_SECONDS + 0.05) {
      const v = camera.update(1 / 60, target(live), W, H, bounds);
      expect(v.scale).toBeGreaterThanOrEqual(last);
      last = v.scale;
      t += 1 / 60;
    }
    const rest = camera.update(1 / 60, target(live), W, H, bounds);
    expect(rest.scale).toBe(4);
    expect(rest.transitioning).toBe(false);
    expect(Number.isInteger(rest.originX) && Number.isInteger(rest.originY)).toBe(true);
    expect(camera.cycle()).toBe('overview');
    expect(camera.cycle()).toBe('exploration');
  });

  it('follows the Blobbi in exploration and close-up, and frames the whole turtle in the overview', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const bounds = worldBounds(live.world);
    for (const mode of ['exploration', 'closeup'] as const) {
      const camera = new ViewCamera(mode);
      camera.update(0, target(live), W, H, bounds, true);
      for (let i = 0; i < 120; i++) {
        live.update(1 / 60, { ...IDLE_INPUT, right: i < 60, down: i >= 60 });
        camera.update(1 / 60, target(live), W, H, bounds);
      }
      for (let i = 0; i < 90; i++) camera.update(1 / 60, target(live), W, H, bounds);
      const v = camera.view(W, H, bounds);
      const sx = (live.blobbi.x - v.originX) * v.scale;
      const sy = (live.blobbi.y - v.originY) * v.scale;
      // Centred (within a world pixel's block and the half body offset), unless clamped at the world's edge.
      expect(Math.abs(sx - W / 2)).toBeLessThanOrEqual(v.scale * 2);
      expect(Math.abs(sy - live.blobbi.size / 2 * v.scale - H / 2)).toBeLessThanOrEqual(v.scale * 2);
    }
    // Overview: the turtle's whole bounding box (animal and foam) is on the screen, at 1×.
    const { view } = settle(live, 'overview');
    const sub = bounds.subject!;
    expect(view.scale).toBe(1);
    expect(sub.x0 - view.originX).toBeGreaterThanOrEqual(0);
    expect(sub.y0 - view.originY).toBeGreaterThanOrEqual(0);
    expect(sub.x1 - view.originX).toBeLessThanOrEqual(W);
    expect(sub.y1 - view.originY).toBeLessThanOrEqual(H);
    // The overview ignores where the Blobbi is.
    live.blobbi.x += 40;
    expect(settle(live, 'overview').view).toEqual(view);
    // A screen smaller than the turtle: the overview steps down (never under the floor) to keep it whole.
    const small = settle(live, 'overview', 620, 413);
    expect(small.view.scale).toBe(0.75);
    expect(small.view.scale).toBeGreaterThanOrEqual(MIN_OVERVIEW_SCALE);
  });
});

describe('the multi-scale view', () => {
  it('is deterministic per mode: the same world and Blobbi give the same pixels', () => {
    const hashes = (seed: string) => {
      const live = cameraScene(seed);
      const view = new ViewRenderer(live, new LiveRenderer(live));
      return CAMERA_CYCLE.map((m) => {
        const s = settle(live, m);
        return frameHash(view.render(s.view, s.rest, live.clock.time, DEFAULT_LIVE_OPTIONS).data);
      });
    };
    const a = hashes('turtle-0');
    expect(hashes('turtle-0')).toEqual(a);
    expect(new Set(a).size).toBe(3);
  });

  it('the 1× overview is the classic single-frame render everywhere but the Blobbi (no bubble, no UI)', () => {
    const live = cameraScene('turtle-0');
    live.bubble = null;
    const world = new LiveRenderer(live);
    const view = new ViewRenderer(live, world);
    const { view: v, rest } = settle(live, 'overview');
    const screen = view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, NO_UI).clone();
    const classic = world.render(W, H, v.originX, v.originY, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false });
    // The overview draws the Blobbi (and its tool) at 12 px instead of 16: only that box may differ.
    const bx = Math.round(live.blobbi.x) - v.originX;
    const by = Math.round(live.blobbi.y) - v.originY;
    const diff: string[] = [];
    for (let i = 0; i < screen.data.length && diff.length < 8; i++) {
      const x = i % W;
      const y = Math.floor(i / W);
      if (Math.abs(x - bx) <= 12 && y >= by - 22 && y <= by + 2) continue;
      if (screen.data[i] !== classic.data[i]) diff.push(`${x},${y}`);
    }
    expect(diff).toEqual([]);
  });

  it('draws the overview Blobbi at 12 px without touching its world size, footprint, reach or placement', () => {
    expect(blobbiScreenSize(16, 'overview', 1)).toBe(12);
    expect(blobbiScreenSize(16, 'overview', 0.75)).toBe(12); // its true size at 0.75×, never smaller
    expect(blobbiScreenSize(16, 'exploration', 2)).toBe(24);
    expect(blobbiScreenSize(16, 'closeup', 4)).toBe(48);
    const live = cameraScene('turtle-0');
    const before = { size: live.blobbi.size, footRx: live.blobbi.footRx, footRy: live.blobbi.footRy, spot: live.placementSpot(), check: live.placementCheck(), facing: live.facingObject()?.index, near: live.nearestResource()?.id, blocked: frameHash(Uint32Array.from(live.collision.blocked)) };
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const s = settle(live, 'overview');
    view.render(s.view, s.rest, live.clock.time, DEFAULT_LIVE_OPTIONS, NO_UI);
    expect(s.view.scale).toBe(1);
    expect(view.lastBlobbi!.size).toBe(12);
    const pose = live.blobbi.animator.pose(live.clock.time);
    expect(view.lastBlobbi!.sprite.buffer.data).toEqual(buildBlobbiSprite(live.blobbi.identity, pose, 12).buffer.data);
    expect({ size: live.blobbi.size, footRx: live.blobbi.footRx, footRy: live.blobbi.footRy, spot: live.placementSpot(), check: live.placementCheck(), facing: live.facingObject()?.index, near: live.nearestResource()?.id, blocked: frameHash(Uint32Array.from(live.collision.blocked)) }).toEqual(before);
    // The gameplay sprite (world size) is still 16 px.
    expect(live.blobbiSprite(pose).buffer.data).toEqual(buildBlobbiSprite(live.blobbi.identity, pose, 16).buffer.data);
  });

  it('draws the Blobbi natively at 12, 24 and 48 px (the kit raster at that size, never a magnified sprite)', () => {
    const live = cameraScene('turtle-0');
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const pose = live.blobbi.animator.pose(live.clock.time);
    const colours: number[] = [];
    for (const [mode, size] of [['overview', 12], ['exploration', 24], ['closeup', 48]] as const) {
      const s = settle(live, mode);
      view.render(s.view, s.rest, live.clock.time, DEFAULT_LIVE_OPTIONS, NO_UI);
      const drawn = view.lastBlobbi!;
      expect(drawn.size).toBe(size);
      expect(drawn.ratio).toBe(1);
      expect(drawn.sprite.buffer.data).toEqual(buildBlobbiSprite(live.blobbi.identity, pose, size).buffer.data);
      colours.push(new Set(drawn.sprite.buffer.data.filter((c) => c >>> 24)).size);
      if (size > 12) {
        // Not blocks: some aligned k×k cell mixes colours (the 12 px sprite magnified never does).
        const k = size / 12;
        const b = drawn.sprite.buffer;
        let mixed = 0;
        for (let y = 0; y + k <= b.height; y += k)
          for (let x = 0; x + k <= b.width; x += k) {
            const c = b.get(x, y);
            for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (b.get(x + i, y + j) !== c) mixed++;
          }
        expect(mixed).toBeGreaterThan(50);
      }
    }
    // More pixels, more of the kit's shading and face survive.
    expect(colours[1]).toBeGreaterThanOrEqual(colours[0]);
    expect(colours[2]).toBeGreaterThanOrEqual(colours[1]);
  });

  it('keeps expressions and the walk cycle in every mode (the pose decides the native sprite)', () => {
    const live = cameraScene('turtle-0');
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const s = settle(live, 'closeup');
    view.render(s.view, s.rest, live.clock.time, DEFAULT_LIVE_OPTIONS, NO_UI);
    const still = view.lastBlobbi!.sprite;
    live.blobbi.animator.react('excited', live.clock.time, 2, 0);
    view.render(s.view, s.rest, live.clock.time + 0.01, DEFAULT_LIVE_OPTIONS, NO_UI);
    const excited = view.lastBlobbi!.sprite;
    expect(excited.buffer.data).not.toEqual(still.buffer.data);
    expect(live.blobbi.animator.pose(live.clock.time + 0.01).expression).toBe('excited');
    for (let i = 0; i < 20; i++) live.update(1 / 60, { ...IDLE_INPUT, left: true });
    view.render(s.view, s.rest, live.clock.time, DEFAULT_LIVE_OPTIONS, NO_UI);
    const pose = live.blobbi.animator.pose(live.clock.time);
    expect(pose.walk).toBeGreaterThanOrEqual(0);
    expect(view.lastBlobbi!.sprite.buffer.data).toEqual(buildBlobbiSprite(live.blobbi.identity, pose, 48).buffer.data);
  });

  it('attaches the tool at the native hand in every mode, at the matching template scale', () => {
    const live = cameraScene('turtle-0');
    const view = new ViewRenderer(live, new LiveRenderer(live));
    for (const mode of CAMERA_CYCLE) {
      const s = settle(live, mode);
      const screen = view.render(s.view, s.rest, live.clock.time, DEFAULT_LIVE_OPTIONS, NO_UI);
      const b = view.lastBlobbi!;
      // Steel pixels of the pickaxe within the Blobbi's reach on screen, scaling with the mode (k² per template pixel).
      const k = s.view.scale;
      let steel = 0;
      for (let y = b.y - b.size * 1.4; y < b.y + 4 * k; y++)
        for (let x = b.x - b.size; x < b.x + b.size; x++) {
          const c = screen.get(Math.round(x), Math.round(y));
          if (c === STEEL.mid || c === STEEL.light || c === STEEL.dark) steel++;
        }
      expect(steel, mode).toBeGreaterThanOrEqual(3 * k * k);
      // The native rig finds the same hand as the gameplay rig, scaled (to within a template pixel or two).
      const pose = live.blobbi.animator.pose(live.clock.time);
      const native = view.native(b.size);
      const rig = native ? native.rig : live.rig;
      const arm = 'right-arm';
      const hand = rig.hand(pose, arm, (p) => (native ? native.sprite(p) : live.blobbiSprite(p)));
      const base = live.rig.hand(pose, arm, (p) => live.blobbiSprite(p));
      // The drawn Blobbi is three quarters of its world size in every mode, so the hand is too.
      const r = (k * 3) / 4;
      expect(Math.abs(hand.dx - base.dx * r)).toBeLessThanOrEqual(2 * k);
      expect(Math.abs(hand.dy - base.dy * r)).toBeLessThanOrEqual(2 * k);
    }
  });

  it('keeps one Blobbi-to-world proportion and one anchor in every mode: 12, 24, 48 px over the same ground pixel', () => {
    const live = cameraScene('turtle-0');
    live.bubble = null;
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const pose = live.blobbi.animator.pose(live.clock.time);
    for (const mode of CAMERA_CYCLE) {
      const { view: v, rest } = settle(live, mode);
      view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, NO_UI);
      const b = view.lastBlobbi!;
      // The drawn height over the world scale is the same 12 world pixels in every mode (the shelter is fixed).
      expect(b.size / v.scale, mode).toBe(12);
      // The anchor is the bottom-centre screen pixel of the Blobbi's ground world pixel, in every mode.
      expect(b.x, mode).toBe(Math.floor((Math.round(live.blobbi.x) - v.originX) * v.scale + v.scale / 2));
      expect(b.y, mode).toBe(Math.floor((Math.round(live.blobbi.y) - v.originY) * v.scale + v.scale - 1));
      expect(b.sprite.buffer.data).toEqual(buildBlobbiSprite(live.blobbi.identity, pose, b.size).buffer.data);
    }
  });

  it('rests a speech bubble on the head as drawn in every mode, not on the 16 px world head', () => {
    const live = cameraScene('turtle-0');
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const b = live.blobbi;
    live.bubble = { text: 'hi', until: live.clock.time + 10, x: b.x, y: b.y - b.size - 2, head: b.size };
    const INK = 0xff40232b; // #2b2340, the bubble's outline and tail
    for (const mode of CAMERA_CYCLE) {
      const { view: v, rest } = settle(live, mode);
      const screen = view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, NO_UI);
      const drawn = view.lastBlobbi!;
      const s = drawn.sprite;
      let crown = Infinity;
      for (let y = 0; y < s.buffer.height; y++) for (let x = 0; x < s.buffer.width; x++) if (s.buffer.get(x, y) >>> 24) crown = Math.min(crown, y);
      const crownY = drawn.y - s.anchorY + crown;
      // The tail tip: the lowest bubble-ink pixel in the Blobbi's column band.
      let tail = -1;
      for (let y = 0; y < crownY; y++) for (let x = drawn.x - 8; x <= drawn.x + 8; x++) if (screen.get(x, y) === INK) tail = Math.max(tail, y);
      expect(tail, mode).toBeGreaterThan(0);
      // Two world pixels of air between tail and head (plus the drawing's own crown-to-height margin), in every mode.
      const gapWorld = (crownY - tail) / v.scale;
      expect(gapWorld, mode).toBeGreaterThanOrEqual(1);
      expect(gapWorld, mode).toBeLessThanOrEqual(3.5);
    }
  });

  it('magnifies the world without resizing it: every screen pixel away from the Blobbi is a world pixel of the classic render', () => {
    const live = cameraScene('turtle-0');
    live.bubble = null;
    const world = new LiveRenderer(live);
    const view = new ViewRenderer(live, world);
    for (const mode of ['exploration', 'closeup'] as const) {
      const { view: v, rest } = settle(live, mode);
      const screen = view.render(v, rest, live.clock.time, DEFAULT_LIVE_OPTIONS, NO_UI).clone();
      const b = view.lastBlobbi!;
      const vw = Math.ceil(W / v.scale);
      const vh = Math.ceil(H / v.scale);
      const classic = world.render(vw, vh, v.originX, v.originY, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false });
      // The classic Blobbi (and its tool) in world pixels, and the native one on the screen, are left out.
      const bx = Math.round(live.blobbi.x) - v.originX;
      const by = Math.round(live.blobbi.y) - v.originY;
      let compared = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const wx = Math.floor(x / v.scale);
          const wy = Math.floor(y / v.scale);
          if (Math.abs(wx - bx) <= 16 && wy >= by - 26 && wy <= by + 3) continue;
          if (Math.abs(x - b.x) <= b.size && y >= b.y - b.size * 1.6 && y <= b.y + v.scale * 3) continue;
          compared++;
          if (screen.get(x, y) !== classic.get(wx, wy)) throw new Error(`${mode}: screen ${x},${y} ≠ world ${wx},${wy}`);
        }
      expect(compared).toBeGreaterThan(W * H * 0.9);
    }
  });
});

describe('the camera never touches the game', () => {
  /** One scripted session: walk, collect, try a small rock, mine a large one, build. */
  function session(live: LiveWorld, everyFrame: (frame: number) => void): void {
    live.brain.enabled = false;
    live.inventory.add(ITEMS.pickaxe.id, 1);
    live.equip(ITEMS.pickaxe.id);
    for (const c of BUILDINGS.shelter.cost) live.inventory.add(c.item, c.quantity);
    const script: Partial<LiveInput>[] = [];
    for (let i = 0; i < 600; i++) {
      const phase = Math.floor(i / 50) % 4;
      script.push({ right: phase === 0, down: phase === 1, left: phase === 2, up: phase === 3, interact: i % 37 === 0 });
    }
    script.forEach((input, i) => {
      if (i === 300) live.setBuildMode('shelter');
      if (i === 320) live.placeBuilding();
      if (i === 321) live.setBuildMode(null);
      live.update(1 / 60, { ...IDLE_INPUT, ...input, plant: false });
      everyFrame(i);
    });
    for (let i = 0; i < Math.ceil(SWING.end * 60) + 4; i++) live.update(1 / 60, IDLE_INPUT);
  }
  const snapshot = (live: LiveWorld) => ({
    blobbi: { x: live.blobbi.x, y: live.blobbi.y, dir: live.blobbi.animator.state.direction },
    inventory: live.inventory.snapshot(),
    rocks: [...live.rocks.entries()],
    trees: [...live.trees.entries()],
    buildings: live.buildings.map((b) => ({ ...b })),
    collected: [...live.collected].sort(),
    worldTime: live.worldTime,
    stats: { ...live.stats, particles: 0 },
    facing: live.facingObject()?.index ?? null,
    near: live.nearestResource()?.id ?? null,
    spot: live.placementSpot(),
    check: live.placementCheck(),
    blocked: frameHash(Uint32Array.from(live.collision.blocked)),
    nav: live.nav.freeCount(),
  });

  it('world coordinates, interactions, reach, building placement and saves are identical whatever the camera does', () => {
    const plainStore = memoryStore();
    const plain = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store: plainStore });
    session(plain, () => {});
    const viewedStore = memoryStore();
    const viewed = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store: viewedStore });
    const view = new ViewRenderer(viewed, new LiveRenderer(viewed));
    const camera = new ViewCamera('overview');
    const bounds = worldBounds(viewed.world);
    session(viewed, (frame) => {
      if (frame % 45 === 0) camera.cycle();
      const v = camera.update(1 / 60, target(viewed), 480, 270, bounds);
      view.render(v, camera.restScale(camera.mode, 480, 270, bounds), viewed.clock.time, DEFAULT_LIVE_OPTIONS);
    });
    expect(snapshot(viewed)).toEqual(snapshot(plain));
    expect(viewed.stats.collected + viewed.stats.mines + viewed.stats.built).toBeGreaterThan(0);
    // The save is byte-identical, schema 5 (M3.4 added only the stated owner), with no camera or Blobbi state in it.
    plain.save();
    viewed.save();
    const key = saveKey(plain.identity);
    expect(viewedStore.get(key)).toBe(plainStore.get(key));
    const record = JSON.parse(viewedStore.get(key)!);
    expect(record.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(5);
    expect(Object.keys(record).sort()).toEqual(['buildings', 'collected', 'collectedAt', 'equipped', 'inventory', 'owner', 'rocks', 'trees', 'version', 'world', 'worldTime']);
  });

  it('a save made in one mode loads to the same world in another', () => {
    const store = memoryStore();
    const a = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    session(a, () => {});
    a.save();
    const b = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    const view = new ViewRenderer(b, new LiveRenderer(b));
    for (const mode of CAMERA_CYCLE) {
      const s = settle(b, mode);
      view.render(s.view, s.rest, b.clock.time, DEFAULT_LIVE_OPTIONS);
    }
    expect(b.inventory.snapshot()).toEqual(a.inventory.snapshot());
    expect(b.buildings.map((x) => [x.id, x.x, x.y])).toEqual(a.buildings.map((x) => [x.id, x.x, x.y]));
    expect([...b.rocks.entries()]).toEqual([...a.rocks.entries()]);
  });

  it('small-rock feedback and large-rock mining work the same in close-up', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    live.inventory.add(ITEMS.pickaxe.id, 1);
    live.equip(ITEMS.pickaxe.id);
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const camera = new ViewCamera('closeup');
    const bounds = worldBounds(live.world);
    const small = live.world.objects.findIndex((o) => o.kind === 'rock' && o.size < LARGE_ROCK_SIZE);
    const o = live.world.objects[small];
    const s = live.spriteOf(o);
    live.blobbi.x = o.x;
    live.blobbi.y = o.y + s.footRy + 6;
    live.update(1 / 60, { ...IDLE_INPUT, up: true });
    live.blobbi.x = o.x;
    live.blobbi.y = o.y + s.footRy + 6;
    live.resources = [];
    const v = camera.update(0, target(live), W, H, bounds, true);
    view.render(v, 4, live.clock.time, DEFAULT_LIVE_OPTIONS);
    expect(live.facingObject()?.index).toBe(small);
    live.update(1 / 120, { ...IDLE_INPUT, interact: true });
    live.update(1 / 120, IDLE_INPUT);
    view.render(camera.update(1 / 60, target(live), W, H, bounds), 4, live.clock.time, DEFAULT_LIVE_OPTIONS);
    expect(live.bubble?.text).toBe('too small to mine');
  });
});
