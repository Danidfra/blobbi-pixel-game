/**
 * AUDIO PREVIEWS, rendered offline to WAV for listening outside the browser: each music mood (32 bars) and a
 * reel of every effect. A small software synth mirrors the engine's voice model (oscillator or noise, a one-pole
 * filter approximation, the exponential envelope, the music echo); the browser's Web Audio output is close but
 * not bit-identical. Also prints peak and RMS levels, so clipping or a too-quiet mix shows up without listening.
 * The files are large, so they go to the ignored out/ folder by default.
 *   npx tsx scripts/audio-preview.ts [outDir=out/audio-preview] [bars=32]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRng } from '../src/core/rng';
import { SFX, type Voice } from '../src/audio/sfx';
import { MOODS, barSeconds, composeBar, midiToHz, type Instrument } from '../src/audio/music';
import { DEFAULT_AUDIO, OUTPUT_GAIN } from '../src/audio/engine';

const outDir = process.argv[2] ?? 'out/audio-preview';
const bars = Number(process.argv[3] ?? 32);
mkdirSync(outDir, { recursive: true });
const RATE = 22050;
const noiseRng = createRng('noise');
const NOISE = Float32Array.from({ length: RATE }, () => noiseRng.range(-1, 1));

function renderVoice(out: Float32Array, v: Voice, start: number, gainScale: number): void {
  const s0 = Math.floor((start + v.at) * RATE);
  const n = Math.floor(v.dur * RATE);
  const attack = Math.max(0.003, v.attack);
  let phase = 0;
  let lp = 0;
  let lp2 = 0;
  const peak = Math.max(0.0002, v.gain * gainScale);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / RATE;
    const k = t / v.dur;
    const f = v.f1 ? v.f0 * (v.f1 / v.f0) ** k : v.f0;
    // Envelope: exponential rise to the peak, exponential fall to silence at the end.
    const env = t < attack ? 0.0001 * (peak / 0.0001) ** (t / attack) : peak * (0.0001 / peak) ** ((t - attack) / Math.max(1e-3, v.dur - attack));
    let x: number;
    if (v.wave === 'noise') x = NOISE[(s0 + i) % RATE];
    else {
      phase = (phase + f / RATE) % 1;
      x = v.wave === 'sine' ? Math.sin(phase * 2 * Math.PI) : v.wave === 'triangle' ? 1 - 4 * Math.abs(phase - 0.5) : v.wave === 'square' ? (phase < 0.5 ? 1 : -1) : 2 * phase - 1;
    }
    if (v.filter) {
      const fc = v.wave === 'noise' && v.f1 ? v.f0 * (v.f1 / v.f0) ** k : v.filter.f;
      const a = 1 - Math.exp((-2 * Math.PI * fc) / RATE);
      lp += a * (x - lp);
      lp2 += a * (lp - lp2);
      x = v.filter.type === 'lowpass' ? lp2 : v.filter.type === 'highpass' ? x - lp2 : (lp - lp2) * 2;
    }
    out[s0 + i] += x * env;
  }
}

const PATCH: Record<Instrument, { partials: [Voice['wave'], number, number][]; attack: number; release: number; sustain: boolean; filter?: Voice['filter'] }> = {
  pad: { partials: [['triangle', 1, 0.14], ['sine', 1.003, 0.12]], attack: 0.7, release: 1.2, sustain: true, filter: { type: 'lowpass', f: 1100 } },
  bass: { partials: [['sine', 1, 0.44], ['triangle', 1, 0.1]], attack: 0.03, release: 0.4, sustain: true, filter: { type: 'lowpass', f: 600 } },
  pluck: { partials: [['triangle', 1, 0.2]], attack: 0.005, release: 0.7, sustain: false, filter: { type: 'lowpass', f: 2200 } },
  bell: { partials: [['sine', 1, 0.16], ['sine', 2.76, 0.032]], attack: 0.004, release: 2.2, sustain: false },
  lead: { partials: [['sine', 1, 0.22], ['triangle', 2, 0.024]], attack: 0.06, release: 0.5, sustain: true, filter: { type: 'lowpass', f: 2600 } },
};

function echo(buf: Float32Array): void {
  // The engine's soft echo: 0.36 s, 0.28 feedback, low-passed.
  const d = Math.floor(0.36 * RATE);
  const wet = new Float32Array(buf.length);
  let lp = 0;
  for (let i = d; i < buf.length; i++) {
    const x = buf[i - d] + wet[i - d] * 0.28;
    lp += 0.4 * (x - lp);
    wet[i] = lp;
  }
  for (let i = 0; i < buf.length; i++) buf[i] += wet[i];
}

function wav(samples: Float32Array): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return b;
}

function levels(name: string, s: Float32Array): void {
  let peak = 0;
  let sum = 0;
  for (const x of s) {
    peak = Math.max(peak, Math.abs(x));
    sum += x * x;
  }
  const db = (v: number) => (20 * Math.log10(Math.max(1e-9, v))).toFixed(1);
  console.log(`${name.padEnd(22)} peak ${db(peak)} dBFS  rms ${db(Math.sqrt(sum / s.length))} dBFS${peak > 1 ? '  CLIPS' : ''}`);
}

const master = DEFAULT_AUDIO.master * OUTPUT_GAIN;
for (const mood of MOODS) {
  const length = bars * barSeconds(mood) + 3;
  const out = new Float32Array(Math.ceil(length * RATE));
  const spb = barSeconds(mood) / 4;
  for (let bar = 0; bar < bars; bar++)
    for (const n of composeBar(mood, bar, 'preview')) {
      const p = PATCH[n.instrument];
      const at = bar * barSeconds(mood) + n.beat * spb;
      const dur = p.sustain ? n.beats * spb + p.release : p.release;
      for (const [wave, mult, g] of p.partials) renderVoice(out, { wave, f0: midiToHz(n.midi) * mult, at: 0, dur, attack: p.attack, gain: g * n.vel, filter: p.filter }, at, master * DEFAULT_AUDIO.music * 0.6);
    }
  echo(out);
  levels(`music-${mood}`, out);
  writeFileSync(join(outDir, `music-${mood}.wav`), wav(out));
}

// Every effect, one after another with a little silence between.
const names = Object.keys(SFX);
const reel = new Float32Array(Math.ceil(names.length * 1.6 * RATE));
const rng = createRng('reel');
names.forEach((name, i) => {
  const r = SFX[name];
  const bus = r.bus === 'ambient' ? DEFAULT_AUDIO.ambient : r.bus === 'ui' ? DEFAULT_AUDIO.sfx * 0.8 : DEFAULT_AUDIO.sfx;
  const voices = r.voices(rng);
  const one = new Float32Array(Math.ceil(4 * RATE));
  for (const v of voices) renderVoice(one, v, 0, master * bus);
  levels(`sfx ${name}`, one);
  for (const v of voices) renderVoice(reel, v, i * 1.6, master * bus);
});
writeFileSync(join(outDir, 'sfx-reel.wav'), wav(reel));
writeFileSync(join(outDir, 'sfx-reel.txt'), names.map((n, i) => `${(i * 1.6).toFixed(1).padStart(6)} s  ${n}`).join('\n') + '\n');
console.log(`wrote ${outDir}: ${MOODS.length} music moods (${bars} bars each), sfx-reel.wav (${names.length} effects) and its index`);
