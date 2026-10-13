/**
 * THE COMPOSITOR: WorldDescription in, PixelBuffer out. Terrain, then ground
 * shadows, then bridges, then every object in painter's order (by ground y),
 * honouring layer toggles. Deterministic: the same world gives the same bytes.
 */
import { PixelBuffer, type Sprite } from '../core/pixel';
import { paletteFor } from '../world/generate';
import { OBJECT_GENERATORS } from '../objects';
import { paintTerrain } from './paint-terrain';
import { renderTurtleBody, type TurtleAnatomy, type TurtleBody } from '../turtle/turtle';
import { creatureUnderlay, drawCreatureParts } from '../carriers/creature-render';
import { paintShellSurface } from '../carrier/shell-surface';
import { T, type Layer, type Placement, type WorldDescription } from '../world/types';

export interface RenderOptions {
  terrain: boolean;
  vegetation: boolean;
  structures: boolean;
  details: boolean;
  shadows: boolean;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = { terrain: true, vegetation: true, structures: true, details: true, shadows: true };

/** Sprites are pure functions of their inputs; cache them per world render. */
export function spriteFor(p: Placement, paletteName: string, cache?: Map<string, Sprite>): Sprite {
  const key = `${paletteName}|${p.kind}|${p.seed}|${p.size}|${JSON.stringify(p.variation ?? null)}`;
  const hit = cache?.get(key);
  if (hit) return hit;
  const sprite = OBJECT_GENERATORS[p.kind]({ seed: p.seed, size: p.size, palette: paletteFor(paletteName), variation: p.variation as never });
  cache?.set(key, sprite);
  return sprite;
}

const bodyCache = new Map<string, TurtleBody>();

/** The turtle's body, drawn once per anatomy (keyed by turtle seed and world size). The M1 shell. */
export function turtleBodyFor(a: TurtleAnatomy, width: number, height: number): TurtleBody {
  const key = `${a.genome.seed}|${width}x${height}|${a.rx.toFixed(1)}`;
  const hit = bodyCache.get(key);
  if (hit) return hit;
  const body = renderTurtleBody(a);
  bodyCache.set(key, body);
  return body;
}

/** The carrier's body for a world: the M1 shell for Variant 0, the carrier's shell surface for the enlarged variants. */
export function turtleBodyForWorld(world: WorldDescription): TurtleBody {
  const a = world.turtle!;
  const carrier = world.carrier;
  if (!carrier || carrier.variant === 0) return turtleBodyFor(a, world.options.width, world.options.height);
  const key = `${a.genome.seed}|${world.options.width}x${world.options.height}|${a.rx.toFixed(1)}|v${carrier.variant}|${world.options.palette}|${world.islands[0].cx},${world.islands[0].cy}|g${world.growth ? `${world.growth.version}.${world.growth.stage}` : 0}|${world.seed}`;
  const hit = bodyCache.get(key);
  if (hit) return hit;
  const ctx = { island: world.islands[0], land: world.growth?.land, landField: world.growth?.landField, landingField: world.growth?.landingField, palette: paletteFor(world.options.palette), seed: carrier.seed, scale: world.options.scale };
  const body = renderTurtleBody(a, (buf, anatomy) => paintShellSurface(buf, anatomy, ctx).dome);
  bodyCache.set(key, body);
  return body;
}

/** The static underlay for a turtle world: shell dome and rim, neck, tail, with the head and flippers at rest. */
export function turtleUnderlay(world: WorldDescription, parts: { head: boolean; flippers: boolean } = { head: true, flippers: true }): PixelBuffer | undefined {
  // A creature world (M7: the manta) has its own carrier underlay: the still core of its body.
  if (!world.turtle) return creatureUnderlay(world);
  const body = turtleBodyForWorld(world);
  const buf = new PixelBuffer(world.options.width, world.options.height);
  // The flippers first: their bases emerge from UNDER the shell (M9; they used to be drawn over its rim).
  if (parts.flippers) for (const f of body.flippers) buf.blit(f.buffer, f.x, f.y);
  buf.blit(body.buffer, 0, 0);
  if (parts.head) buf.blit(body.head.buffer, body.head.x, body.head.y);
  return buf;
}

export function renderWorld(world: WorldDescription, options: Partial<RenderOptions> = {}, cache = new Map<string, Sprite>()): PixelBuffer {
  const o = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const palette = paletteFor(world.options.palette);
  const { width, height } = world.options;
  const buf = new PixelBuffer(width, height);
  if (o.terrain) paintTerrain(buf, world.terrain, palette, world.seed, { underlay: turtleUnderlay(world) });
  else buf.fill(palette.water.dark);
  // A creature carrier's moving parts, at rest (the live renderer animates them).
  if (o.terrain && world.creature) drawCreatureParts(buf, world, 0, 0, 0);

  const enabled = (layer: Layer) => (layer === 'vegetation' ? o.vegetation : layer === 'structures' ? o.structures : o.details);
  const objects = world.objects.filter((p) => enabled(p.layer)).map((p) => ({ p, sprite: spriteFor(p, world.options.palette, cache) }));

  // Ground shadows: a solid darker tone on whatever is under the object, offset to the light's opposite side.
  if (o.shadows && o.terrain) {
    const shadowColor = (x: number, y: number) => {
      const c = world.terrain.cls[y * width + x];
      if (c === T.SAND || c === T.SAND_WET || c === T.PATH) return palette.shadowOnSand;
      if (c >= T.GRASS_EDGE) return palette.shadowOnGrass;
      return palette.shadowOnWater;
    };
    for (const { p, sprite } of objects) {
      if (sprite.footRx <= 0) continue;
      const rx = sprite.footRx + 1;
      const ry = Math.max(1, sprite.footRy);
      const cx = p.x + 1;
      const cy = p.y + 1;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          if (!buf.inBounds(x, y)) continue;
          const u = (x + 0.5 - cx) / rx;
          const v = (y + 0.5 - cy) / ry;
          if (u * u + v * v <= 1) buf.set(x, y, shadowColor(x, y));
        }
    }
    if (o.structures)
      for (const b of world.bridges) {
        // The deck's shadow on the water, one deck-width below/right.
        const half = Math.floor(b.width / 2);
        if (b.axis === 'h') for (let x = b.x0; x <= b.x1; x++) for (let y = b.y0 + half + 1; y <= b.y0 + half + 2; y++) if (buf.inBounds(x, y) && world.terrain.cls[y * width + x] < T.GRASS_EDGE) buf.set(x, y, palette.shadowOnWater);
        else for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0 + half + 1; x <= b.x0 + half + 2; x++) if (buf.inBounds(x, y) && world.terrain.cls[y * width + x] < T.GRASS_EDGE) buf.set(x, y, palette.shadowOnWater);
      }
  }

  // Bridges lie flat on the ground: before every standing object.
  if (o.structures) {
    for (const b of world.bridges) {
      const half = Math.floor(b.width / 2);
      const length = b.axis === 'h' ? b.x1 - b.x0 + 1 : b.y1 - b.y0 + 1;
      const sprite = OBJECT_GENERATORS.bridge({ seed: `${world.seed}/bridge/${b.id}`, size: length, palette, variation: { axis: b.axis, length, width: b.width } });
      if (b.axis === 'h') buf.blit(sprite.buffer, b.x0, b.y0 - half - sprite.anchorY);
      else buf.blit(sprite.buffer, b.x0 - half - 1, b.y0);
    }
  }

  if (o.structures) {
    for (const p of world.piers) {
      const half = Math.floor(p.width / 2);
      const length = Math.abs(p.axis === 'h' ? p.x1 - p.x0 : p.y1 - p.y0) + 1;
      const sprite = OBJECT_GENERATORS.bridge({ seed: `${world.seed}/pier`, size: length, palette, variation: { axis: p.axis, length, width: p.width, pier: true } });
      if (p.axis === 'h') buf.blit(sprite.buffer, Math.min(p.x0, p.x1), p.y0 - half - sprite.anchorY);
      else buf.blit(sprite.buffer, p.x0 - half - 1, Math.min(p.y0, p.y1));
    }
  }

  // Painter's order: by ground y, then x; flat details (tufts, flowers) under tall things at the same row.
  objects.sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x);
  for (const { p, sprite } of objects) buf.blit(sprite.buffer, p.x - sprite.anchorX, p.y - sprite.anchorY);
  return buf;
}
