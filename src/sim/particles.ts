/**
 * PARTICLES: one or two pixels with a life. Leaves drift down from trees,
 * sparkles blink on shallow water, hearts float up after a reaction, smoke
 * puffs from a chimney. Spawning draws from a keyed stream so the ambient
 * life of a world is the same on every run.
 */
import { stream, type Rng } from '../core/rng';
import { type Color, hex } from '../core/color';
import type { PixelBuffer } from '../core/pixel';

export type ParticleKind = 'leaf' | 'sparkle' | 'heart' | 'smoke' | 'petal' | 'note' | 'exclaim' | 'dust' | 'ripple' | 'drop' | 'zzz' | 'butterfly' | 'firefly' | 'bird' | 'rain';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: Color;
  /** Phase for the swinging fall of leaves and petals. */
  phase: number;
  /** Whether the particle is drawn in front of everything (hearts, notes) or on the ground layer. */
  front: boolean;
}

export class ParticleSystem {
  readonly particles: Particle[] = [];
  readonly rng: Rng;
  constructor(seed: string) {
    this.rng = stream(seed, 'particles');
  }

  spawn(p: Omit<Particle, 'age'>): void {
    if (this.particles.length > 400) this.particles.shift();
    this.particles.push({ ...p, age: 0 });
  }

  leaf(x: number, y: number, color: Color): void {
    this.spawn({ kind: 'leaf', x, y, vx: this.rng.range(-4, 4), vy: this.rng.range(8, 14), life: this.rng.range(1.6, 2.8), color, phase: this.rng.range(0, 6.28), front: false });
  }
  petal(x: number, y: number, color: Color): void {
    this.spawn({ kind: 'petal', x, y, vx: this.rng.range(-6, 6), vy: this.rng.range(6, 10), life: this.rng.range(1.5, 2.5), color, phase: this.rng.range(0, 6.28), front: false });
  }
  sparkle(x: number, y: number, color: Color): void {
    this.spawn({ kind: 'sparkle', x, y, vx: 0, vy: 0, life: this.rng.range(0.3, 0.6), color, phase: 0, front: false });
  }
  heart(x: number, y: number): void {
    this.spawn({ kind: 'heart', x, y, vx: this.rng.range(-3, 3), vy: -10, life: 1.1, color: hex('#ff6b9a'), phase: this.rng.range(0, 6.28), front: true });
  }
  note(x: number, y: number): void {
    this.spawn({ kind: 'note', x, y, vx: this.rng.range(-2, 2), vy: -9, life: 1.2, color: hex('#3b2a5a'), phase: this.rng.range(0, 6.28), front: true });
  }
  exclaim(x: number, y: number): void {
    this.spawn({ kind: 'exclaim', x, y, vx: 0, vy: 0, life: 0.8, color: hex('#ffffff'), phase: 0, front: true });
  }
  smoke(x: number, y: number): void {
    this.spawn({ kind: 'smoke', x, y, vx: this.rng.range(1, 3), vy: this.rng.range(-7, -4), life: this.rng.range(1.4, 2.2), color: hex('#e8e6ea'), phase: this.rng.range(0, 6.28), front: true });
  }
  /** An expanding ring on the water, one pixel thin, fading as it grows. */
  ripple(x: number, y: number, color: Color): void {
    this.spawn({ kind: 'ripple', x, y, vx: 0, vy: 0, life: 1.6, color, phase: 0, front: false });
  }
  dust(x: number, y: number, color: Color): void {
    this.spawn({ kind: 'dust', x, y, vx: this.rng.range(-6, 6), vy: this.rng.range(-6, -2), life: 0.35, color, phase: 0, front: false });
  }
  /** A water drop: falls from a watering, a short arc under gravity. */
  drop(x: number, y: number, color: Color): void {
    this.spawn({ kind: 'drop', x, y, vx: this.rng.range(-5, 5), vy: this.rng.range(-14, -6), life: 0.45, color, phase: 0, front: true });
  }
  /** A butterfly: wings that flap, a wandering flight. */
  butterfly(x: number, y: number, color: Color): void {
    this.spawn({ kind: 'butterfly', x, y, vx: this.rng.range(-6, 6), vy: this.rng.range(-3, 3), life: this.rng.range(4, 7), color, phase: this.rng.range(0, 6.28), front: true });
  }
  /** A firefly: a slow drift and a soft pulse. */
  firefly(x: number, y: number): void {
    this.spawn({ kind: 'firefly', x, y, vx: this.rng.range(-2, 2), vy: this.rng.range(-2, 1), life: this.rng.range(3, 6), color: hex('#d8ff8a'), phase: this.rng.range(0, 6.28), front: true });
  }
  /** A small bird crossing the sky (a two-pixel V that beats its wings). */
  bird(x: number, y: number, dir: 1 | -1): void {
    this.spawn({ kind: 'bird', x, y, vx: dir * this.rng.range(28, 40), vy: this.rng.range(-3, 3), life: 9, color: hex('#3b3550'), phase: this.rng.range(0, 6.28), front: true });
  }
  /** A raindrop streak. */
  rain(x: number, y: number): void {
    this.spawn({ kind: 'rain', x, y, vx: -6, vy: 90, life: this.rng.range(0.5, 0.9), color: hex('#c8dcf8'), phase: 0, front: true });
  }
  /** A small "z" rising from a sleeping Blobbi. */
  zzz(x: number, y: number): void {
    this.spawn({ kind: 'zzz', x, y, vx: this.rng.range(1, 3), vy: -5, life: 1.6, color: hex('#e8f0ff'), phase: this.rng.range(0, 6.28), front: true });
  }

  step(dt: number): void {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      if (p.kind === 'leaf' || p.kind === 'petal') {
        p.x += (p.vx + Math.sin(p.age * 3 + p.phase) * 6) * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 'heart' || p.kind === 'note') {
        p.x += (p.vx + Math.sin(p.age * 5 + p.phase) * 4) * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 'smoke') {
        p.x += (p.vx + Math.sin(p.age * 2 + p.phase) * 2) * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 'dust') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 'drop') {
        p.vy += 60 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 'butterfly') {
        p.x += (p.vx + Math.sin(p.age * 2.3 + p.phase) * 8) * dt;
        p.y += (p.vy + Math.sin(p.age * 3.7 + p.phase) * 6) * dt;
      } else if (p.kind === 'firefly') {
        p.x += (p.vx + Math.sin(p.age * 1.3 + p.phase) * 3) * dt;
        p.y += (p.vy + Math.cos(p.age * 1.1 + p.phase) * 2) * dt;
      } else if (p.kind === 'bird' || p.kind === 'rain') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 'zzz') {
        p.x += (p.vx + Math.sin(p.age * 2 + p.phase) * 2) * dt;
        p.y += p.vy * dt;
      }
    }
  }

  /** Draw the particles of one layer into a frame buffer whose origin is at world (ox, oy). */
  draw(buf: PixelBuffer, ox: number, oy: number, front: boolean): void {
    for (const p of this.particles) {
      if (p.front !== front) continue;
      const x = Math.round(p.x) - ox;
      const y = Math.round(p.y) - oy;
      const t = p.age / p.life;
      switch (p.kind) {
        case 'leaf':
        case 'petal':
          buf.set(x, y, p.color);
          if (Math.sin(p.age * 3 + p.phase) > 0) buf.set(x + 1, y, p.color);
          break;
        case 'sparkle': {
          const c = p.color;
          buf.set(x, y, c);
          if (t > 0.3 && t < 0.7) {
            buf.set(x - 1, y, c);
            buf.set(x + 1, y, c);
            buf.set(x, y - 1, c);
            buf.set(x, y + 1, c);
          }
          break;
        }
        case 'heart':
          if (t < 0.85) {
            buf.set(x - 1, y - 1, p.color);
            buf.set(x + 1, y - 1, p.color);
            buf.hline(x - 1, x + 1, y, p.color);
            buf.set(x, y + 1, p.color);
          } else buf.set(x, y, p.color);
          break;
        case 'note':
          buf.vline(x + 1, y - 3, y, p.color);
          buf.set(x, y, p.color);
          buf.set(x + 2, y - 3, p.color);
          break;
        case 'exclaim': {
          const c = hex('#2b2340');
          buf.fillRect(x - 2, y - 7, 5, 7, hex('#ffffff'));
          buf.vline(x, y - 6, y - 3, c);
          buf.set(x, y - 1, c);
          buf.strokeRect(x - 3, y - 8, 7, 9, c);
          break;
        }
        case 'smoke': {
          const r = t < 0.5 ? 1 : 2;
          buf.fillRect(x - r + 1, y - r + 1, r, r, p.color);
          if (t > 0.5) buf.set(x - 1, y, p.color);
          break;
        }
        case 'dust':
        case 'drop':
          buf.set(x, y, p.color);
          break;
        case 'butterfly': {
          const open = Math.sin(p.age * 18 + p.phase) > 0;
          buf.set(x, y, hex('#3b3550'));
          if (open) {
            buf.set(x - 1, y - 1, p.color);
            buf.set(x + 1, y - 1, p.color);
          } else {
            buf.set(x - 1, y, p.color);
            buf.set(x + 1, y, p.color);
          }
          break;
        }
        case 'firefly': {
          const glow = 0.5 + 0.5 * Math.sin(p.age * 4 + p.phase);
          if (glow < 0.2 || t > 0.95) break;
          buf.set(x, y, p.color);
          if (glow > 0.75) {
            const halo = hex('#8acc5a');
            buf.set(x - 1, y, halo);
            buf.set(x + 1, y, halo);
            buf.set(x, y - 1, halo);
            buf.set(x, y + 1, halo);
          }
          break;
        }
        case 'bird': {
          const up = Math.sin(p.age * 10 + p.phase) > 0;
          buf.set(x, y, p.color);
          buf.set(x - 1, y + (up ? -1 : 0), p.color);
          buf.set(x + 1, y + (up ? -1 : 0), p.color);
          break;
        }
        case 'rain':
          buf.set(x, y, p.color);
          buf.set(x, y - 1, p.color);
          break;
        case 'zzz':
          // A dot that opens into a 3×3 "z".
          if (t < 0.25) buf.set(x, y, p.color);
          else {
            buf.hline(x - 1, x + 1, y - 1, p.color);
            buf.set(x, y, p.color);
            buf.hline(x - 1, x + 1, y + 1, p.color);
          }
          break;
        case 'ripple': {
          // Every other pixel of a growing ellipse, so it reads as a soft ring.
          const r = 2 + t * 9;
          const n = Math.max(8, Math.round(r * 4));
          for (let i = 0; i < n; i += 2) {
            const a = (i / n) * Math.PI * 2;
            if (t > 0.7 && i % 4 !== 0) continue;
            buf.set(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.55), p.color);
          }
          break;
        }
      }
    }
  }
}
