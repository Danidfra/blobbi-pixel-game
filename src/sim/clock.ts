/**
 * THE SIMULATION CLOCK. The world advances in fixed steps of `dt` seconds,
 * never by raw wall-clock deltas: given the same inputs at the same step
 * numbers, the same states follow. Real time only decides how many steps
 * to run this frame; speed scales that, pause stops it.
 */
export class SimClock {
  /** Simulated seconds since the world started. */
  time = 0;
  /** Steps run so far. */
  step = 0;
  speed = 1;
  paused = false;
  readonly dt: number;
  private accumulator = 0;

  constructor(dt = 1 / 60) {
    this.dt = dt;
  }

  /** Feed real elapsed seconds; returns how many fixed steps to run now (capped, so a stalled tab does not spiral). */
  advance(realSeconds: number, maxSteps = 6): number {
    if (this.paused) return 0;
    this.accumulator += Math.max(0, Math.min(realSeconds, 0.25)) * this.speed;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < maxSteps) {
      this.accumulator -= this.dt;
      steps++;
    }
    if (steps === maxSteps) this.accumulator = 0;
    return steps;
  }

  /**
   * How far real time has run into the next step (0..1): the share of a step still waiting in the accumulator.
   * Presentation only (drawing between the last two steps); the simulation never reads it.
   */
  get fraction(): number {
    return Math.max(0, Math.min(1, this.accumulator / this.dt));
  }

  /** Record one step taken. */
  tick(): void {
    this.time += this.dt;
    this.step++;
  }
}
