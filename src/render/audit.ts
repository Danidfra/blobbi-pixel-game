/**
 * AUDIT: cheap structural checks on a generated world, so broken seeds can
 * be found in bulk (gallery, tests, the seed script) without looking at
 * every picture. Not a judgement of beauty; a judgement of validity.
 */
import { isLandClass, type WorldDescription } from '../world/types';
import { spriteFor } from './compose';
import type { Sprite } from '../core/pixel';

export interface Audit {
  ok: boolean;
  issues: string[];
}

const auditCache = new Map<string, Sprite>();

export function auditWorld(world: WorldDescription): Audit {
  const issues: string[] = [];
  const { width, height, cls } = world.terrain;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : cls[Math.floor(y) * width + Math.floor(x)]);

  // Connectivity: every island but one must be reached by a bridge.
  const reached = new Set<number>([0]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of world.bridges) {
      if (reached.has(b.from) && !reached.has(b.to)) {
        reached.add(b.to);
        grew = true;
      } else if (reached.has(b.to) && !reached.has(b.from)) {
        reached.add(b.from);
        grew = true;
      }
    }
  }
  for (const isl of world.islands) if (!reached.has(isl.id)) issues.push(`island ${isl.id} unbridged`);

  // Bridges: ends on land, middle over water.
  for (const b of world.bridges) {
    const mx = (b.x0 + b.x1) / 2;
    const my = (b.y0 + b.y1) / 2;
    if (isLandClass(at(mx, my))) issues.push(`bridge ${b.id} middle on land`);
    const endA = b.axis === 'h' ? at(b.x0 + 2, b.y0) : at(b.x0, b.y0 + 2);
    const endB = b.axis === 'h' ? at(b.x1 - 2, b.y1) : at(b.x1, b.y1 - 2);
    if (!isLandClass(endA) || !isLandClass(endB)) issues.push(`bridge ${b.id} end in water`);
  }

  // Objects: anchors on land and inside the map; sprites not clipped by the map edge.
  let clipped = 0;
  for (const o of world.objects) {
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) {
      issues.push(`${o.kind} has a non-finite position`);
      continue;
    }
    const c = at(o.x, o.y);
    if (!isLandClass(c)) issues.push(`${o.kind} at ${o.x},${o.y} off land`);
    const s = spriteFor(o, world.options.palette, auditCache);
    const x0 = o.x - s.anchorX;
    const y0 = o.y - s.anchorY;
    if (x0 < 0 || y0 < 0 || x0 + s.buffer.width > width || y0 + s.buffer.height > height) clipped++;
  }
  if (clipped) issues.push(`${clipped} object(s) clipped by the map edge`);
  if (world.islands.length === 0) issues.push('no islands');
  return { ok: issues.length === 0, issues };
}
