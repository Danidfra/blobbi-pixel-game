/**
 * THE AUDIO ENGINE: Web Audio buses, settings, unlocking, voice limits, and the three layers that play through it
 * (effects, ambience beds, music). It owns no game logic: the game's director (audio/director.ts) decides what to
 * play; this decides how, safely.
 *
 *   effects ─► sfx bus ─┐
 *   ui      ─► ui bus  ─┤
 *   beds and life ─► ambient bus ─┼─► master ─► compressor ─► speakers
 *   music ─► music bus ─► soft echo ─┘
 *
 * Browsers start audio suspended until a user gesture: `unlock()` is called from the first key or pointer press
 * and nothing is created before it. A hidden tab suspends the context; showing it resumes. Every voice is capped
 * (total and per effect), so a burst of events can never pile up into noise.
 */
import { createRng, type Rng } from '../core/rng';
import { SFX, type Bus, type Voice, type Wave } from './sfx';
import { barSeconds, composeBar, midiToHz, type Instrument, type Mood, type Note } from './music';

export interface AudioSettings {
  /** 0..1 volumes. */
  master: number;
  music: number;
  sfx: number;
  ambient: number;
  muted: boolean;
  /** Music on or off (separate from effects). */
  musicOn: boolean;
  /** Softer, quieter effects and fewer ambient events. */
  reduced: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = { master: 0.8, music: 0.5, sfx: 0.7, ambient: 0.6, muted: false, musicOn: true, reduced: false };

/** The ambient beds: looping filtered noise, each with a level the director steers. */
export type Bed = 'ocean' | 'wind' | 'rain' | 'room';
const BEDS: Record<Bed, { type: BiquadFilterType; f: number; q: number }> = {
  ocean: { type: 'lowpass', f: 480, q: 0.5 },
  wind: { type: 'bandpass', f: 700, q: 0.6 },
  rain: { type: 'highpass', f: 1800, q: 0.4 },
  room: { type: 'lowpass', f: 220, q: 0.3 },
};

/**
 * Make-up gain after the bus volumes: the recipes are written quiet and soft, and the compressor catches the rare
 * peak. Measured offline (scripts/audio-preview.ts): music around -24 dBFS RMS, effects peaking -10 to -20 dBFS.
 */
export const OUTPUT_GAIN = 3;

/** Most voices sounding at once (effects + ambient events); music has its own budget. */
export const MAX_VOICES = 14;
export const MAX_MUSIC_VOICES = 24;

type Ctx = BaseAudioContext & { resume(): Promise<void>; suspend(): Promise<void>; state: AudioContextState };

export class AudioEngine {
  ctx: Ctx | null = null;
  settings: AudioSettings = { ...DEFAULT_AUDIO };
  private buses: Partial<Record<Bus | 'music' | 'master', GainNode>> = {};
  private noiseBuffer: AudioBuffer | null = null;
  private lastPlayed = new Map<string, number>();
  /** End times of sounding voices (effects and music). */
  private voices: number[] = [];
  private musicVoices: number[] = [];
  private beds = new Map<Bed, { gain: GainNode; filter: BiquadFilterNode; level: number }>();
  private rng: Rng = createRng('audio');
  /** Music state: the mood playing, the next bar to schedule and when. */
  mood: Mood | null = null;
  private nextBar = 0;
  private nextBarAt = 0;
  private musicSeed = 'blobbi';
  /** Counters for tests and the dev inspector. */
  readonly stats = { played: 0, skipped: 0, notes: 0 };

  constructor(private readonly factory: () => Ctx | null = defaultFactory) {}

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Create (on the first gesture) or resume the context. Safe to call on every gesture. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = this.factory();
      if (!this.ctx) return;
      this.build();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  /** Pause all sound (a hidden tab); `resume` brings it back. Nothing is lost: music picks up at the next bar. */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.connect(ctx.destination);
    const master = ctx.createGain();
    master.connect(comp);
    this.buses.master = master;
    for (const name of ['sfx', 'ui', 'ambient'] as const) {
      const g = ctx.createGain();
      g.connect(master);
      this.buses[name] = g;
    }
    // Music through a soft echo (a feedback delay, low-passed): space without a reverb's cost.
    const music = ctx.createGain();
    music.connect(master);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.36;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1800;
    music.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(master);
    this.buses.music = music;
    // One second of white noise, shared by every noise voice and bed.
    const len = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    const r = createRng('noise');
    for (let i = 0; i < len; i++) data[i] = r.range(-1, 1);
    this.applySettings();
  }

  /** Push the settings to the bus gains (smoothly). */
  applySettings(): void {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    const set = (g: GainNode | undefined, v: number) => g?.gain.setTargetAtTime(v, t, 0.05);
    set(this.buses.master, s.muted ? 0 : s.master * OUTPUT_GAIN);
    set(this.buses.sfx, s.sfx * (s.reduced ? 0.6 : 1));
    set(this.buses.ui, s.sfx * 0.8 * (s.reduced ? 0.6 : 1));
    set(this.buses.ambient, s.ambient);
    set(this.buses.music, s.musicOn ? s.music * 0.6 : 0);
  }

  /** Play an effect by name. Returns whether it sounded (unknown, too soon, too many voices or locked: no). */
  play(name: string, opts: { gain?: number; pan?: number } = {}): boolean {
    const recipe = SFX[name];
    if (!recipe || !this.ctx || !this.unlocked || this.settings.muted) return false;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(name);
    if (last !== undefined && now - last < recipe.gap) {
      this.stats.skipped++;
      return false;
    }
    this.voices = this.voices.filter((end) => end > now);
    const voices = recipe.voices(this.rng);
    if (this.voices.length + voices.length > MAX_VOICES) {
      this.stats.skipped++;
      return false;
    }
    this.lastPlayed.set(name, now);
    const soft = this.settings.reduced;
    for (const v of voices) this.voices.push(this.voice(v, this.buses[recipe.bus]!, now, (opts.gain ?? 1) * (soft ? 0.7 : 1), soft));
    this.stats.played++;
    return true;
  }

  /** One synthesized voice; returns when it ends. */
  private voice(v: Voice, bus: AudioNode, now: number, gainScale: number, soft: boolean): number {
    const ctx = this.ctx!;
    const start = now + v.at;
    const end = start + v.dur;
    const attack = Math.max(soft ? 0.015 : 0.003, v.attack);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, v.gain * gainScale), start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    let src: AudioScheduledSourceNode;
    if (v.wave === 'noise') {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      n.loop = true;
      src = n;
    } else {
      const o = ctx.createOscillator();
      o.type = v.wave;
      o.frequency.setValueAtTime(v.f0, start);
      if (v.f1) o.frequency.exponentialRampToValueAtTime(v.f1, end);
      src = o;
    }
    if (v.filter) {
      const f = ctx.createBiquadFilter();
      f.type = v.filter.type;
      f.frequency.setValueAtTime(soft ? Math.min(v.filter.f, 3000) : v.filter.f, start);
      if (v.wave === 'noise' && v.f1) f.frequency.exponentialRampToValueAtTime(v.f1, end);
      f.Q.value = v.filter.q ?? 1;
      src.connect(f);
      f.connect(env);
    } else src.connect(env);
    env.connect(bus);
    src.start(start);
    src.stop(end + 0.05);
    src.onended = () => env.disconnect();
    return end;
  }

  // ─── Ambience beds ────────────────────────────────────────────────────

  /** Steer a bed's level (0..1) and optionally its filter; the bed is created the first time it is wanted. */
  bed(name: Bed, level: number, filterHz?: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    let bed = this.beds.get(name);
    if (!bed) {
      if (level <= 0.001) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = BEDS[name].type;
      filter.frequency.value = BEDS[name].f;
      filter.Q.value = BEDS[name].q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.buses.ambient!);
      src.start();
      bed = { gain, filter, level: 0 };
      this.beds.set(name, bed);
    }
    const t = this.ctx.currentTime;
    bed.level = level;
    bed.gain.gain.setTargetAtTime(level * 0.08, t, 0.6);
    if (filterHz) bed.filter.frequency.setTargetAtTime(filterHz, t, 0.8);
  }

  bedLevel(name: Bed): number | null {
    const b = this.beds.get(name);
    return b ? b.level : null;
  }

  // ─── Music ────────────────────────────────────────────────────────────

  /** Choose the mood; a change takes effect at the next bar (with a soft crossfade from the pad's release). */
  setMood(mood: Mood | null, seed = this.musicSeed): void {
    if (mood !== this.mood) {
      this.mood = mood;
      // Each mood starts at the top of its form.
      this.nextBar = 0;
    }
    this.musicSeed = seed;
  }

  /** Schedule the bars that start within the next `lookahead` seconds. Call every frame. */
  tickMusic(lookahead = 0.6): number {
    if (!this.ctx || !this.unlocked || !this.mood || !this.settings.musicOn || this.settings.muted) return 0;
    const now = this.ctx.currentTime;
    if (this.nextBarAt < now) this.nextBarAt = now + 0.1; // after a pause or a change: start cleanly
    let scheduled = 0;
    while (this.nextBarAt < now + lookahead) {
      const notes = composeBar(this.mood, this.nextBar, this.musicSeed);
      const spb = barSeconds(this.mood) / 4;
      for (const n of notes) scheduled += this.note(n, this.nextBarAt + n.beat * spb, n.beats * spb) ? 1 : 0;
      this.nextBarAt += barSeconds(this.mood);
      this.nextBar++;
    }
    return scheduled;
  }

  private note(n: Note, at: number, length: number): boolean {
    this.musicVoices = this.musicVoices.filter((end) => end > this.ctx!.currentTime);
    if (this.musicVoices.length >= MAX_MUSIC_VOICES) return false;
    const patch = PATCHES[n.instrument];
    const f = midiToHz(n.midi);
    const dur = patch.sustain ? length + patch.release : patch.release;
    for (const [wave, mult, g] of patch.partials)
      this.musicVoices.push(this.voice({ wave, f0: f * mult, at: 0, dur, attack: patch.attack, gain: g * n.vel, filter: patch.filter }, this.buses.music!, at, 1, false));
    this.stats.notes++;
    return true;
  }
}

/** Instrument patches: partials (wave, frequency multiple, gain), envelope and tone. */
const PATCHES: Record<Instrument, { partials: [Wave, number, number][]; attack: number; release: number; sustain: boolean; filter?: Voice['filter'] }> = {
  pad: { partials: [['triangle', 1, 0.14], ['sine', 1.003, 0.12]], attack: 0.7, release: 1.2, sustain: true, filter: { type: 'lowpass', f: 1100 } },
  bass: { partials: [['sine', 1, 0.44], ['triangle', 1, 0.1]], attack: 0.03, release: 0.4, sustain: true, filter: { type: 'lowpass', f: 600 } },
  pluck: { partials: [['triangle', 1, 0.2]], attack: 0.005, release: 0.7, sustain: false, filter: { type: 'lowpass', f: 2200 } },
  bell: { partials: [['sine', 1, 0.16], ['sine', 2.76, 0.032]], attack: 0.004, release: 2.2, sustain: false },
  lead: { partials: [['sine', 1, 0.22], ['triangle', 2, 0.024]], attack: 0.06, release: 0.5, sustain: true, filter: { type: 'lowpass', f: 2600 } },
};

function defaultFactory(): Ctx | null {
  const C = (globalThis as unknown as { AudioContext?: new () => Ctx; webkitAudioContext?: new () => Ctx }).AudioContext ?? (globalThis as unknown as { webkitAudioContext?: new () => Ctx }).webkitAudioContext;
  try {
    return C ? new C() : null;
  } catch {
    return null;
  }
}
