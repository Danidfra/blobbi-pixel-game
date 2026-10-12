/**
 * THE INTRO'S SOUND: cues on the existing audio engine, nothing new. The sea and the wind beds, the Carrier's own
 * voice from beneath and on surfacing, the Blobbi's existing reactions, a soft chime for the message, and the
 * existing generative score moving from `mystery` (the ocean) to `day` (the island). The engine keeps every rule:
 * nothing sounds before the browser allows it (the first gesture unlocks it), mute and the volumes apply, and
 * when the cinematic ends the game's own director steers the beds and the music again.
 */
import type { AudioEngine } from '../audio/engine';
import type { Mood } from '../audio/music';
import { SFX } from '../audio/sfx';

export class IntroAudio {
  /** Cues played so far, by name (tests and the dev inspector). */
  readonly played: string[] = [];

  constructor(
    private readonly engine: AudioEngine | null,
    private readonly seed: string,
  ) {}

  get enabled(): boolean {
    return this.engine !== null;
  }

  /** Play an existing effect; unknown names are ignored (and reported by the tests). */
  cue(name: string, gain = 1): void {
    if (!SFX[name]) return;
    this.played.push(name);
    this.engine?.play(name, { gain });
  }

  /** The sea and the wind under the picture. */
  beds(ocean: number, wind: number): void {
    if (!this.engine) return;
    this.engine.bed('ocean', ocean, 420);
    this.engine.bed('wind', wind);
  }

  mood(mood: Mood): void {
    this.engine?.setMood(mood, this.seed);
  }

  /** Once a frame: schedule the music's next bars. */
  tick(): void {
    this.engine?.tickMusic();
  }

  /** Leaving the cinematic: nothing to tear down (the game's director takes the beds and the music over). */
  release(): void {
    /* the engine's state is the game's; the director re-steers it next frame */
  }
}
