/**
 * NOTHING GROWS THE BLOBBI IN (playtest review, 2026-11-26): a sapling turns solid once past its seedling stage, and
 * a mined rock re-forms from its low deposit to a whole rock; when either rises where the Blobbi stands, it steps to
 * the nearest free ground. (Regression: it was held fast, every direction moving it 0 px, tap-to-walk too.)
 */
import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { run, stand } from '../src/dev/scripted-play';
import { isLargeRock, ROCK_FORM_SECONDS } from '../src/game/rocks';

type Inner = { timeOffset: number; clearingTimer: number; rocks: Map<number, { hits: number; minedAt: number | null; reformAt: number | null }> };
const inner = (live: LiveWorld) => live as unknown as Inner;

function canWalk(live: LiveWorld): boolean {
  const b = live.blobbi;
  const start = { x: b.x, y: b.y };
  for (const d of ['up', 'down', 'left', 'right'] as const) {
    b.x = start.x;
    b.y = start.y;
    run(live, 30, { [d]: true });
    if (Math.hypot(b.x - start.x, b.y - start.y) > 2) return true;
  }
  return false;
}

describe('stepping clear of what grows solid', () => {
  it('a sapling turning solid under the Blobbi', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const hub = live.world.hubs[0];
    let planted = false;
    for (let r = 0; r < 120 && !planted; r += 4)
      for (let a = 0; a < 16 && !planted; a++) {
        const x = Math.round(hub.x + Math.cos((a / 16) * 6.28) * r);
        const y = Math.round(hub.y + Math.sin((a / 16) * 6.28) * r);
        if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
        stand(live, x, y, 'down');
        planted = live.plantTree();
      }
    expect(planted).toBe(true);
    const t = live.planted[0];
    const b = live.blobbi;
    b.x = t.placement.x;
    b.y = t.placement.y; // walked onto the seedling (it is stepped over)
    expect(live.collision.canStand(b.x, b.y, b.footRx, b.footRy)).toBe(true);
    inner(live).timeOffset += live.growDuration * 0.35;
    run(live, 2);
    expect(t.solid).toBe(true);
    expect(live.collision.canStand(b.x, b.y, b.footRx, b.footRy)).toBe(true);
    expect(canWalk(live)).toBe(true);
  });

  it('a rock re-forming beside the Blobbi', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const b = live.blobbi;
    let tested = false;
    live.world.objects.forEach((o, i) => {
      if (tested || o.kind !== 'rock' || !isLargeRock(o.size)) return;
      const whole = live.spriteOf(o);
      inner(live).rocks.set(i, { hits: 0, minedAt: live.worldTime - 5000, reformAt: live.worldTime - ROCK_FORM_SECONDS * 0.49 });
      inner(live).clearingTimer = 0;
      run(live, 2);
      for (let dx = -whole.footRx - 4; dx <= whole.footRx + 4 && !tested; dx++)
        for (let dy = -whole.footRy - 4; dy <= whole.footRy + 4 && !tested; dy++) {
          const x = o.x + dx + 0.5;
          const y = o.y + dy + 0.5;
          if (!live.collision.canStand(x, y, b.footRx, b.footRy)) continue;
          if (Math.abs(dx) > whole.footRx + b.footRx - 2 || Math.abs(dy) > whole.footRy + b.footRy - 2) continue;
          b.x = x;
          b.y = y; // standable beside the low deposit, inside the whole rock's footprint
          inner(live).timeOffset += ROCK_FORM_SECONDS * 0.6;
          inner(live).clearingTimer = 0;
          run(live, 2);
          expect(live.rockAt(i).phase).toBe('whole');
          expect(live.collision.canStand(b.x, b.y, b.footRx, b.footRy)).toBe(true);
          expect(canWalk(live)).toBe(true);
          tested = true;
        }
      if (!tested) inner(live).rocks.delete(i);
    });
    expect(tested).toBe(true);
  });
});
