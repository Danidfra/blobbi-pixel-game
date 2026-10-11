/**
 * SOUND EFFECTS as data: every effect is a short list of synthesized voices (an oscillator or filtered noise with a
 * pitch glide and a soft envelope). Nothing here touches Web Audio, so the recipes are testable and the engine
 * stays small. All sounds are original and procedural: no samples.
 *
 * Design rules (see docs/specifications/AUDIO.md): soft attacks (never a click), short tails, mid frequencies, pentatonic
 * pitches for anything musical, small random variation so repeats do not tire, and few voices per effect.
 */
import type { Rng } from '../core/rng';

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise';
export type Bus = 'sfx' | 'ambient' | 'ui';

export interface Voice {
  wave: Wave;
  /** Start and end frequency (Hz); for noise, the filter's centre glides instead. */
  f0: number;
  f1?: number;
  /** Start offset and length (seconds). */
  at: number;
  dur: number;
  /** Attack time (seconds); the rest decays smoothly to silence. */
  attack: number;
  /** Peak gain (before bus volumes). */
  gain: number;
  filter?: { type: 'lowpass' | 'bandpass' | 'highpass'; f: number; q?: number };
}

export interface SfxRecipe {
  bus: Bus;
  /** The same effect never plays again within this many seconds (anti-spam). */
  gap: number;
  voices: (rng: Rng) => Voice[];
}

/** A pentatonic note (C major pentatonic from C5 by default), for chimes. */
export const penta = (step: number, base = 523.25) => {
  const PENTA = [0, 2, 4, 7, 9];
  const octave = Math.floor(step / 5);
  return base * 2 ** ((PENTA[((step % 5) + 5) % 5] + 12 * octave) / 12);
};

const noise = (at: number, dur: number, f: number, gain: number, type: 'lowpass' | 'bandpass' | 'highpass' = 'bandpass', q = 1, f1?: number, attack = 0.005): Voice => ({ wave: 'noise', f0: f, f1, at, dur, attack, gain, filter: { type, f, q } });
const tone = (wave: Wave, f0: number, at: number, dur: number, gain: number, f1?: number, attack = 0.008, filter?: Voice['filter']): Voice => ({ wave, f0, f1, at, dur, attack, gain, filter });
const chime = (steps: number[], gap: number, gain = 0.16, base?: number) => steps.flatMap((s, i) => [tone('sine', penta(s, base), i * gap, 0.55, gain), tone('triangle', penta(s, base) * 2, i * gap, 0.25, gain * 0.25)]);

const step = (f: number, q: number, gain: number, wobble = 0.15) => ({
  bus: 'sfx' as const,
  gap: 0.09,
  voices: (r: Rng) => [noise(0, 0.07, f * r.range(1 - wobble, 1 + wobble), gain * r.range(0.7, 1), 'bandpass', q)],
});

export const SFX: Record<string, SfxRecipe> = {
  // ── Movement ─────────────────────────────────────────────────────────
  'step-grass': step(900, 1.2, 0.05),
  'step-path': step(1400, 2, 0.06),
  'step-sand': step(2200, 0.8, 0.045, 0.25),
  'step-wood': { bus: 'sfx', gap: 0.09, voices: (r) => [tone('triangle', r.range(150, 175), 0, 0.08, 0.09, 110, 0.003, { type: 'lowpass', f: 900 }), noise(0, 0.03, 1800, 0.02)] },
  'step-shallow': { bus: 'sfx', gap: 0.09, voices: (r) => [noise(0, 0.12, r.range(1200, 1600), 0.05, 'bandpass', 3, 700), tone('sine', r.range(700, 900), 0.02, 0.06, 0.02, 1300)] },
  door: { bus: 'sfx', gap: 0.3, voices: () => [tone('triangle', 220, 0, 0.14, 0.12, 180, 0.004, { type: 'lowpass', f: 1200 }), tone('triangle', 330, 0.09, 0.12, 0.08, 280, 0.004, { type: 'lowpass', f: 1200 }), noise(0, 0.05, 700, 0.03)] },
  // ── Tools and farming ────────────────────────────────────────────────
  chop: { bus: 'sfx', gap: 0.12, voices: (r) => [tone('triangle', r.range(190, 220), 0, 0.12, 0.16, 120, 0.002, { type: 'lowpass', f: 1400 }), noise(0, 0.06, 1100, 0.06, 'bandpass', 1.5)] },
  mine: { bus: 'sfx', gap: 0.12, voices: (r) => [tone('square', r.range(820, 900), 0, 0.09, 0.05, 780, 0.002, { type: 'lowpass', f: 2400 }), tone('sine', 1650, 0, 0.18, 0.04), noise(0, 0.05, 2600, 0.05, 'bandpass', 2)] },
  till: { bus: 'sfx', gap: 0.12, voices: (r) => [noise(0, 0.14, r.range(500, 650), 0.09, 'lowpass', 0.8, 300), tone('sine', 110, 0, 0.08, 0.05)] },
  plant: { bus: 'sfx', gap: 0.1, voices: () => [noise(0, 0.08, 600, 0.05, 'lowpass'), tone('sine', penta(2), 0.05, 0.2, 0.07, penta(3))] },
  water: { bus: 'sfx', gap: 0.15, voices: (r) => [noise(0, 0.35, 2600, 0.05, 'bandpass', 1.2, 1800, 0.05), ...[0, 1, 2].map((i) => tone('sine', r.range(900, 1400), 0.05 + i * 0.07, 0.07, 0.03, r.range(1500, 2000)))] },
  harvest: { bus: 'sfx', gap: 0.12, voices: () => [noise(0, 0.06, 900, 0.05), ...chime([3, 5], 0.07, 0.11)] },
  pickup: { bus: 'sfx', gap: 0.05, voices: (r) => [tone('sine', penta(r.int(3, 5)), 0, 0.14, 0.1, undefined, 0.004), tone('sine', penta(r.int(6, 7)), 0.05, 0.16, 0.08)] },
  cast: { bus: 'sfx', gap: 0.3, voices: () => [noise(0, 0.3, 1800, 0.05, 'bandpass', 1, 600, 0.02), tone('sine', 900, 0.25, 0.1, 0.04, 400)] },
  bite: { bus: 'sfx', gap: 0.3, voices: () => [tone('sine', 520, 0, 0.08, 0.07, 700), tone('sine', 520, 0.12, 0.08, 0.07, 700)] },
  catch: { bus: 'sfx', gap: 0.3, voices: () => [noise(0, 0.25, 1500, 0.06, 'bandpass', 1, 3000), ...chime([2, 4, 7], 0.08, 0.12)] },
  place: { bus: 'sfx', gap: 0.15, voices: () => [tone('triangle', 180, 0, 0.12, 0.12, 140, 0.003, { type: 'lowpass', f: 1000 }), noise(0, 0.05, 900, 0.04)] },
  store: { bus: 'sfx', gap: 0.08, voices: () => [tone('triangle', 260, 0, 0.08, 0.08, 200, 0.003, { type: 'lowpass', f: 1500 })] },
  take: { bus: 'sfx', gap: 0.08, voices: () => [tone('triangle', 300, 0, 0.08, 0.08, 380, 0.003, { type: 'lowpass', f: 1500 })] },
  // ── Crafting and cooking ─────────────────────────────────────────────
  craft: { bus: 'sfx', gap: 0.2, voices: () => [tone('triangle', 200, 0, 0.08, 0.1, 160, 0.002, { type: 'lowpass', f: 1300 }), tone('triangle', 240, 0.12, 0.08, 0.1, 190, 0.002, { type: 'lowpass', f: 1300 }), ...chime([4, 7], 0.08, 0.09).map((v) => ({ ...v, at: v.at + 0.25 }))] },
  cook: { bus: 'sfx', gap: 0.3, voices: () => [noise(0, 0.6, 3500, 0.03, 'highpass', 0.7, 2500, 0.1), ...chime([0, 2, 4], 0.09, 0.09).map((v) => ({ ...v, at: v.at + 0.3 }))] },
  fail: { bus: 'sfx', gap: 0.35, voices: () => [tone('triangle', 330, 0, 0.12, 0.07, 290, 0.01, { type: 'lowpass', f: 1200 }), tone('triangle', 262, 0.13, 0.18, 0.07, 240, 0.01, { type: 'lowpass', f: 1200 })] },
  recipe: { bus: 'sfx', gap: 0.5, voices: () => chime([5, 7, 9, 12], 0.09, 0.1) },
  // ── UI ───────────────────────────────────────────────────────────────
  'ui-open': { bus: 'ui', gap: 0.08, voices: () => [tone('sine', 660, 0, 0.09, 0.06, 880, 0.005)] },
  'ui-close': { bus: 'ui', gap: 0.08, voices: () => [tone('sine', 740, 0, 0.09, 0.05, 560, 0.005)] },
  'ui-select': { bus: 'ui', gap: 0.04, voices: () => [tone('sine', 1180, 0, 0.035, 0.025, undefined, 0.003)] },
  'ui-confirm': { bus: 'ui', gap: 0.06, voices: () => [tone('sine', penta(4), 0, 0.1, 0.06), tone('sine', penta(7), 0.05, 0.14, 0.05)] },
  'ui-deny': { bus: 'ui', gap: 0.1, voices: () => [tone('triangle', 220, 0, 0.12, 0.05, 200, 0.006, { type: 'lowpass', f: 900 })] },
  quest: { bus: 'sfx', gap: 0.6, voices: () => [...chime([0, 2, 4, 7], 0.11, 0.11), tone('triangle', penta(-5), 0, 0.8, 0.05, undefined, 0.05)] },
  discover: { bus: 'sfx', gap: 0.6, voices: () => [...chime([4, 3, 7, 9], 0.14, 0.09, 659.25), tone('sine', 196, 0, 1.2, 0.04, undefined, 0.2)] },
  // ── The Blobbi ───────────────────────────────────────────────────────
  eat: { bus: 'sfx', gap: 0.3, voices: (r) => [0, 1, 2].map((i) => tone('triangle', r.range(240, 300), i * 0.11, 0.06, 0.07, 180, 0.004, { type: 'lowpass', f: 1000 })) },
  pet: { bus: 'sfx', gap: 0.4, voices: () => [tone('sine', 520, 0, 0.18, 0.07, 700, 0.03), tone('sine', 700, 0.16, 0.22, 0.06, 620, 0.03)] },
  happy: { bus: 'sfx', gap: 0.4, voices: () => [tone('sine', 600, 0, 0.12, 0.06, 820, 0.02), tone('sine', 820, 0.1, 0.12, 0.05, 900, 0.02)] },
  curious: { bus: 'sfx', gap: 0.5, voices: () => [tone('sine', 480, 0, 0.22, 0.06, 760, 0.03)] },
  sleep: { bus: 'sfx', gap: 1, voices: () => [tone('sine', 520, 0, 0.5, 0.05, 330, 0.08), noise(0.3, 0.8, 500, 0.02, 'lowpass', 0.7, 300, 0.3)] },
  wake: { bus: 'sfx', gap: 1, voices: () => [tone('sine', 400, 0, 0.18, 0.05, 640, 0.02)] },
  friend: { bus: 'sfx', gap: 1, voices: () => [...chime([0, 4, 7, 12], 0.1, 0.09), tone('sine', 261.6, 0, 1, 0.04, undefined, 0.1)] },
  music: { bus: 'sfx', gap: 0.8, voices: (r) => chime([r.int(0, 3), r.int(3, 6), r.int(5, 8)], 0.22, 0.08, 1046.5) },
  // ── The World Carrier ────────────────────────────────────────────────
  hum: { bus: 'ambient', gap: 3, voices: () => [tone('sine', 82, 0, 2.6, 0.12, 74, 0.6), tone('sine', 123, 0.2, 2.2, 0.05, 110, 0.6), tone('triangle', 164, 0.4, 1.8, 0.02, 150, 0.5, { type: 'lowpass', f: 400 })] },
  'carrier-call': { bus: 'ambient', gap: 20, voices: (r) => { const f = r.range(150, 190); return [tone('sine', f, 0, 2.4, 0.07, f * 0.78, 0.5), tone('sine', f * 1.5, 0.3, 1.8, 0.025, f * 1.15, 0.5)]; } },
  'carrier-breath': { bus: 'ambient', gap: 3, voices: () => [noise(0, 3.2, 300, 0.035, 'lowpass', 0.6, 420, 1.4), tone('sine', 55, 0, 3.2, 0.03, 58, 1.4)] },
  // ── Other Carrier species (prototype previews) ─────────────────────────
  'whale-song': { bus: 'ambient', gap: 20, voices: (r) => { const f = r.range(110, 140); return [tone('sine', f, 0, 2.8, 0.06, f * 1.5, 0.6), tone('sine', f * 1.5, 1.2, 2.2, 0.05, f * 0.9, 0.5), tone('triangle', f * 2, 0.4, 2.4, 0.012, f * 2.2, 0.6, { type: 'lowpass', f: 700 })]; } },
  'whale-blow': { bus: 'ambient', gap: 6, voices: () => [noise(0, 1.2, 900, 0.06, 'bandpass', 0.7, 400, 0.08), noise(0.1, 1.4, 2400, 0.02, 'highpass', 0.5, 1500, 0.3)] },
  'manta-call': { bus: 'ambient', gap: 15, voices: (r) => [0, 1, 2].map((i) => tone('sine', penta(r.int(5, 9), 783.99), i * 0.18, 0.6, 0.035, undefined, 0.05)) },
  'manta-glide': { bus: 'ambient', gap: 4, voices: () => [noise(0, 2.4, 700, 0.03, 'bandpass', 0.6, 1100, 1)] },
  // ── Ambient life ─────────────────────────────────────────────────────
  bird: { bus: 'ambient', gap: 0.8, voices: (r) => { const f = r.range(2400, 3400); const n = r.int(2, 4); return Array.from({ length: n }, (_, i) => tone('sine', f * r.range(0.9, 1.1), i * r.range(0.09, 0.14), 0.07, 0.025, f * r.range(1.1, 1.35), 0.01)); } },
  cricket: { bus: 'ambient', gap: 0.6, voices: (r) => { const f = r.range(4200, 4800); return Array.from({ length: 3 }, (_, i) => tone('sine', f, i * 0.055, 0.035, 0.01, undefined, 0.006)); } },
  owl: { bus: 'ambient', gap: 15, voices: () => [tone('sine', 392, 0, 0.35, 0.03, 370, 0.08), tone('sine', 392, 0.55, 0.5, 0.03, 350, 0.08)] },
  splash: { bus: 'ambient', gap: 2, voices: () => [noise(0, 0.4, 1200, 0.03, 'bandpass', 0.8, 600, 0.02)] },
  // ── Island growth ────────────────────────────────────────────────────
  grow: { bus: 'sfx', gap: 3, voices: () => [tone('sine', 98, 0, 3.2, 0.08, 131, 1.2), tone('triangle', 196, 0.3, 2.8, 0.03, 262, 1, { type: 'lowpass', f: 900 }), ...chime([0, 4, 7, 12], 0.4, 0.07).map((v) => ({ ...v, at: v.at + 0.6 }))] },
  // ── Teleport ─────────────────────────────────────────────────────────
  'teleport-gather': { bus: 'sfx', gap: 1, voices: () => [tone('sine', 220, 0, 0.9, 0.05, 330, 0.4), tone('triangle', 440, 0.2, 0.7, 0.025, 660, 0.4, { type: 'lowpass', f: 1500 })] },
  'teleport-dissolve': { bus: 'sfx', gap: 1, voices: (r) => [noise(0, 1.1, 3000, 0.035, 'bandpass', 2, 6000, 0.2), ...[0, 1, 2, 3, 4, 5].map((i) => tone('sine', penta(4 + i + r.int(0, 1)), i * 0.16, 0.3, 0.05))] },
  'teleport-whoosh': { bus: 'sfx', gap: 1, voices: () => [noise(0, 0.7, 1200, 0.05, 'bandpass', 1.2, 5000, 0.08), tone('sine', 660, 0, 0.6, 0.03, 1320, 0.05)] },
  'teleport-gone': { bus: 'sfx', gap: 1, voices: () => [tone('sine', penta(12), 0, 0.5, 0.03)] },
  'teleport-incoming': { bus: 'sfx', gap: 1, voices: () => [noise(0, 1.6, 5000, 0.03, 'bandpass', 1.5, 1200, 0.6), ...[0, 1, 2, 3].map((i) => tone('sine', penta(12 - i * 2), 0.3 + i * 0.3, 0.35, 0.035))] },
  'teleport-rebuild': { bus: 'sfx', gap: 1, voices: () => [0, 1, 2, 3, 4].map((i) => tone('sine', penta(i * 2, 261.63), i * 0.17, 0.4, 0.055)) },
  'teleport-arrived': { bus: 'sfx', gap: 1, voices: () => [...chime([4, 7, 9], 0.08, 0.08), tone('sine', 600, 0.35, 0.12, 0.05, 820, 0.02)] },
  'teleport-cancelled': { bus: 'sfx', gap: 0.5, voices: () => [tone('sine', 660, 0, 0.2, 0.04, 440, 0.02)] },
  'teleport-reversed': { bus: 'sfx', gap: 0.5, voices: () => [tone('sine', 440, 0, 0.25, 0.04, 660, 0.02)] },
};

/** Recognised effect names (the world's sound hooks, plus UI and ambient ones). */
export const SFX_NAMES = Object.keys(SFX);
