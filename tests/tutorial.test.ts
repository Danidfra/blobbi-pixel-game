/**
 * M8 contextual tutorial: one short tip at a time, done by doing (also before the tip shows), skippable, saved with
 * the island, worded for keys or touch, never blocking play.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { memoryStore, saveKey } from '../src/game/persistence';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { TUTORIAL_STEPS, TIP_PAUSE } from '../src/game/tutorial';
import { GameUI } from '../src/ui/game-ui';
import { InventoryScreen } from '../src/ui/screens/inventory';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { gather, run } from '../src/dev/scripted-play';

const world = () => generateMantaWorld('island-tips-1', { carrierSeed: 'manta-t', generatedHouse: false });
const fresh = (store = memoryStore()) => {
  const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  return live;
};

describe('the tutorial', () => {
  it('teaches the twelve basics (and two more) in order, one tip at a time', () => {
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    for (const id of ['move', 'blobbi', 'gather', 'bag', 'craft', 'tool', 'build', 'enter', 'furnish', 'farm', 'cook', 'carrier']) expect(ids).toContain(id);
    for (const s of TUTORIAL_STEPS) {
      expect(s.keys.length).toBeLessThan(100);
      expect(s.touch.length).toBeLessThan(100);
      expect(s.touch).not.toMatch(/\bpress [A-Z]\b/); // touch words never ask for a key
    }
    const live = fresh();
    expect(live.tutorialTip()?.id).toBe('move');
  });

  it('walking finishes the first step; the next tip waits a moment', () => {
    const live = fresh();
    for (let i = 0; i < 90; i++) live.update(1 / 60, { ...IDLE_INPUT, left: i < 45, down: i >= 45 });
    expect(live.tutorial.done).toContain('move');
    expect(live.tutorialTip()).toBeNull(); // the pause after a step
    run(live, Math.ceil(TIP_PAUSE * 60) + 2);
    expect(live.tutorialTip()?.id).toBe('blobbi');
  });

  it('actions done before their tip count (picking things up skips ahead)', () => {
    const live = fresh();
    gather(live, ['stick'], () => live.tally.collected >= 1);
    live.pet();
    run(live, Math.ceil(TIP_PAUSE * 60) + 4);
    expect(live.tutorial.done).toEqual(expect.arrayContaining(['move', 'blobbi', 'gather']));
    expect(live.tutorialTip()?.id).toBe('bag');
    // Opening the bag (keyboard or a tap on BAG) is the next step.
    const ui = new GameUI(() => live, () => paletteFor('cozy'));
    ui.register(new InventoryScreen());
    ui.handleKey('KeyI');
    ui.handleKey('Escape');
    run(live, 2);
    expect(live.tutorial.done).toContain('bag');
  });

  it('SKIP TIPS turns them off for the island (saved); settings turn them on again', () => {
    const store = memoryStore();
    const live = fresh(store);
    const ui = new GameUI(() => live, () => paletteFor('cozy'));
    ui.touchMode = true;
    const screen = new PixelBuffer(640, 360);
    ui.render(screen, 0);
    const skip = ui.regions.at(-1)!; // the tip's SKIP TIPS button is drawn last
    ui.handlePointer(skip.x + 2, skip.y + 2);
    expect(live.tutorial.skipped).toBe(true);
    expect(live.tutorialTip()).toBeNull();
    expect(JSON.parse(store.get(saveKey(live.identity))!).tutorial.skipped).toBe(true);
    const again = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(again.tutorialTip()).toBeNull();
    again.setTips(true);
    expect(again.tutorialTip()?.id).toBe('move');
  });

  it('a tip never stops play: the world steps and the player moves while it shows', () => {
    const live = fresh();
    const x = live.blobbi.x;
    expect(live.tutorialTip()).not.toBeNull();
    for (let i = 0; i < 20; i++) live.update(1 / 60, { ...IDLE_INPUT, left: true });
    expect(live.blobbi.x).not.toBe(x);
  });

  it('touch wording on a touch screen, key wording otherwise', () => {
    const live = fresh();
    const tip = live.tutorialTip()!;
    expect(tip.touch).not.toBe(tip.keys);
    expect(tip.touch).toMatch(/drag|tap/i);
  });
});
