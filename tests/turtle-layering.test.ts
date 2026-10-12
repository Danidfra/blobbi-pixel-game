/**
 * M9: the turtle's flippers emerge from UNDER its shell. The paddling flippers never change a pixel where the turtle's
 * body (shell, rim, neck, tail) is drawn, at any paddle phase, on Variant B, Variant S and grown islands; the static
 * underlay draws them before the body.
 */
import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { growWorld } from '../src/world/growth';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { turtleBodyForWorld, turtleUnderlay } from '../src/render/compose';
import type { WorldDescription } from '../src/world/types';

function check(world: WorldDescription) {
  const live = new LiveWorld(world, 'blobbi-9', 16);
  const r = new LiveRenderer(live);
  const body = turtleBodyForWorld(world);
  const { width, height } = world.options;
  for (const time of [0, 1.1, 2.4, 3.3, 5.0]) {
    const withF = r.render(width, height, 0, 0, time, { ...DEFAULT_LIVE_OPTIONS, animateWind: true }).clone();
    const keep = body.flippers.splice(0);
    const without = r.render(width, height, 0, 0, time, { ...DEFAULT_LIVE_OPTIONS, animateWind: true }).clone();
    body.flippers.push(...keep);
    let over = 0;
    let drawn = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (withF.get(x, y) === without.get(x, y)) continue;
        drawn++;
        if (body.buffer.get(x, y) >>> 24) over++;
      }
    expect(drawn, `flippers visible at ${time}`).toBeGreaterThan(200);
    expect(over, `flipper pixels over the shell at ${time}`).toBe(0);
  }
  // The static picture: no flipper pixel over the body either.
  const under = turtleUnderlay(world, { head: false, flippers: true })!;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (body.buffer.get(x, y) >>> 24) expect(under.get(x, y)).toBe(body.buffer.get(x, y));
}

describe('turtle flippers emerge from under the shell', () => {
  it('Variant B (worlds made before M8)', () => check(generateTurtleWorld('turtle-0')));
  it('Variant S (new worlds)', () => check(generateTurtleWorld('island-layer', { turtleSeed: 'tl', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false })));
  it('a grown island (stage 3)', () => check(growWorld(generateTurtleWorld('island-layer', { turtleSeed: 'tl', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false }), 3)));
});
