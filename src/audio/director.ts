/**
 * THE AUDIO DIRECTOR: what the island sounds like right now. It reads the live world (never writes it), turns its
 * sound hooks into effects, steers the ambience beds and life (sea, wind, rain, birds, insects, the Carrier's
 * breathing and calls) and picks the music's mood.
 *
 * The decisions are pure functions (`moodFor`, `ambientMix`) so they are testable without audio; `GameAudio`
 * applies them through the engine once a frame.
 */
import { createRng } from '../core/rng';
import { hourAt } from '../game/daylight';
import type { LiveWorld } from '../sim/live-world';
import type { AudioEngine, Bed } from './engine';
import type { Mood } from './music';
import { SFX } from './sfx';

export interface Listening {
  inside: boolean;
  /** Hour of day 0..24. */
  hour: number;
  /** 0..1 rain. */
  rain: number;
  /** 0 the island's middle .. 1 at the shell's rim (the open sea). */
  edge: number;
  /** Close to something hidden, or listening to the Carrier. */
  mystery: boolean;
  /** A special moment is sounding (discovery, friendship, quest). */
  special: boolean;
  /** The island's harmony level 0..4 (more life as it grows). */
  harmony?: number;
}

export const isNight = (hour: number) => hour >= 20.5 || hour < 5.5;

/** The music's mood for a moment. */
export function moodFor(l: Listening): Mood {
  if (l.special) return 'special';
  if (l.inside) return 'indoor';
  if (l.mystery) return 'mystery';
  if (l.rain > 0.45) return 'rain';
  if (isNight(l.hour)) return 'night';
  return 'day';
}

export interface AmbientMix {
  beds: Record<Bed, number>;
  /** Events per second. */
  birds: number;
  crickets: number;
  owl: number;
  splash: number;
  breath: number;
  call: number;
}

/** The ambience for a moment: bed levels 0..1 and event rates. */
export function ambientMix(l: Listening, reduced = false): AmbientMix {
  const night = isNight(l.hour);
  const dusk = l.hour >= 18 && l.hour < 20.5;
  const out = l.inside ? 0.25 : 1; // indoors: the world, muffled
  const calm = (reduced ? 0.5 : 1) * (1 + 0.15 * (l.harmony ?? 0));
  return {
    beds: {
      ocean: out * (0.25 + 0.55 * l.edge),
      wind: out * (0.12 + 0.18 * l.edge + 0.25 * l.rain),
      rain: out * l.rain * 0.9,
      room: l.inside ? 0.35 : 0,
    },
    birds: l.inside || night || l.rain > 0.4 ? 0 : (dusk ? 0.06 : 0.18) * calm,
    crickets: l.inside || l.rain > 0.4 ? 0 : (night ? 0.5 : dusk ? 0.2 : 0) * calm,
    owl: night && !l.inside ? 0.012 * calm : 0,
    splash: l.inside ? 0 : 0.05 * l.edge * calm,
    // The Carrier breathes under everything (felt more than heard), and calls now and then.
    breath: 1 / 9,
    call: (night ? 1 / 70 : 1 / 110) * calm,
  };
}

/** How long a special moment holds the music (seconds). */
export const SPECIAL_SECONDS = 22;
/** Seconds a new mood must hold before the music changes. */
export const MOOD_HOLD = 3;
const SPECIAL_TRIGGERS = new Set(['discover', 'friend', 'teleport-arrived', 'grow']);

export class GameAudio {
  private rng = createRng('ambience');
  private specialUntil = -1;
  private clock = 0;
  private nextBreath = 0;
  /** The last listening state (dev inspector). */
  last: Listening | null = null;
  lastMood: Mood | null = null;
  private pendingMood: Mood | null = null;
  private pendingSince = 0;

  constructor(readonly engine: AudioEngine) {}

  /** Leaving the game (another playground mode): the beds fade out and the music stops after its bar. */
  silence(): void {
    for (const bed of ['ocean', 'wind', 'rain', 'room'] as const) this.engine.bed(bed, 0);
    this.engine.setMood(null);
    this.lastMood = null;
  }

  /** Where the Blobbi is listening from. */
  listening(live: LiveWorld): Listening {
    const t = live.worldTime;
    const { width, height } = live.world.terrain;
    const b = live.blobbi;
    const dx = (b.x - width / 2) / (width * 0.42);
    const dy = (b.y - height / 2) / (height * 0.42);
    const near = (p: { x: number; y: number } | null, r: number) => !!p && Math.hypot(p.x - b.x, p.y - b.y) < r;
    return {
      inside: !!live.interior,
      hour: hourAt(t),
      rain: live.rainNow(),
      edge: Math.min(1, Math.hypot(dx, dy)),
      mystery: !live.interior && (near(live.listenSpot, 18) || live.hiddenDiscoveries.some((d) => near(d, 26))),
      special: this.clock < this.specialUntil,
      harmony: live.harmony().level,
    };
  }

  /**
   * Once a frame: play the world's sound events, steer the ambience and the music. `dt` is real seconds;
   * `events` the sound hooks drained this frame.
   */
  update(live: LiveWorld, dt: number, events: readonly string[]): void {
    const e = this.engine;
    this.clock += dt;
    for (const name of events) {
      if (SPECIAL_TRIGGERS.has(name)) this.specialUntil = this.clock + SPECIAL_SECONDS;
      if (SFX[name]) e.play(name);
    }
    const l = (this.last = this.listening(live));
    const mix = ambientMix(l, e.settings.reduced);
    // The sea swells with the Carrier's slow breath.
    const swell = 0.85 + 0.15 * Math.sin((this.clock / 9) * Math.PI * 2);
    e.bed('ocean', mix.beds.ocean * swell, 380 + 180 * swell);
    e.bed('wind', mix.beds.wind);
    e.bed('rain', mix.beds.rain);
    e.bed('room', mix.beds.room);
    const maybe = (rate: number, name: string, gain = 1) => {
      if (rate > 0 && this.rng.chance(Math.min(1, rate * dt))) e.play(name, { gain });
    };
    maybe(mix.birds, 'bird');
    maybe(mix.crickets, 'cricket');
    maybe(mix.owl, 'owl');
    maybe(mix.splash, 'splash');
    // The Carrier's own voice: a turtle's call, or a manta's chime and the hush of its glide.
    const manta = live.species === 'manta';
    maybe(mix.call, manta ? 'manta-call' : 'carrier-call', l.inside ? 0.4 : 1);
    if (this.clock >= this.nextBreath) {
      this.nextBreath = this.clock + 1 / mix.breath;
      e.play(manta ? 'manta-glide' : 'carrier-breath', { gain: l.inside ? 0.4 : 1 });
    }
    // A new mood must hold for a moment before the music follows (walking past a secret is not a scene change);
    // a special moment and going indoors are immediate.
    const mood = moodFor(l);
    if (mood !== this.pendingMood) {
      this.pendingMood = mood;
      this.pendingSince = this.clock;
    }
    if (this.lastMood === null || mood === 'special' || mood === 'indoor' || this.lastMood === 'indoor' || this.clock - this.pendingSince >= MOOD_HOLD) this.lastMood = mood;
    e.setMood(this.lastMood, live.world.seed);
    e.tickMusic();
  }
}
