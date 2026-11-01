/**
 * P1.3A, MY BLOBBI WANDERS: the player's setting for when the Blobbi walks about on its own, and the play loop's rule
 * for when it must wait.
 *
 * - After 60 s (the default), after 120 s, or off: the time is continuous inactivity, counted from the player's last
 *   key, press or menu, never from a timer that ran on while the player was busy.
 * - Off: autonomy never walks (no wander, no inspection, no walk home). The Blobbi still breathes and blinks (the
 *   animator, not the brain), and a tired one sleeps on the spot after the same 60 s; the player's own taps and rests
 *   walk as always.
 * - While the player is busy (a menu or field open, a finger down, build or move mode, a teleport) and on the frame
 *   after, autonomy waits and an autonomous walk under way stops where it is (`Brain.hold`). A new world, the first
 *   frame after the title or an intro, and a return from the background start the delay again.
 */
import type { WanderSetting } from '../ui/game-ui';

/** What the brain is told for a setting: seconds of inactivity first, and whether it may walk. */
export function autonomyFor(w: WanderSetting): { delay: number; walk: boolean } {
  return w === 'off' ? { delay: 60, walk: false } : { delay: w === 'after120' ? 120 : 60, walk: true };
}

/** The live world as the gate sees it. */
export interface Autonomous {
  setAutonomy(a: { delay: number; walk: boolean }): void;
  holdAutonomy(): void;
}

export class AutonomyGate {
  private world: Autonomous | null = null;
  private quiet = true;
  private wasBusy = false;

  /** Play stopped (the title, an intro, the page hidden): the next play frame starts the delay again. */
  pause(): void {
    this.quiet = true;
  }

  /**
   * One play frame, before the world steps: the setting is applied, and autonomy is held when the player is busy or
   * just acted, on the frame after being busy, or when play just (re)started. Returns whether it was held.
   */
  frame(world: Autonomous, wander: WanderSetting, busy: boolean, acted: boolean): boolean {
    world.setAutonomy(autonomyFor(wander));
    const fresh = this.quiet || world !== this.world;
    this.world = world;
    this.quiet = false;
    const hold = fresh || busy || acted || this.wasBusy;
    this.wasBusy = busy;
    if (hold) world.holdAutonomy();
    return hold;
  }
}
