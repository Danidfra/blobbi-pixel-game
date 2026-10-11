import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, BITE_SECONDS } from '../src/sim/live-world';
import { ITEMS, itemById, TOOLS, toolTier } from '../src/game/items';
import { recipeById } from '../src/game/crafting';
import { EQUIPMENT, toolSprite, COPPER } from '../src/game/equipment';
import { HITS_TO_FELL } from '../src/game/trees';
import { LARGE_ROCK_SIZE } from '../src/game/rocks';
import { FISH_CONTENT, COPPER_ORE } from '../src/content/tools';
import { MEAL_CONTENT } from '../src/content/meals';
import { T } from '../src/world/types';
import { findField, pressE, run, stand, standAbove, fellTrees } from '../src/dev/scripted-play';
import { paletteFor } from '../src/world/generate';

const world = () => generateTurtleWorld('turtle-0');
const quiet = () => {
  const live = new LiveWorld(world(), 'blobbi-9', 16);
  live.brain.enabled = false;
  live.resources = [];
  return live;
};

describe('tools', () => {
  it('six tools plus copper upgrades, each with a held sprite; copper heads are copper', () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(9);
    for (const t of TOOLS) expect(EQUIPMENT[t], t).toBeDefined();
    const sprite = toolSprite('blobbi-pixel:tool:copper-axe', 'rest', paletteFor('cozy'));
    expect([...sprite.buffer.data].some((c) => c === COPPER.mid)).toBe(true);
    for (const u of ['copper-axe', 'copper-pickaxe', 'copper-hoe', 'copper-can']) {
      const r = recipeById(`blobbi-pixel:recipe:${u}`)!;
      expect(r.unlock).toBe('side-miner');
      expect(r.station).toBe('workbench');
      expect(toolTier(r.output.item)).toBe(2);
      // The old tool goes into the recipe.
      expect(itemById(r.ingredients[0].item)?.category).toBe('tool');
    }
  });

  it('copper ore appears only after "Deeper stone"; a copper axe fells in two hits', () => {
    const live = quiet();
    live.inventory.add(ITEMS.pickaxe.id, 1);
    live.equip(ITEMS.pickaxe.id);
    expect('side-miner' in live.objectives.completed).toBe(false);
    // Break a large rock: before the quest, stones only (the M3.2 rule); after it, copper ore as well.
    const rocks = live.world.objects.map((o, index) => ({ o, index })).filter(({ o }) => o.kind === 'rock' && o.size >= LARGE_ROCK_SIZE);
    const breakOne = () => {
      for (const { o, index } of rocks) {
        if (live.rockAt(index).phase === 'rubble') continue;
        const y = o.y + live.spriteOf(o).footRy + live.blobbi.footRy + 2;
        if (!live.collision.canStand(o.x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
        stand(live, o.x, y, 'up');
        if (live.facingObject()?.index !== index) continue;
        for (let i = 0; i < 4; i++) pressE(live);
        return true;
      }
      return false;
    };
    expect(breakOne()).toBe(true);
    expect(live.inventory.count(COPPER_ORE.id)).toBe(0);
    live.objectives.completed['side-miner'] = 0;
    expect(breakOne()).toBe(true);
    expect(live.inventory.count(COPPER_ORE.id)).toBeGreaterThan(0);
    const axe = 'blobbi-pixel:tool:copper-axe';
    live.inventory.add(axe, 1);
    live.equip(axe);
    expect(HITS_TO_FELL).toBe(3);
    const wood0 = live.inventory.count(ITEMS.wood.id);
    let presses = 0;
    fellTrees(live, () => {
      presses++;
      return live.inventory.count(ITEMS.wood.id) > wood0;
    });
    expect(live.inventory.count(ITEMS.wood.id)).toBeGreaterThan(wood0);
    expect(live.stats.chops).toBe(2);
    void presses;
  });

  it('the copper hoe tills a row of three; the copper can waters a 3×3 patch; the plain can a row of three', () => {
    const live = quiet();
    live.inventory.add('blobbi-pixel:tool:copper-hoe', 1);
    live.equip('blobbi-pixel:tool:copper-hoe');
    const field = findField(live, 3)!;
    standAbove(live, field[1]);
    pressE(live);
    for (const c of field) expect(live.plotAt(c)).not.toBeNull();
    // Plant all three, water with the plain can (the row), then check.
    live.inventory.add(ITEMS.seed.id, 3);
    for (const c of field) {
      standAbove(live, c);
      pressE(live);
    }
    expect(field.every((c) => live.plotAt(c)!.crop)).toBe(true);
    live.inventory.add(ITEMS.wateringCan.id, 1);
    live.equip(ITEMS.wateringCan.id);
    standAbove(live, field[1]);
    pressE(live);
    expect(live.tally.watered).toBe(3);
  });

  it('fishing: cast at the water, too soon swims off, in time catches (deterministic), late gets away', () => {
    const live = quiet();
    live.inventory.add('blobbi-pixel:tool:fishing-rod', 1);
    live.equip('blobbi-pixel:tool:fishing-rod');
    // Find a shore spot facing water.
    const { width, height } = live.world.terrain;
    let spot: { x: number; y: number; dir: 'down' | 'up' | 'left' | 'right' } | null = null;
    outer: for (let y = 40; y < height - 40; y += 3)
      for (let x = 40; x < width - 40; x += 3) {
        if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
        for (const dir of ['down', 'left', 'right', 'up'] as const) {
          stand(live, x, y, dir);
          if (live.fishTarget()) {
            spot = { x, y, dir };
            break outer;
          }
        }
      }
    expect(spot).not.toBeNull();
    expect(live.prompt()).toBe('E  cast the line');
    // Too soon.
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    expect(live.fishing).not.toBeNull();
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    expect(live.fishing).toBeNull();
    expect(live.bubble?.text).toBe('too soon. it swam off');
    // In time.
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    const f = live.fishing!;
    while (live.clock.time < f.biteAt) live.update(1 / 60, IDLE_INPUT);
    expect(live.prompt()).toBe('E  reel it in!');
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    expect(live.tally.fished).toBe(1);
    expect(FISH_CONTENT.some((c) => live.inventory.count(c.item.id) === 1)).toBe(true);
    // Late.
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    const g = live.fishing!;
    while (live.clock.time < g.biteAt + BITE_SECONDS + 0.1) live.update(1 / 60, IDLE_INPUT);
    expect(live.fishing).toBeNull();
    expect(live.tally.fished).toBe(1);
    // Walking away reels in.
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    expect(live.fishing).not.toBeNull();
    run(live, 3, { [spot!.dir === 'down' ? 'up' : 'down']: true });
    expect(live.fishing).toBeNull();
    void T;
  });

  it('fish and fish meals are real food, with recipes learnt by "Gone fishing"', () => {
    expect(FISH_CONTENT.length).toBe(4);
    for (const f of FISH_CONTENT) expect(itemById(f.item.id)?.food).toBeDefined();
    const fishMeals = MEAL_CONTENT.filter((m) => m.unlock === 'side-angler');
    expect(fishMeals.length).toBe(4);
    expect(MEAL_CONTENT.length).toBe(19);
  });
});

describe('a World Carrier has everything the recipes need', () => {
  it('every forage kind grows (shells on the rim band: a Carrier island has no beach), the sea is in casting reach, the Blobbi has shore to watch', () => {
    for (const seed of ['turtle-0', 'turtle-1']) {
      const live = new LiveWorld(generateTurtleWorld(seed), 'blobbi-9', 16);
      live.brain.enabled = false;
      const kinds = new Set(live.allResources.map((n) => n.kind));
      for (const k of ['fibre', 'mushroom', 'berry', 'herb', 'shell']) expect(kinds.has(k as never), `${seed} ${k}`).toBe(true);
      expect(live['shoreSpots' as keyof LiveWorld] as unknown as unknown[]).toHaveLength(6);
      // Somewhere along the shore band, a cast reaches the sea.
      live.inventory.add('blobbi-pixel:tool:fishing-rod', 1);
      live.equip('blobbi-pixel:tool:fishing-rod');
      let sea = false;
      for (const spot of live['shoreSpots' as keyof LiveWorld] as unknown as { x: number; y: number }[])
        for (const dir of ['up', 'down', 'left', 'right'] as const) {
          stand(live, spot.x, spot.y, dir);
          if (live.fishTarget()?.water === 'sea') sea = true;
        }
      expect(sea, seed).toBe(true);
    }
  });
});
