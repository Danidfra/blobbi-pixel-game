/**
 * PROCEDURAL MUSIC: an original, gentle generative score. A mood is a key, a tempo, a chord progression and an
 * orchestration; each bar is composed from (mood, bar number, seed) alone, so the music is deterministic for a
 * world, never repeats exactly over a long session, and is testable without audio.
 *
 * Form: 16-bar cycles in four 4-bar phrases (A A' B A''). A melody motif is drawn once per cycle and answered,
 * varied and rested; density follows the phrase (quiet start, fuller middle, thinning to the turnaround), so the
 * music breathes rather than looping. Pitches stay in the mood's scale; the lead rests often.
 */
import { stream } from '../core/rng';

export type Mood = 'day' | 'night' | 'rain' | 'indoor' | 'mystery' | 'special';
export const MOODS: readonly Mood[] = ['day', 'night', 'rain', 'indoor', 'mystery', 'special'];

export type Instrument = 'pad' | 'bass' | 'pluck' | 'bell' | 'lead';

export interface Note {
  /** Start, in beats from the bar's start. */
  beat: number;
  /** Length in beats. */
  beats: number;
  midi: number;
  instrument: Instrument;
  /** 0..1 loudness. */
  vel: number;
}

interface MoodDef {
  bpm: number;
  /** Root MIDI note of the key, and the scale (semitones). */
  root: number;
  scale: number[];
  /** Chords as scale degrees of their root, with extensions as scale steps above it. */
  progression: { degree: number; steps: number[] }[];
  /** Orchestration: which instruments play and how busy they are (0..1). */
  bass: number;
  arp: number;
  lead: number;
  bells: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

const SEVENTH = [0, 2, 4, 6];
const ADD9 = [0, 2, 4, 8];
const SUS = [0, 3, 4, 7];

export const MOOD_DEFS: Record<Mood, MoodDef> = {
  // A sunny, unhurried morning: F major, I – vi – IV – V with sevenths.
  day: { bpm: 84, root: 53, scale: MAJOR, progression: [{ degree: 0, steps: SEVENTH }, { degree: 5, steps: SEVENTH }, { degree: 3, steps: ADD9 }, { degree: 4, steps: SUS }], bass: 0.7, arp: 0.6, lead: 0.55, bells: 0.15 },
  // Night: A aeolian, slow, long pads and far bells.
  night: { bpm: 62, root: 57, scale: AEOLIAN, progression: [{ degree: 0, steps: ADD9 }, { degree: 5, steps: SEVENTH }, { degree: 2, steps: SEVENTH }, { degree: 6, steps: SUS }], bass: 0.3, arp: 0.2, lead: 0.25, bells: 0.45 },
  // Rain: D dorian, a soft piano-like arpeggio under the drops.
  rain: { bpm: 70, root: 50, scale: DORIAN, progression: [{ degree: 0, steps: ADD9 }, { degree: 3, steps: SEVENTH }, { degree: 0, steps: SEVENTH }, { degree: 6, steps: ADD9 }], bass: 0.4, arp: 0.8, lead: 0.2, bells: 0.1 },
  // Indoors: C major, a music box on a warm pad.
  indoor: { bpm: 76, root: 48, scale: MAJOR, progression: [{ degree: 0, steps: ADD9 }, { degree: 3, steps: SEVENTH }, { degree: 5, steps: SEVENTH }, { degree: 4, steps: SUS }], bass: 0.35, arp: 0.3, lead: 0.35, bells: 0.55 },
  // Mystery: E lydian, floating, almost no rhythm.
  mystery: { bpm: 58, root: 52, scale: LYDIAN, progression: [{ degree: 0, steps: SEVENTH }, { degree: 1, steps: ADD9 }, { degree: 0, steps: SUS }, { degree: 4, steps: ADD9 }], bass: 0.15, arp: 0.15, lead: 0.15, bells: 0.6 },
  // A special moment (a discovery, a new friend level): G major, bright and full, played for one cycle.
  special: { bpm: 88, root: 55, scale: MAJOR, progression: [{ degree: 0, steps: ADD9 }, { degree: 3, steps: ADD9 }, { degree: 5, steps: SEVENTH }, { degree: 4, steps: SUS }], bass: 0.8, arp: 0.9, lead: 0.7, bells: 0.4 },
};

/** Seconds per bar (4 beats) in a mood. */
export const barSeconds = (mood: Mood) => (4 * 60) / MOOD_DEFS[mood].bpm;

/** The MIDI pitch of scale step `step` (0 = root; negative and >7 wrap octaves). */
export function scaleNote(def: MoodDef, step: number): number {
  const n = def.scale.length;
  const octave = Math.floor(step / n);
  return def.root + def.scale[((step % n) + n) % n] + 12 * octave;
}

/** Move a pitch by octaves into [lo, hi] (keeps the lead and bells sweet, never shrill). */
export function fold(m: number, lo: number, hi: number): number {
  while (m > hi) m -= 12;
  while (m < lo) m += 12;
  return m;
}

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Density of a bar within its 16-bar cycle: a gentle arc (0.35 .. 1). */
export function density(bar: number): number {
  const phrase = Math.floor((bar % 16) / 4);
  const inPhrase = bar % 4;
  const base = [0.45, 0.7, 1, 0.6][phrase];
  return Math.max(0.35, base - (inPhrase === 3 ? 0.15 : 0));
}

/** Compose one bar. Pure: the same (mood, bar, seed) always gives the same notes. */
export function composeBar(mood: Mood, bar: number, seed: string): Note[] {
  const def = MOOD_DEFS[mood];
  const cycle = Math.floor(bar / 16);
  const inCycle = bar % 16;
  const phrase = Math.floor(inCycle / 4);
  const chord = def.progression[bar % def.progression.length];
  const rng = stream(seed, 'music', mood, bar);
  const motifRng = stream(seed, 'motif', mood, cycle);
  const d = density(bar);
  const notes: Note[] = [];
  const chordTones = chord.steps.map((s) => chord.degree + s);
  // Pad: the chord, voiced around middle C, held for the whole bar.
  for (const s of chordTones.slice(0, 3)) notes.push({ beat: 0, beats: 4, midi: scaleNote(def, s) + 12, instrument: 'pad', vel: 0.55 });
  // Bass: root on 1, and on 3 when busy (a fifth for movement in the middle phrase).
  if (def.bass > 0) {
    notes.push({ beat: 0, beats: 2, midi: scaleNote(def, chord.degree) - 12, instrument: 'bass', vel: 0.7 });
    if (rng.chance(def.bass * d)) notes.push({ beat: 2, beats: 1.5, midi: scaleNote(def, chord.degree + (phrase === 2 ? 4 : 0)) - 12, instrument: 'bass', vel: 0.55 });
  }
  // Arpeggio: eighths up and down the chord, thinned by density.
  if (def.arp > 0) {
    const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
    for (let i = 0; i < 8; i++) {
      if (!rng.chance(def.arp * d * (i % 2 === 0 ? 1 : 0.7))) continue;
      notes.push({ beat: i * 0.5, beats: 0.5, midi: scaleNote(def, chordTones[pattern[i]]) + 12, instrument: 'pluck', vel: i === 0 ? 0.6 : 0.42 });
    }
  }
  // Lead: a motif (from the cycle's stream) sung in phrases A and A', answered in B, recalled in A''.
  const motif = Array.from({ length: 4 }, () => ({ beat: motifRng.int(0, 7) / 2, step: motifRng.int(-2, 4) }))
    .sort((a, b) => a.beat - b.beat)
    .filter((n, i, all) => i === 0 || n.beat !== all[i - 1].beat);
  if (def.lead > 0 && inCycle % 4 !== 3 && rng.chance(def.lead + 0.25 * d)) {
    const shift = phrase === 1 ? 1 : phrase === 2 ? 3 : 0;
    for (const m of motif) {
      if (phrase === 2 && rng.chance(0.4)) continue; // the answer is sparer
      // Snap to the nearest chord tone on strong beats, so the melody sits on the harmony.
      let s = chord.degree + m.step + shift;
      if (m.beat % 2 === 0) s = chordTones.reduce((best, c) => (Math.abs(c - s) < Math.abs(best - s) ? c : best), chordTones[0]);
      notes.push({ beat: m.beat, beats: 0.9, midi: fold(scaleNote(def, s) + 24, 64, 86), instrument: 'lead', vel: 0.5 });
    }
  }
  // Bells: one or two high chord tones, now and then; always on the cycle's last bar (a gentle turnaround).
  if (def.bells > 0 && (rng.chance(def.bells * d) || inCycle === 15)) {
    const s = chordTones[rng.int(0, chordTones.length - 1)];
    notes.push({ beat: rng.int(0, 3), beats: 2, midi: fold(scaleNote(def, s) + 24, 72, 93), instrument: 'bell', vel: 0.35 });
  }
  return notes;
}
