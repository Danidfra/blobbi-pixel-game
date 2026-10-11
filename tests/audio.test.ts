import { describe, expect, it } from 'vitest';
import { AudioEngine, DEFAULT_AUDIO, MAX_VOICES, MAX_MUSIC_VOICES } from '../src/audio/engine';
import { GameAudio, ambientMix, moodFor, MOOD_HOLD, type Listening } from '../src/audio/director';
import { SFX } from '../src/audio/sfx';
import { MOODS, MOOD_DEFS, composeBar, density, scaleNote, type Mood } from '../src/audio/music';
import { createRng } from '../src/core/rng';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { GameUI } from '../src/ui/game-ui';
import { SettingsScreen } from '../src/ui/screens/settings';

// ─── A fake Web Audio context: records what is created, never makes a sound ───
class Param {
  value = 0;
  events: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) {
    this.events.push(['set', v, t]);
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (v <= 0) throw new Error('exponential ramp to a non-positive value');
    this.events.push(['exp', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(['lin', v, t]);
  }
  setTargetAtTime(v: number, t: number) {
    this.events.push(['target', v, t]);
    this.value = v;
  }
}
class Node {
  connected: Node[] = [];
  constructor(readonly kind: string) {}
  connect(n: Node) {
    this.connected.push(n);
    return n;
  }
  disconnect() {
    this.connected = [];
  }
}
class FakeCtx {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = new Node('destination');
  nodes: Node[] = [];
  started = 0;
  private make<T extends Node>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  createGain() {
    return this.make(Object.assign(new Node('gain'), { gain: new Param() }));
  }
  createDynamicsCompressor() {
    return this.make(Object.assign(new Node('comp'), { threshold: new Param(), ratio: new Param() }));
  }
  createDelay() {
    return this.make(Object.assign(new Node('delay'), { delayTime: new Param() }));
  }
  createBiquadFilter() {
    return this.make(Object.assign(new Node('filter'), { type: 'lowpass', frequency: new Param(), Q: new Param() }));
  }
  createBuffer(_c: number, len: number) {
    const data = new Float32Array(len);
    return { getChannelData: () => data };
  }
  private source(kind: string) {
    const ctx = this;
    return this.make(
      Object.assign(new Node(kind), {
        frequency: new Param(),
        type: 'sine',
        buffer: null,
        loop: false,
        onended: null,
        start() {
          ctx.started++;
        },
        stop() {},
      }),
    );
  }
  createOscillator() {
    return this.source('osc');
  }
  createBufferSource() {
    return this.source('noise');
  }
  async resume() {
    this.state = 'running';
  }
  async suspend() {
    this.state = 'suspended';
  }
}
const engineWithFake = () => {
  const ctx = new FakeCtx();
  const engine = new AudioEngine(() => ctx as never);
  return { ctx, engine };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('audio engine', () => {
  it('creates nothing before a gesture, and unlocks on one', async () => {
    let made = 0;
    const engine = new AudioEngine(() => {
      made++;
      return new FakeCtx() as never;
    });
    expect(engine.play('pickup')).toBe(false);
    expect(made).toBe(0);
    engine.unlock();
    await flush();
    expect(made).toBe(1);
    expect(engine.unlocked).toBe(true);
    engine.unlock();
    expect(made).toBe(1); // one context, ever
    expect(engine.play('pickup')).toBe(true);
  });

  it('survives a browser without Web Audio', () => {
    const engine = new AudioEngine(() => null);
    engine.unlock();
    expect(engine.unlocked).toBe(false);
    expect(engine.play('pickup')).toBe(false);
    expect(engine.tickMusic()).toBe(0);
    engine.bed('ocean', 1);
  });

  it('anti-spam: an effect waits its gap, and the voice budget is never exceeded', async () => {
    const { ctx, engine } = engineWithFake();
    engine.unlock();
    await flush();
    expect(engine.play('pickup')).toBe(true);
    expect(engine.play('pickup')).toBe(false);
    ctx.currentTime += 1;
    expect(engine.play('pickup')).toBe(true);
    // A burst of different effects at one instant stops at the budget.
    ctx.currentTime += 1;
    let voices = 0;
    for (const name of Object.keys(SFX)) if (engine.play(name)) voices++;
    const sounding = ctx.nodes.filter((n) => n.kind === 'osc' || n.kind === 'noise').length;
    expect(engine.stats.skipped).toBeGreaterThan(0);
    expect(sounding).toBeLessThan(Object.keys(SFX).length * 6);
    expect(voices).toBeGreaterThan(0);
    // Later, the budget is free again.
    ctx.currentTime += 10;
    expect(engine.play('door')).toBe(true);
  });

  it('every effect is soft: no instant attack, a decaying tail, and modest gain', () => {
    const rng = createRng('t');
    for (const [name, recipe] of Object.entries(SFX)) {
      const voices = recipe.voices(rng);
      expect(voices.length, name).toBeGreaterThan(0);
      expect(voices.length, name).toBeLessThanOrEqual(10);
      for (const v of voices) {
        expect(v.dur, name).toBeGreaterThan(0);
        expect(v.dur, name).toBeLessThanOrEqual(3.5);
        expect(v.gain, name).toBeLessThanOrEqual(0.2);
        expect(v.attack, name).toBeGreaterThan(0);
        expect(v.f0, name).toBeGreaterThan(20);
        expect(v.f0, name).toBeLessThan(8000);
      }
    }
  });

  it('covers every sound hook the world emits', () => {
    const hooks = ['place', 'quest', 'pickup', 'door', 'till', 'music', 'hum', 'harvest', 'friend', 'eat', 'discover', 'catch', 'cast', 'bite', 'cook', 'craft', 'store', 'take', 'chop', 'mine', 'plant', 'water', 'pet', 'happy', 'sleep', 'wake', 'fail', 'recipe'];
    for (const ev of ['gather', 'dissolve', 'whoosh', 'gone', 'incoming', 'rebuild', 'arrived', 'cancelled', 'reversed']) hooks.push(`teleport-${ev}`);
    for (const s of ['grass', 'path', 'sand', 'wood', 'shallow']) hooks.push(`step-${s}`);
    for (const h of hooks) expect(SFX[h], h).toBeDefined();
  });

  it('volumes, mute and music-off reach the buses; settings default sensibly', async () => {
    const { ctx, engine } = engineWithFake();
    engine.unlock();
    await flush();
    expect(DEFAULT_AUDIO.muted).toBe(false);
    engine.settings.muted = true;
    engine.applySettings();
    const gains = ctx.nodes.filter((n) => n.kind === 'gain') as unknown as { gain: Param }[];
    expect(gains.some((g) => g.gain.value === 0)).toBe(true);
    expect(engine.play('pickup')).toBe(false); // muted: nothing plays
    engine.settings.muted = false;
    engine.settings.musicOn = false;
    engine.applySettings();
    engine.setMood('day', 's');
    expect(engine.tickMusic()).toBe(0);
  });

  it('suspends and resumes (hidden tab)', async () => {
    const { ctx, engine } = engineWithFake();
    engine.unlock();
    await flush();
    engine.suspend();
    await flush();
    expect(ctx.state).toBe('suspended');
    expect(engine.play('pickup')).toBe(false);
    engine.resume();
    await flush();
    expect(ctx.state).toBe('running');
  });

  it('music schedules ahead, bar by bar, within its own voice budget', async () => {
    const { ctx, engine } = engineWithFake();
    engine.unlock();
    await flush();
    engine.setMood('day', 'seed');
    const first = engine.tickMusic(0.6);
    expect(first).toBeGreaterThan(0);
    expect(engine.tickMusic(0.6)).toBe(0); // nothing new until time moves
    let total = first;
    for (let i = 0; i < 200; i++) {
      ctx.currentTime += 0.05;
      total += engine.tickMusic(0.6);
    }
    expect(total).toBeGreaterThan(first);
    expect(engine.stats.notes).toBe(total);
    // The music budget caps notes sounding together.
    expect(MAX_MUSIC_VOICES).toBeGreaterThan(MAX_VOICES);
  });

  it('beds start silent, follow their level and are created once', async () => {
    const { ctx, engine } = engineWithFake();
    engine.unlock();
    await flush();
    engine.bed('rain', 0);
    expect(engine.bedLevel('rain')).toBeNull(); // not created while not wanted
    engine.bed('rain', 0.5);
    const n = ctx.nodes.length;
    engine.bed('rain', 0.8);
    expect(ctx.nodes.length).toBe(n);
    expect(engine.bedLevel('rain')).toBeCloseTo(0.8);
  });
});

describe('procedural music', () => {
  it('is deterministic per (mood, bar, seed) and varies between bars and seeds', () => {
    for (const mood of MOODS) {
      expect(composeBar(mood, 5, 'a')).toEqual(composeBar(mood, 5, 'a'));
      const bars = Array.from({ length: 16 }, (_, i) => JSON.stringify(composeBar(mood, i, 'a')));
      expect(new Set(bars).size).toBeGreaterThan(8);
    }
    expect(JSON.stringify(composeBar('day', 3, 'a'))).not.toBe(JSON.stringify(composeBar('day', 3, 'b')));
  });

  it('stays in key, in range, inside the bar and gentle', () => {
    for (const mood of MOODS) {
      const def = MOOD_DEFS[mood];
      const pitchClasses = new Set(def.scale.map((s) => (def.root + s) % 12));
      for (let bar = 0; bar < 64; bar++)
        for (const n of composeBar(mood, bar, 'x')) {
          expect(pitchClasses.has(((n.midi % 12) + 12) % 12), `${mood} ${n.midi}`).toBe(true);
          expect(n.midi).toBeGreaterThanOrEqual(24);
          expect(n.midi).toBeLessThanOrEqual(93);
          expect(n.beat).toBeGreaterThanOrEqual(0);
          expect(n.beat).toBeLessThan(4);
          expect(n.vel).toBeLessThanOrEqual(0.8);
        }
    }
  });

  it('has a form: density arcs over 16 bars, a motif returns, notes per bar stay few', () => {
    expect(density(8)).toBeGreaterThan(density(0));
    expect(density(3)).toBeLessThan(density(2));
    const leads = (bar: number) => composeBar('day', bar, 'k').filter((n) => n.instrument === 'lead').map((n) => n.beat);
    // Same cycle, phrase A and A'': the same rhythm when both sing.
    const a = leads(0);
    const again = leads(12);
    if (a.length && again.length) expect(again).toEqual(a);
    for (let bar = 0; bar < 32; bar++) expect(composeBar('special', bar, 'k').length).toBeLessThanOrEqual(20);
  });

  it('scaleNote wraps octaves', () => {
    const def = MOOD_DEFS.day;
    expect(scaleNote(def, 7)).toBe(def.root + 12);
    expect(scaleNote(def, -7)).toBe(def.root - 12);
  });
});

describe('audio director', () => {
  const base: Listening = { inside: false, hour: 10, rain: 0, edge: 0.5, mystery: false, special: false };

  it('chooses the mood from the moment', () => {
    expect(moodFor(base)).toBe('day');
    expect(moodFor({ ...base, hour: 23 })).toBe('night');
    expect(moodFor({ ...base, rain: 0.8 })).toBe('rain');
    expect(moodFor({ ...base, inside: true, rain: 0.8 })).toBe('indoor');
    expect(moodFor({ ...base, mystery: true })).toBe('mystery');
    expect(moodFor({ ...base, special: true, inside: true })).toBe('special');
  });

  it('mixes the ambience: birds by day, crickets by night, rain when it rains, muffled indoors', () => {
    const day = ambientMix(base);
    const night = ambientMix({ ...base, hour: 23 });
    const rain = ambientMix({ ...base, rain: 1 });
    const inside = ambientMix({ ...base, inside: true });
    expect(day.birds).toBeGreaterThan(0);
    expect(day.crickets).toBe(0);
    expect(night.birds).toBe(0);
    expect(night.crickets).toBeGreaterThan(0);
    expect(rain.beds.rain).toBeGreaterThan(0.5);
    expect(rain.birds).toBe(0);
    expect(inside.beds.ocean).toBeLessThan(day.beds.ocean);
    expect(inside.beds.room).toBeGreaterThan(0);
    expect(ambientMix({ ...base, edge: 1 }).beds.ocean).toBeGreaterThan(ambientMix({ ...base, edge: 0 }).beds.ocean);
    expect(ambientMix(base, true).birds).toBeLessThan(day.birds);
  });

  it('plays the world through the engine, holds moods, and never writes to the world', async () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const { ctx, engine } = engineWithFake();
    engine.unlock();
    await flush();
    const audio = new GameAudio(engine);
    const before = JSON.stringify({ x: live.blobbi.x, y: live.blobbi.y, bag: live.inventory.entries(), t: live.clock.time });
    audio.update(live, 1 / 60, ['pickup', 'not-a-sound']);
    expect(engine.stats.played).toBeGreaterThan(0);
    expect(engine.mood).toBe(moodFor(audio.listening(live)));
    expect(JSON.stringify({ x: live.blobbi.x, y: live.blobbi.y, bag: live.inventory.entries(), t: live.clock.time })).toBe(before);
    // A special moment takes over at once, and the mood changes back only after holding.
    audio.update(live, 1 / 60, ['discover']);
    expect(engine.mood).toBe('special');
    ctx.currentTime += 1;
    for (let i = 0; i < 60 * 30; i++) audio.update(live, 1 / 60, []);
    expect(engine.mood).not.toBe('special');
    expect(MOOD_HOLD).toBeGreaterThan(0);
    audio.silence();
    expect(engine.mood).toBeNull();
  });

  it('the world emits footsteps by surface and teleport sounds', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    for (let i = 0; i < 60; i++) live.update(1 / 60, { ...IDLE_INPUT, right: true });
    expect(live.sounds.some((s) => s.startsWith('step-'))).toBe(true);
    live.sounds.length = 0;
    live.leaveBlobbi();
    for (let i = 0; i < 60 * 3; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.sounds).toEqual(expect.arrayContaining(['teleport-gather', 'teleport-dissolve', 'teleport-gone']));
  });
});

describe('sound settings', () => {
  it('the SOUND page changes volumes with LEFT and RIGHT, and toggles music separately', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const ui = new GameUI(() => live, () => null as never);
    const screen = new SettingsScreen();
    ui.register(screen);
    const audio = { ...DEFAULT_AUDIO };
    screen.audio = audio;
    let changes = 0;
    screen.onChange = () => changes++;
    ui.open('settings');
    ui.handleKey('Tab');
    expect(screen.page).toBe('sound');
    ui.handleKey('ArrowRight');
    expect(audio.master).toBeCloseTo(0.9);
    ui.handleKey('ArrowLeft');
    ui.handleKey('ArrowLeft');
    expect(audio.master).toBeCloseTo(0.7);
    ui.handleKey('ArrowDown');
    for (let i = 0; i < 12; i++) ui.handleKey('ArrowLeft');
    expect(audio.music).toBe(0);
    ui.handleKey('ArrowDown');
    ui.handleKey('ArrowDown');
    ui.handleKey('ArrowDown');
    ui.handleKey('Enter');
    expect(audio.musicOn).toBe(false);
    expect(audio.sfx).toBe(DEFAULT_AUDIO.sfx);
    expect(changes).toBeGreaterThan(3);
  });

  it('UI actions make UI sounds', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const ui = new GameUI(() => live, () => null as never);
    ui.register(new SettingsScreen());
    const heard: string[] = [];
    ui.onSound = (n) => heard.push(n);
    ui.open('settings');
    ui.handleKey('ArrowDown');
    ui.handleKey('Enter');
    ui.handleKey('Escape');
    expect(heard).toEqual(['ui-open', 'ui-select', 'ui-confirm', 'ui-close']);
  });
});

// Unused-import guard for the mood type in strict builds.
export type _M = Mood;
