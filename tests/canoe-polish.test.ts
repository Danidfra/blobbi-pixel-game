/**
 * M10 phase C polish: the canoe reads as a canoe in each of its four headings (KI-50); the rough water at the edge of
 * the Carrier's sea is rounded and breathes, never a straight rectangle (KI-51); the canoe can always be called back
 * into the bag, and there is still only one (KI-52); every fish has its own icon (KI-53).
 */
import { describe, expect, it } from 'vitest';
import { canoeSprites } from '../src/render/canoe-render';
import { paletteFor } from '../src/world/generate';
import { CANOE, SeaNav, seaRegion } from '../src/game/canoe';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore } from '../src/game/persistence';
import { CANOE_ITEM, FISH_CONTENT } from '../src/content/tools';
import { itemIcon } from '../src/ui/icons';
import { worldBounds } from '../src/render/view-camera';
import { movingPartsMask } from '../src/cinematic/sea';
import { GROWTH_VERSION } from '../src/world/growth';
import { stand, pressE, run } from '../src/dev/scripted-play';

const palette = paletteFor('cozy');

describe('the canoe in each heading (KI-50)', () => {
  it('four different pictures: left is right mirrored, up and down are not the same picture flipped', () => {
    const s = (h: 'left' | 'right' | 'up' | 'down') => canoeSprites(h, palette).whole.buffer;
    const mirror = (b: ReturnType<typeof s>) => {
      const out: number[] = [];
      for (let y = 0; y < b.height; y++) for (let x = b.width - 1; x >= 0; x--) out.push(b.get(x, y));
      return out.join();
    };
    expect(mirror(s('left'))).toBe(Array.from(s('right').data).join());
    // Bow and stern differ: right is not its own mirror image.
    expect(mirror(s('right'))).not.toBe(Array.from(s('right').data).join());
    // Up and down: a bow away (a stem above) and a bow toward the viewer (a deeper prow below) are different shapes.
    const flipV = (b: ReturnType<typeof s>) => {
      const out: number[] = [];
      for (let y = b.height - 1; y >= 0; y--) for (let x = 0; x < b.width; x++) out.push(b.get(x, y));
      return out.join();
    };
    expect(flipV(s('up'))).not.toBe(Array.from(s('down').data).join());
    // Planks run along the hull in every heading: an up canoe's middle column alternates no colour along its length.
    const up = s('up');
    const mid = Math.floor(up.width / 2);
    const colours = new Set<number>();
    for (let y = Math.floor(up.height * 0.35); y < Math.floor(up.height * 0.6); y++) colours.add(up.get(mid, y));
    expect(colours.size).toBeLessThanOrEqual(2);
  });
});

describe('the edge of the sea (KI-51)', () => {
  it('rounded corners and a breathing line: never a straight side', () => {
    const world = generateMantaWorld('edge-1', { carrierSeed: 'm-edge-1', generatedHouse: false });
    const nav = new SeaNav(world, seaRegion(worldBounds(world).subject!), movingPartsMask(world));
    const r = nav.region;
    // Along the top side, where the band begins (the first row down with any current) varies.
    const starts = new Set<number>();
    for (let x = r.x0 + CANOE.corner; x < r.x1 - CANOE.corner; x += 9) {
      let y = r.y0;
      while (y < r.y0 + CANOE.band * 2 && nav.edge(x, y) > 0) y++;
      starts.add(y - r.y0);
    }
    expect(starts.size).toBeGreaterThan(4);
    // A corner is rounded: the band reaches further in on the diagonal than straight in from a side.
    expect(nav.edge(r.x0 + CANOE.band + 6, r.y0 + CANOE.band + 6)).toBeGreaterThan(0);
    // Deep inside: calm. Deterministic.
    expect(nav.edge((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)).toBe(0);
    const again = new SeaNav(world, nav.region, movingPartsMask(world));
    expect(again.edge(r.x0 + 40, r.y0 + 300)).toBe(nav.edge(r.x0 + 40, r.y0 + 300));
  });
});

describe('the canoe is never lost (KI-52)', () => {
  it('a moored canoe is called back into the bag from anywhere ashore; never while aboard; still only one', () => {
    const base = generateMantaWorld('recall-1', { carrierSeed: 'm-recall-1', generatedHouse: false });
    const store = memoryStore();
    const probe = new LiveWorld(base, 'blobbi-9', 16, { store });
    probe.growth = { stage: 1, version: GROWTH_VERSION, history: [], regions: [] };
    probe.save();
    const live = new LiveWorld(base, 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    (live as unknown as { nearbyMarine: () => null }).nearbyMarine = () => null;
    const at = live.landingStand()!;
    live.inventory.add(CANOE_ITEM.id, 1);
    stand(live, at.x, at.y, at.heading);
    live.resources = [];
    for (const d of live.discoveries) if (Math.hypot(d.x - at.x, d.y - at.y) < 30) live.found.add(d.id);
    pressE(live); // launched
    expect(live.boat).not.toBeNull();
    expect(live.inventory.count(CANOE_ITEM.id)).toBe(0);
    pressE(live); // aboard
    run(live, 40);
    expect(live.recallCanoe()).toBe(false); // not while aboard
    pressE(live); // ashore again
    run(live, 40);
    expect(live.boat!.aboard).toBe(false);
    // Far away, at the hub: called back.
    live.blobbi.x = live.world.hubs[0].x;
    live.blobbi.y = live.world.hubs[0].y;
    expect(live.recallCanoe()).toBe(true);
    expect(live.boat).toBeNull();
    expect(live.inventory.count(CANOE_ITEM.id)).toBe(1);
    expect(live.recallCanoe()).toBe(false); // nothing more to call back: no second canoe
    expect(live.inventory.count(CANOE_ITEM.id)).toBe(1);
    // Saved that way.
    live.save();
    const again = new LiveWorld(base, 'blobbi-9', 16, { store });
    expect(again.boat).toBeNull();
    expect(again.inventory.count(CANOE_ITEM.id)).toBe(1);
  });
});

describe('fish icons (KI-53)', () => {
  it('every species has its own silhouette, not only its own colours', () => {
    const shapes = new Set<string>();
    for (const f of FISH_CONTENT) {
      const icon = itemIcon(f.item.id, palette);
      const mask: string[] = [];
      for (let y = 0; y < icon.height; y++) for (let x = 0; x < icon.width; x++) mask.push(icon.get(x, y) >>> 24 ? '#' : '.');
      shapes.add(`${icon.width}x${icon.height}:${mask.join('')}`);
    }
    expect(shapes.size).toBe(FISH_CONTENT.length);
  });
});
