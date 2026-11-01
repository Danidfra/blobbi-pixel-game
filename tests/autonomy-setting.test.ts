/**
 * P1.3A, MY BLOBBI WANDERS (`src/playground/autonomy.ts`, `Brain.hold`/`stopWalking`/`options.walk`,
 * `LiveWorld.setAutonomy`): after 60 s (default), after 120 s, or off; the delay is continuous inactivity; busy UI
 * holds autonomy and stops an autonomous walk, never the player's own tap-walk or rest; off never walks but still
 * blinks and rests in place; one finger owns the stick.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { LiveWorld, IDLE_INPUT, type LiveInput } from '../src/sim/live-world';
import { findBuildSpot, pressE, run as runSteps } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { TIRED } from '../src/game/care';
import { AutonomyGate, autonomyFor, type Autonomous } from '../src/playground/autonomy';
import { DEFAULT_SETTINGS, GameUI, WANDER_SETTINGS, readSettings, readStoredSettings, settingsRecord } from '../src/ui/game-ui';
import { SettingsScreen } from '../src/ui/screens/settings';
import { TouchControls } from '../src/ui/touch';
import { Gfx } from '../src/ui/gfx';
import { PixelBuffer } from '../src/core/pixel';
import { LOCALES, setLocale, t } from '../src/i18n';

afterEach(() => setLocale('en'));

const STEP = 1 / 60;
/** Seconds of play with no input; returns the farthest the Blobbi got from where it stood. */
function idle(live: LiveWorld, seconds: number, input: Partial<LiveInput> = {}): number {
  const from = { x: live.blobbi.x, y: live.blobbi.y };
  let far = 0;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    live.update(STEP, { ...IDLE_INPUT, ...input, interact: false, plant: false });
    far = Math.max(far, Math.hypot(live.blobbi.x - from.x, live.blobbi.y - from.y));
  }
  return far;
}
/** A world with the player's setting applied and play just started (the gate's first frame holds). */
function playing(wander: (typeof WANDER_SETTINGS)[number], seed = 'turtle-0') {
  const live = new LiveWorld(generateTurtleWorld(seed), 'blobbi-19', 16);
  live.care.energy = 100;
  const gate = new AutonomyGate();
  gate.frame(live, wander, false, false);
  return { live, gate };
}
/** Steps until autonomy walks (wander, inspect or home), at most `seconds`. */
function untilWalking(live: LiveWorld, seconds: number): boolean {
  for (let i = 0; i < seconds * 60; i++) {
    live.update(STEP, IDLE_INPUT);
    if (live.brain.autonomousWalk) return true;
  }
  return false;
}

describe('the setting and its storage', () => {
  it('defaults to after 60 s, and is stored in the same settings record (no new key)', () => {
    expect(DEFAULT_SETTINGS.wander).toBe('after60');
    expect(readSettings(null).wander).toBe('after60');
    const record = settingsRecord({ ...DEFAULT_SETTINGS, wander: 'off' }, false, false);
    expect(record.wander).toBe('off');
    expect(readStoredSettings(JSON.parse(JSON.stringify(record)), DEFAULT_SETTINGS, false).settings.wander).toBe('off');
  });

  it('keeps an explicit saved choice; a record from before P1.3A (or a bad value) gets the default, other settings untouched', () => {
    for (const w of WANDER_SETTINGS) expect(readSettings({ wander: w }).wander).toBe(w);
    const before = { daylight: false, goals: false, sound: false, textSize: 'small', textSizeChosen: true, reducedMotionChosen: false };
    const read = readStoredSettings(before, DEFAULT_SETTINGS, false).settings;
    expect(read).toMatchObject({ daylight: false, goals: false, sound: false, textSize: 'small', wander: 'after60' });
    for (const junk of ['after30', 60, true, null, 'OFF']) expect(readSettings({ wander: junk, sound: false })).toMatchObject({ wander: 'after60', sound: false });
  });

  it('maps to the brain: 60 s or 120 s of inactivity; off never walks (and rests in place after 60 s)', () => {
    expect(autonomyFor('after60')).toEqual({ delay: 60, walk: true });
    expect(autonomyFor('after120')).toEqual({ delay: 120, walk: true });
    expect(autonomyFor('off')).toEqual({ delay: 60, walk: false });
  });
});

describe('inactivity thresholds', () => {
  it('after 60 s: never moves on its own before 60 s of inactivity, and does walk soon after', () => {
    const { live } = playing('after60');
    expect(idle(live, 59.5)).toBe(0);
    expect(live.brain.manualActive).toBe(true);
    expect(untilWalking(live, 40)).toBe(true);
  });

  it('after 120 s: still at 119 s, walking after', () => {
    const { live } = playing('after120');
    expect(idle(live, 119.5)).toBe(0);
    expect(untilWalking(live, 40)).toBe(true);
  });

  it('a world without the setting keeps the brain defaults (5 s), so the simulation tests are unchanged', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-19', 16);
    expect(live.brain.options).toMatchObject({ manualTimeout: 5, walk: true });
  });

  it('the player acting resets the count: a step at 50 s means nothing moves on its own until 110 s', () => {
    const { live, gate } = playing('after60');
    idle(live, 50);
    gate.frame(live, 'after60', false, true); // a press somewhere (a HUD button): no movement, the delay restarts
    expect(idle(live, 59.5)).toBe(0);
    // Movement input does the same through the world itself.
    idle(live, 0.2, { right: true });
    expect(idle(live, 59.5)).toBe(0);
    expect(untilWalking(live, 40)).toBe(true);
  });
});

describe('autonomy off', () => {
  it('never walks in ten minutes, yet breathes and blinks', () => {
    const { live } = playing('off');
    const a = live.blobbi.animator.state;
    let blinks = 0;
    let blinking = false;
    const breaths = new Set<number>();
    const from = { x: live.blobbi.x, y: live.blobbi.y };
    for (let i = 0; i < 60 * 600; i++) {
      live.care.energy = 100; // not tired: this test is about walking
      live.update(STEP, IDLE_INPUT);
      if (a.blinkStart >= 0 && !blinking) blinks++;
      blinking = a.blinkStart >= 0;
      breaths.add(Math.round(a.breathPhase * 4));
      expect(live.brain.autonomousWalk).toBe(false);
    }
    expect({ x: live.blobbi.x, y: live.blobbi.y }).toEqual(from);
    expect(blinks).toBeGreaterThan(10);
    expect(breaths.size).toBeGreaterThan(2);
  });

  it('a tired Blobbi sleeps where it stands (no walk home) and the rest recovers energy', () => {
    const { live } = playing('off');
    live.care.energy = TIRED - 5;
    const from = { x: live.blobbi.x, y: live.blobbi.y };
    let slept = false;
    for (let i = 0; i < 60 * 90 && !slept; i++) {
      live.update(STEP, IDLE_INPUT);
      slept = live.brain.state === 'rest';
    }
    expect(slept).toBe(true);
    expect(live.blobbi.animator.state.sleeping).toBe(true);
    const e0 = live.care.energy;
    idle(live, 20);
    expect(live.care.energy).toBeGreaterThan(e0);
    expect({ x: live.blobbi.x, y: live.blobbi.y }).toEqual(from);
  });

  it("the player's own tap-walk and movement still work", () => {
    const { live } = playing('off');
    const b = live.blobbi;
    const hub = live.world.hubs[0];
    expect(live.walkTo(hub.x + 30, hub.y)).toBe(true);
    expect(idle(live, 5)).toBeGreaterThan(10);
    const x0 = b.x;
    idle(live, 0.5, { left: true });
    expect(b.x).toBeLessThan(x0);
  });
});

describe('menus, dialogs and changing the setting', () => {
  /** A world whose Blobbi is in the middle of an autonomous walk. */
  function walking(wander: 'after60' | 'after120' = 'after60') {
    const p = playing(wander);
    idle(p.live, wander === 'after60' ? 59 : 119);
    expect(untilWalking(p.live, 40)).toBe(true);
    return p;
  }

  it('a menu opening stops an autonomous walk where it is, and nothing moves on its own while it is open or for the delay after', () => {
    const { live, gate } = walking();
    gate.frame(live, 'after60', true, false); // the menu opened (the world does not step while it is open)
    expect(live.brain.autonomousWalk).toBe(false);
    expect(live.brain.path).toEqual([]);
    gate.frame(live, 'after60', true, false);
    gate.frame(live, 'after60', false, false); // the frame it closed
    expect(idle(live, 59.5)).toBe(0);
  });

  it("a menu never cancels the player's own tap-walk or rest", () => {
    const { live, gate } = playing('after60');
    const hub = live.world.hubs[0];
    expect(live.walkTo(hub.x + 40, hub.y)).toBe(true);
    gate.frame(live, 'after60', true, false);
    expect(live.brain.state).toBe('goto');
    expect(idle(live, 5)).toBeGreaterThan(10);
    live.rest();
    gate.frame(live, 'after60', true, false);
    expect(['rest', 'to-shelter']).toContain(live.brain.state);
  });

  it('turning it off mid-walk stops the walk at once; nothing walks after', () => {
    const { live, gate } = walking();
    gate.frame(live, 'off', false, false);
    expect(live.brain.autonomousWalk).toBe(false);
    live.care.energy = 100;
    expect(idle(live, 120)).toBe(0);
  });

  it('a longer delay chosen while one is counting applies to the same count (60 → 120 at 50 s: still at 110 s)', () => {
    const { live, gate } = playing('after60');
    idle(live, 50);
    gate.frame(live, 'after120', false, false);
    expect(idle(live, 69)).toBe(0);
    expect(untilWalking(live, 40)).toBe(true);
  });

  it('busy UI holds every frame, and the frame after', () => {
    const calls: string[] = [];
    const w: Autonomous = { setAutonomy: () => calls.push('set'), holdAutonomy: () => calls.push('hold') };
    const gate = new AutonomyGate();
    const held = [gate.frame(w, 'after60', false, false), gate.frame(w, 'after60', false, false), gate.frame(w, 'after60', true, false), gate.frame(w, 'after60', false, false), gate.frame(w, 'after60', false, false)];
    expect(held).toEqual([true, false, true, true, false]);
  });
});

describe('background, resume and scene changes', () => {
  it('back from the background (or the title, an intro) and in a new world, the delay starts again', () => {
    const { live, gate } = playing('after60');
    idle(live, 55);
    gate.pause(); // hidden, then shown again
    expect(gate.frame(live, 'after60', false, false)).toBe(true);
    expect(idle(live, 59.5)).toBe(0);
    const other = new LiveWorld(generateTurtleWorld('turtle-3'), 'blobbi-19', 16);
    expect(gate.frame(other, 'after60', false, false)).toBe(true);
    expect(other.brain.options).toMatchObject({ manualTimeout: 60, walk: true });
    expect(other.brain.manualActive).toBe(true);
  });

  it("the setting reaches a room's brain and a rebuilt island brain; walking off holds indoors too", () => {
    const world = generateWhaleWorld('island-style-1', { carrierSeed: 'whale-s', generatedHouse: false });
    const live = new LiveWorld(world, 'blobbi-9', 16);
    live.brain.enabled = false;
    live.inventory.add(ITEMS.wood.id, 30);
    live.inventory.add(ITEMS.stone.id, 20);
    live.objectives.completed.materials = 0;
    findBuildSpot(live, 'shelter', live.world.hubs[0], 160, 3);
    live.setBuildMode('shelter');
    pressE(live);
    runSteps(live, 60 * 26); // building the shelter rebuilds the island brain
    live.brain.enabled = true;
    live.setAutonomy(autonomyFor('off'));
    expect(live.brain.options).toMatchObject({ manualTimeout: 60, walk: false });
    expect(live.enterInterior(live.home()!)).toBe(true);
    expect(live.inside).toBe(true);
    expect(live.brain.options).toMatchObject({ manualTimeout: 60, walk: false });
    live.setAutonomy(autonomyFor('after120'));
    expect(live.brain.options).toMatchObject({ manualTimeout: 120, walk: true });
    live.exitInterior();
    expect(live.brain.options).toMatchObject({ manualTimeout: 120, walk: true });
  });
});

describe('one finger owns the stick', () => {
  it('a second finger neither takes the stick over nor walks on release; the first keeps steering', () => {
    const touch = new TouchControls(() => 1);
    expect(touch.down(1, 100, 100, true)).toBe('stick');
    touch.move(1, 130, 100);
    expect(touch.down(2, 200, 60, true)).toBe('ignored');
    expect(touch.stick?.id).toBe(1);
    touch.move(2, 200, 20); // the second finger's drag changes nothing
    expect(touch.directions()).toMatchObject({ right: true, up: false });
    expect(touch.up(2)).toBe(false); // not a tap: nothing walks
    expect(touch.stick?.id).toBe(1);
    expect(touch.up(1)).toBe(false); // it was a drag
    expect(touch.down(3, 50, 50, true)).toBe('stick'); // free again
  });

  it('a second finger can still press USE', () => {
    const touch = new TouchControls(() => 1);
    touch.enabled = true;
    touch.draw(new PixelBuffer(320, 180), 0);
    const b = touch.buttonBox!;
    expect(touch.down(1, 40, 120, true)).toBe('stick');
    expect(touch.down(2, b.x + b.w / 2, b.y + b.h / 2, true)).toBe('use');
    expect(touch.stick?.id).toBe(1);
  });
});

describe('the SETTINGS row', () => {
  const row = (screen: SettingsScreen, ui: GameUI) => screen.rows(ui).find((r) => r.label.startsWith(t('settings.wander', { when: '' }).trim().replace(/[:：]$/, '')))!;

  it('cycles after 60 s → after 120 s → off, LEFT goes back, and every change is stored', () => {
    const ui = new GameUI(() => null, () => ({}) as never);
    const screen = new SettingsScreen();
    let saved = 0;
    screen.onChange = () => saved++;
    expect(row(screen, ui).label).toBe('Wanders alone: After 60 s');
    row(screen, ui).run();
    expect(ui.settings.wander).toBe('after120');
    row(screen, ui).run();
    expect(ui.settings.wander).toBe('off');
    expect(row(screen, ui).label).toBe('Wanders alone: Off');
    row(screen, ui).adjust!(-1);
    expect(ui.settings.wander).toBe('after120');
    expect(saved).toBe(3);
  });

  it('is translated, and fits its button in every language', () => {
    const g = new Gfx(304, 184);
    for (const l of LOCALES) {
      setLocale(l.id);
      for (const w of WANDER_SETTINGS) {
        const label = t('settings.wander', { when: t(`settings.wander.${w}`) });
        expect(label).not.toContain('settings.');
        // The row is 150 px wide with its < > arrows inside.
        expect(g.measure(label.toUpperCase())).toBeLessThanOrEqual(150 - 16);
      }
    }
  });
});
