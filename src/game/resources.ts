/**
 * RESOURCES on the ground: sticks under trees, stones by rocks and on the forest floor, seeds by bushes and
 * flowers. Nodes are generated from the world (deterministic: keyed streams over the placements, in
 * placement order), live beside the procedural objects, and are only ever removed by the player's own
 * interaction. Each node has a stable id, so a saved game can say which ones are gone.
 */
import { stream } from '../core/rng';
import { hex, type Color } from '../core/color';
import { PixelBuffer, type Sprite } from '../core/pixel';
import type { WorldPalette } from '../core/palette';
import { T, WALKABLE, type Placement, type WorldDescription } from '../world/types';
import { ITEMS } from './items';

export type ResourceKind = 'stick' | 'stone' | 'seed';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['stick', 'stone', 'seed'];

/** Item ids and labels from the item registry. */
export const RESOURCE_ITEM: Record<ResourceKind, string> = { stick: ITEMS.stick.id, stone: ITEMS.stone.id, seed: ITEMS.seed.id };
export const RESOURCE_LABEL: Record<ResourceKind, string> = { stick: ITEMS.stick.plural, stone: ITEMS.stone.plural, seed: ITEMS.seed.plural };
/** Stack limits per resource. */
export const RESOURCE_STACK: Record<ResourceKind, number> = { stick: ITEMS.stick.stack, stone: ITEMS.stone.stack, seed: ITEMS.seed.stack };

/** Seconds of world time before a collected node is back on the ground (if its spot is still free). */
export const RESPAWN_SECONDS: Record<ResourceKind, number> = { stick: 120, stone: 180, seed: 150 };

export const kindOfItem = (item: string): ResourceKind | null => (RESOURCE_KINDS.find((k) => RESOURCE_ITEM[k] === item) ?? null);

export interface ResourceNode {
  /** Stable within a world: `<kind>:<n>` in generation order. */
  id: string;
  kind: ResourceKind;
  /** Ground point, world pixels. */
  x: number;
  y: number;
  /** Which of the kind's sprites. */
  variant: number;
  /** Index of the placement the node belongs to (the tree, rock, bush or flower), or -1. */
  source: number;
}

/** How close (pixels, from the Blobbi's ground point to the node) a resource must be to be collected. */
export const REACH = 11;

/** Ground the Blobbi can stand on with a small foot, and not on a path, water or the shell. */
export type StandCheck = (x: number, y: number, rx: number, ry: number) => boolean;

const MIN_GAP = 7;

export function generateResources(world: WorldDescription, canStand: StandCheck): ResourceNode[] {
  const { width, height, cls } = world.terrain;
  const nodes: ResourceNode[] = [];
  const counts: Record<ResourceKind, number> = { stick: 0, stone: 0, seed: 0 };
  const classAt = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? T.DEEP : cls[Math.floor(y) * width + Math.floor(x)]);
  const free = (fx: number, fy: number) => {
    // Nodes sit on whole pixels; check the pixel the node will actually be on.
    const x = Math.round(fx);
    const y = Math.round(fy);
    const c = classAt(x, y);
    if (!WALKABLE.has(c) || c === T.PATH) return false;
    if (!canStand(x, y, 2, 1)) return false;
    for (const n of nodes) if (Math.hypot(n.x - x, n.y - y) < MIN_GAP) return false;
    return true;
  };
  const put = (kind: ResourceKind, x: number, y: number, variant: number, source: number) => {
    nodes.push({ id: `${kind}:${counts[kind]++}`, kind, x: Math.round(x), y: Math.round(y), variant, source });
  };
  // One stream per kind, consumed in placement order: a node's position never depends on another kind.
  const sticks = stream(world.seed, 'resources', 'stick');
  const stones = stream(world.seed, 'resources', 'stone');
  const seeds = stream(world.seed, 'resources', 'seed');
  const around = (o: Placement, r0: number, r1: number, rng: ReturnType<typeof stream>) => {
    const ang = rng.range(0, Math.PI * 2);
    const r = rng.range(r0, r1);
    return { x: o.x + Math.cos(ang) * r, y: o.y + Math.sin(ang) * r * 0.7 + 2 };
  };
  world.objects.forEach((o, index) => {
    if (o.kind === 'tree') {
      const n = sticks.chance(0.6) ? 1 : sticks.chance(0.5) ? 2 : 0;
      for (let i = 0; i < n; i++) {
        const v = sticks.int(0, 2);
        for (let t = 0; t < 6; t++) {
          const p = around(o, 6, 13, sticks);
          if (free(p.x, p.y)) {
            put('stick', p.x, p.y, v, index);
            break;
          }
        }
      }
    } else if (o.kind === 'rock') {
      const n = stones.chance(0.7) ? (stones.chance(0.4) ? 2 : 1) : 0;
      for (let i = 0; i < n; i++) {
        const v = stones.int(0, 2);
        for (let t = 0; t < 6; t++) {
          const p = around(o, 5, 10, stones);
          if (free(p.x, p.y)) {
            put('stone', p.x, p.y, v, index);
            break;
          }
        }
      }
    } else if (o.kind === 'bush' || o.kind === 'flower') {
      if (!seeds.chance(o.kind === 'bush' ? 0.45 : 0.3)) return;
      const v = seeds.int(0, 2);
      for (let t = 0; t < 6; t++) {
        const p = around(o, 4, 9, seeds);
        if (free(p.x, p.y)) {
          put('seed', p.x, p.y, v, index);
          break;
        }
      }
    }
  });
  // Loose stones on the forest floor and by cliff feet, away from any rock.
  const island = world.islands[0];
  const extra = stones.int(5, 9);
  for (let i = 0; i < extra; i++) {
    for (let t = 0; t < 12; t++) {
      const ang = stones.range(0, Math.PI * 2);
      const r = island.radius * stones.range(0.1, 0.85);
      const x = island.cx + Math.cos(ang) * r;
      const y = island.cy + Math.sin(ang) * r * (island.aspect ?? 1);
      const c = classAt(x, y);
      const cliffFoot = classAt(x, y - 2) === T.CLIFF_FACE || classAt(x, y - 3) === T.CLIFF_FACE;
      if ((c === T.GRASS_DARK || cliffFoot) && free(x, y)) {
        put('stone', x, y, stones.int(0, 2), -1);
        break;
      }
    }
  }
  return nodes;
}

// ─── Sprites ─────────────────────────────────────────────────────────────────

const STICK = [
  ['....#', '...##', '..#o.', '.##..', '#o...'],
  ['......', '#o####', '.....#'],
  ['.....#', '...##.', '.#o#..', '#.....'],
];
const STONE = [
  ['.##.', '#+##', '#oo#', '.##.'],
  ['.###.', '#+###', '##oo#', '.###.'],
  ['###', '+##', '#o#'],
];
const SEED = [
  ['.#.', '#+#', '#o#', '.#.'],
  ['.##', '#+#', '#o#', '##.'],
  ['..#', '.#+', '#o#', '##.'],
];

function fromTemplate(rows: string[], colours: { '#': Color; '+': Color; o: Color }, outline: Color): Sprite {
  const w = rows[0].length;
  const h = rows.length;
  const buf = new PixelBuffer(w + 2, h + 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] as keyof typeof colours | '.';
      if (ch === '.') continue;
      buf.set(x + 1, y + 1, colours[ch]);
    }
  // A one-pixel outline around the shape, as every object in the lab has.
  const mask = buf.opaqueMask();
  const grown = mask.dilate();
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (grown.get(x, y) && !mask.get(x, y)) buf.set(x, y, outline);
  return { buffer: buf, anchorX: Math.floor(buf.width / 2), anchorY: buf.height - 1, footRx: 0, footRy: 0 };
}

const spriteCache = new Map<string, Sprite>();

/** The pixel sprite of a resource node: three small hand-set shapes per kind, in the world's palette. */
export function resourceSprite(kind: ResourceKind, variant: number, palette: WorldPalette): Sprite {
  const key = `${palette.name}|${kind}|${variant}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  let sprite: Sprite;
  if (kind === 'stick') sprite = fromTemplate(STICK[variant % STICK.length], { '#': palette.wood.mid, '+': palette.wood.light, o: palette.wood.dark }, palette.wood.outline);
  else if (kind === 'stone') sprite = fromTemplate(STONE[variant % STONE.length], { '#': palette.stone.mid, '+': palette.stone.light, o: palette.stone.dark }, palette.stone.outline);
  else sprite = fromTemplate(SEED[variant % SEED.length], { '#': hex('#c9a66b'), '+': hex('#eed9a6'), o: hex('#7a5a30') }, hex('#4a3620'));
  spriteCache.set(key, sprite);
  return sprite;
}
