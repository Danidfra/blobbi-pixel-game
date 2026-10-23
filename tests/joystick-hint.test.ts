/**
 * P1.1: the joystick hint (`src/ui/joystick-hint.ts`, drawn by `TouchControls.drawHint`). A touch player sees a
 * resting stick bottom left before any touch; a new one sees its knob nudge until movement is touched; walking with
 * the stick makes it learned (remembered in this browser), fades it to a faint ring, and a while without moving
 * brings it gently back without nudging again. It is only a picture: the stick and the keys walk exactly as before.
 * The page's side (touch mode from the start, cancel on blur, the menus) is checked in scripts/touch-hint-browser.ts.
 */
import { describe, expect, it } from 'vitest';
import { HINT, JoystickHint, TOUCH_HINT_KEY, demoKnob, hintAnchor, readLearned, writeLearned, type HintFrame } from '../src/ui/joystick-hint';
import { DEAD_ZONE, STICK_RADIUS, TouchControls } from '../src/ui/touch';
import { PixelBuffer } from '../src/core/pixel';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, type LiveInput } from '../src/sim/live-world';
import { paletteFor } from '../src/world/generate';
import { GameUI } from '../src/ui/game-ui';

const frame = (now: number, f: Partial<HintFrame> = {}): HintFrame => ({ now, stickActive: false, moving: false, stickWalkedPx: 0, reducedMotion: false, ...f });
/** Run the hint at 60 frames a second from `from` to `to` (seconds); returns the levels seen. */
function run(h: JoystickHint, from: number, to: number, f: Partial<HintFrame> = {}): number[] {
  const levels: number[] = [];
  for (let t = from; t <= to + 1e-9; t += 1 / 60) levels.push(h.update(frame(t, f)).alpha);
  return levels;
}
const memoryStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('the joystick hint for a new touch player', () => {
  it('fades in to its full look before any touch, nudging and with arrows', () => {
    const h = new JoystickHint(false);
    const first = h.update(frame(0));
    expect(first.alpha).toBe(0); // fades in, never pops
    const levels = run(h, 1 / 60, HINT.FADE_S + 0.1);
    expect(levels.at(-1)).toBe(HINT.DISCOVER_ALPHA);
    expect(h.demoing(false)).toBe(true);
    const look = h.update(frame(HINT.DEMO_DELAY_S + HINT.DEMO_CYCLE_S * 0.3));
    expect(look.arrows).toBe(true);
    expect(Math.hypot(look.knob.x, look.knob.y)).toBeCloseTo(HINT.DEMO_REACH, 5); // nudged out, holding
  });

  it('nudges one way a cycle (right, up, left, down), out and back, and rests between', () => {
    expect(demoKnob(0)).toEqual({ x: 0, y: 0 });
    expect(demoKnob(HINT.DEMO_DELAY_S - 0.01)).toEqual({ x: 0, y: 0 });
    const at = (cycle: number, p: number) => demoKnob(HINT.DEMO_DELAY_S + HINT.DEMO_CYCLE_S * (cycle + p));
    expect(at(0, 0.3).x).toBeCloseTo(HINT.DEMO_REACH, 5);
    expect(at(1, 0.3).y).toBeCloseTo(-HINT.DEMO_REACH, 5); // up (screen y down)
    expect(at(2, 0.3).x).toBeCloseTo(-HINT.DEMO_REACH, 5);
    expect(at(3, 0.3).y).toBeCloseTo(HINT.DEMO_REACH, 5);
    expect(at(0, 0.8)).toEqual({ x: 0, y: 0 }); // resting
    // Small steps only: the knob glides (no jump between two frames at 60 Hz)
    let worst = 0;
    for (let t = 0; t < HINT.DEMO_DELAY_S + 4 * HINT.DEMO_CYCLE_S; t += 1 / 60) {
      const a = demoKnob(t);
      const b = demoKnob(t + 1 / 60);
      worst = Math.max(worst, Math.hypot(b.x - a.x, b.y - a.y));
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('with reduced motion the knob never moves; the arrows still say "any way"', () => {
    const h = new JoystickHint(false);
    for (let t = 0; t < 12; t += 0.1) {
      const look = h.update(frame(t, { reducedMotion: true }));
      expect(look.knob).toEqual({ x: 0, y: 0 });
    }
    expect(h.update(frame(12, { reducedMotion: true })).arrows).toBe(true);
    expect(h.demoing(true)).toBe(false);
  });

  it('stops nudging the moment movement is touched, and steps aside while the stick is held', () => {
    const h = new JoystickHint(false);
    run(h, 0, 2);
    const held = h.update(frame(2.1, { stickActive: true }));
    expect(held.alpha).toBe(0);
    expect(h.demoing(false)).toBe(false);
    // Released without walking far enough: still teaching (arrows), but no more nudging
    const after = h.update(frame(2.2));
    expect(after.knob).toEqual({ x: 0, y: 0 });
    expect(after.arrows).toBe(true);
    expect(h.learned).toBe(false);
  });

  it('a key or a tap to walk also stops the nudging, but only walking with the stick teaches it', () => {
    const h = new JoystickHint(false);
    run(h, 0, 2);
    h.update(frame(2.1, { moving: true }));
    expect(h.demoing(false)).toBe(false);
    expect(h.learned).toBe(false);
  });
});

describe('learning the stick', () => {
  it('counts the world pixels the stick walked; at LEARN_PX it is learned, once', () => {
    const h = new JoystickHint(false);
    run(h, 0, 1);
    let learnedAt = -1;
    let reports = 0;
    for (let i = 0; i < 40; i++) {
      h.update(frame(1 + i / 60, { stickActive: true, moving: true, stickWalkedPx: 0.7 }));
      if (h.justLearned) {
        reports++;
        if (learnedAt < 0) learnedAt = i;
      }
    }
    expect(h.learned).toBe(true);
    expect(reports).toBe(1);
    expect((learnedAt + 1) * 0.7).toBeGreaterThanOrEqual(HINT.LEARN_PX);
  });

  it('then fades to the faint level, smoothly, and comes back gently after a while without moving', () => {
    const h = new JoystickHint(false);
    run(h, 0, 1);
    for (let i = 0; i < 30; i++) h.update(frame(1 + i / 60, { stickActive: true, moving: true, stickWalkedPx: 1 }));
    const fade = run(h, 1.5, 1.5 + HINT.FADE_S + 0.1);
    expect(fade.at(-1)).toBeCloseTo(HINT.LEARNED_ALPHA, 5);
    const back = run(h, 1.5 + HINT.FADE_S + 0.2, 1.5 + HINT.IDLE_AFTER_S + HINT.FADE_S + 0.5);
    expect(back.at(-1)).toBeCloseTo(HINT.IDLE_ALPHA, 5);
    // Never a flash: no step larger than one frame's share of a fade, and it only rises
    const steps = [...fade, ...back].slice(1).map((v, i, a) => Math.abs(v - (i ? a[i - 1] : fade[0])));
    expect(Math.max(...steps)).toBeLessThanOrEqual(1 / 60 / HINT.FADE_S + 1e-9);
    expect(back.every((v, i) => i === 0 || v >= back[i - 1] - 1e-9)).toBe(true);
    // ...and it does not nudge again, though it still teaches nothing new (no arrows)
    const look = h.update(frame(40));
    expect(look.knob).toEqual({ x: 0, y: 0 });
    expect(look.arrows).toBe(false);
    expect(h.demoing(false)).toBe(false);
    // Moving again: faint again
    h.update(frame(41, { moving: true }));
    expect(run(h, 41 + 1 / 60, 42.5).at(-1)).toBeCloseTo(HINT.LEARNED_ALPHA, 5);
  });

  it('a returning player (learned in this browser) starts quiet: no fade-in, no nudging, no arrows', () => {
    const h = new JoystickHint(true);
    const look = h.update(frame(0));
    expect(look.alpha).toBe(HINT.IDLE_ALPHA); // nothing moved yet this session: the gentle resting level
    expect(look.knob).toEqual({ x: 0, y: 0 });
    expect(look.arrows).toBe(false);
    expect(h.demoing(false)).toBe(false);
  });

  it('remembers learned in a small local record, and reads anything broken as not learned', () => {
    const store = memoryStore();
    expect(readLearned(store)).toBe(false);
    writeLearned(store);
    expect(JSON.parse(store.m.get(TOUCH_HINT_KEY)!)).toEqual({ version: 1, learned: true });
    expect(readLearned(store)).toBe(true);
    expect(readLearned(memoryStore({ [TOUCH_HINT_KEY]: 'not json' }))).toBe(false);
    expect(readLearned(memoryStore({ [TOUCH_HINT_KEY]: '{"learned":"yes"}' }))).toBe(false);
    expect(readLearned(null)).toBe(false);
    const refusing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readLearned(refusing)).toBe(false);
    expect(() => writeLearned(refusing)).not.toThrow();
    expect(TOUCH_HINT_KEY).toBe('blobbi-pixel-lab:touch-hint');
  });
});

describe('where the hint rests', () => {
  const none = { top: 0, right: 0, bottom: 0, left: 0 };
  it('bottom left, inside the safe area', () => {
    const r = STICK_RADIUS * 2;
    const at = hintAnchor(915, 412, r, 12, none, 0, [])!;
    expect(at.x).toBe(12 + r + 2);
    expect(at.y).toBe(412 - 12 - r - 2);
    const notch = hintAnchor(915, 412, r, 12, { top: 0, right: 0, bottom: 21, left: 47 }, 0, [])!;
    expect(notch.x - at.x).toBe(47);
    expect(at.y - notch.y).toBe(21);
  });

  it('climbs above whatever is already there (the camera indicator, the hotbar, a tip), in turn', () => {
    const r = 44;
    const indicator = { x: 4, y: 390, w: 178, h: 18 };
    const hotbar = { x: 4, y: 300, w: 120, h: 40 };
    const at = hintAnchor(915, 412, r, 12, none, 0, [indicator, hotbar])!;
    expect(at.y + r + 2).toBeLessThanOrEqual(hotbar.y - 12);
    // Something off to the right is no reason to move
    expect(hintAnchor(915, 412, r, 12, none, 0, [{ x: 400, y: 300, w: 300, h: 100 }])!.y).toBe(412 - 12 - r - 2);
  });

  it('is not drawn when there is no clear spot (a short screen, or under the status card)', () => {
    expect(hintAnchor(300, 100, 44, 12, none, 0, [])).toBeNull();
    expect(hintAnchor(915, 412, 44, 12, none, 0, [{ x: 0, y: 150, w: 200, h: 262 }], 120)).toBeNull();
  });
});

describe('the hint as drawn', () => {
  const lit = (b: PixelBuffer) => {
    const pts: [number, number][] = [];
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.get(x, y) !== 0xff000000) pts.push([x, y]);
    return pts;
  };
  const black = () => {
    const b = new PixelBuffer(200, 200);
    b.data.fill(0xff000000);
    return b;
  };

  it('stays inside its ring, nothing at zero, the knob where the nudge says, arrows only while teaching', () => {
    const t = new TouchControls(() => 2);
    const r = STICK_RADIUS * 2;
    const none = black();
    t.drawHint(none, 100, 100, { alpha: 0, knob: { x: 0, y: 0 }, arrows: true });
    expect(lit(none)).toEqual([]);
    const still = black();
    t.drawHint(still, 100, 100, { alpha: 1, knob: { x: 0, y: 0 }, arrows: false });
    const pts = lit(still);
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every(([x, y]) => Math.hypot(x + 0.5 - 100, y + 0.5 - 100) <= r + 1.5)).toBe(true);
    const nudged = black();
    t.drawHint(nudged, 100, 100, { alpha: 1, knob: { x: 0.5, y: 0 }, arrows: false });
    // The knob's light: its brightest pixels sit right of the centre now
    const bright = (b: PixelBuffer) => lit(b).filter(([x, y]) => (b.get(x, y) & 0xff) > 0xa0); // the knob (0.7), not the ring (0.6)
    const cx = (b: PixelBuffer) => bright(b).reduce((n, [x]) => n + x, 0) / bright(b).length;
    expect(cx(nudged) - cx(still)).toBeGreaterThan(r * 0.4);
    const arrows = black();
    t.drawHint(arrows, 100, 100, { alpha: 1, knob: { x: 0, y: 0 }, arrows: true });
    const light = (b: PixelBuffer) => lit(b).reduce((n, [x, y]) => n + (b.get(x, y) & 0xff), 0);
    expect(light(arrows)).toBeGreaterThan(light(still)); // the arrows lie inside the disc: more light, same area
  });

  it('is translucent: the world shows through even at its fullest', () => {
    const t = new TouchControls(() => 2);
    const b = black();
    t.drawHint(b, 100, 100, { alpha: 1, knob: { x: 0, y: 0 }, arrows: true });
    const max = Math.max(...lit(b).map(([x, y]) => b.get(x, y) & 0xff));
    expect(max).toBeLessThan(0xf4); // never the stick's opaque ink
  });
});

describe('the touch stick ends cleanly', () => {
  it('a cancelled touch, a lost focus or a menu end the stick, never as a tap to walk', () => {
    const t = new TouchControls(() => 2);
    t.down(1, 100, 100, true);
    t.cancel(1);
    expect(t.stick).toBeNull();
    expect(t.up(1)).toBe(false); // the lift that follows is not a tap
    t.down(2, 100, 100, true);
    t.move(2, 100 + DEAD_ZONE * 2 + 30, 100);
    t.cancel(9); // another pointer: this stick stays
    expect(t.directions().right).toBe(true);
    t.cancel(); // the page lost focus: any stick
    expect(t.stick).toBeNull();
    expect(t.directions()).toEqual({ up: false, down: false, left: false, right: false });
  });

  it('a second finger takes over; the first one lifting later does nothing', () => {
    const t = new TouchControls(() => 2);
    t.down(1, 100, 100, true);
    t.down(2, 300, 100, true);
    expect(t.up(1)).toBe(false);
    expect(t.stick?.id).toBe(2);
  });
});

describe('the menus the hint keeps clear of', () => {
  it('lists the menu bar, and the mode bar while building (bottom left)', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const ui = new GameUI(() => live, () => paletteFor('cozy'));
    const screen = new PixelBuffer(960, 540);
    ui.render(screen, 0);
    expect(ui.modeBarBox).toBeNull();
    expect(ui.occupied.length).toBeGreaterThan(0);
    live.setBuildMode('shelter');
    ui.render(screen, 0);
    expect(ui.modeBarBox).not.toBeNull();
    expect(ui.modeBarBox!.x).toBeLessThan(100);
    expect(ui.occupied).toContainEqual(ui.modeBarBox);
    const at = hintAnchor(960, 540, 44, 12, { top: 0, right: 0, bottom: 0, left: 0 }, 0, ui.occupied);
    if (at) for (const b of ui.occupied) expect(at.x - 46 < b.x + b.w && b.x < at.x + 46 && at.y - 46 < b.y + b.h && b.y < at.y + 46).toBe(false);
  });
});

describe('movement is unchanged', () => {
  it('the stick walks the Blobbi exactly as the same keys do', () => {
    const walk = (input: (i: number) => LiveInput) => {
      const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
      live.brain.enabled = false;
      for (let i = 0; i < 90; i++) live.update(1 / 60, input(i));
      return { x: live.blobbi.x, y: live.blobbi.y };
    };
    const t = new TouchControls(() => 2);
    t.down(1, 200, 200, true);
    t.move(1, 240, 160); // up and right
    const stick = t.directions();
    expect(stick).toEqual({ up: true, down: false, left: false, right: true });
    const byStick = walk(() => ({ ...t.directions(), interact: false, plant: false }));
    const byKeys = walk(() => ({ up: true, down: false, left: false, right: true, interact: false, plant: false }));
    expect(byStick).toEqual(byKeys);
    expect(Math.hypot(byStick.x - walk(() => ({ up: false, down: false, left: false, right: false, interact: false, plant: false })).x, 1)).toBeGreaterThan(1);
  });
});
