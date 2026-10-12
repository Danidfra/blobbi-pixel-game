/**
 * MARINE LIFE ON SCREEN (M10): the sea's creatures (`src/game/marine-life.ts`) drawn in world pixels into the live
 * frame, after the animated water and before anything that stands: fish and jellyfish under the surface (only
 * over water, tinted by it), a dolphin's fin and its leaps, the curious seal's head bobbing up (it turns to watch
 * the Blobbi and comes a little closer when it is near), the glowing ray lighting the water around it at night.
 * A handful of tiny sprites a frame; nothing here changes the simulation.
 */
import type { PixelBuffer } from '../core/pixel';
import { hex, mix, type Color } from '../core/color';
import type { WorldPalette } from '../core/palette';
import type { LiveWorld } from '../sim/live-world';
import type { Sighting } from '../game/marine-life';

const INK = hex('#1b1f2a');
const SEAL = { dark: hex('#4e5060'), mid: hex('#7d8090'), light: hex('#a9abb8'), muzzle: hex('#cfc6bc'), belly: hex('#ded6cc') };
const DOLPHIN = { back: hex('#5d7898'), mid: hex('#7f9ab8'), belly: hex('#d4e0ec') };
const JELLY = hex('#f2b6e6');
const JELLY_NIGHT = hex('#ffd8ff');
const RAY_GLOW = hex('#7ae8f0');
const RAY_CORE = hex('#e8ffff');

/** Seal head rows (facing right): d dark, m mid, l light, u muzzle, e eye. Bottom row sits on the water line. */
const SEAL_HEAD = ['.mmmm.', 'mllmem', 'mllmuu', 'dmmmu.', '.dddd.'];
const SEAL_ROLL = ['.mmmm.', 'mbbbbm', 'bbbbbb', 'mbbbbm', '.dddd.'];

export function drawMarine(frame: PixelBuffer, live: LiveWorld, ox: number, oy: number, time: number, palette: WorldPalette): void {
  const W = frame.width;
  const H = frame.height;
  const sea = live.marine;
  const under = (c: Color, k = 0.45) => mix(c, palette.water.dark, k);
  for (const s of live.sightings()) {
    if (s.x < ox - 24 || s.x > ox + W + 24 || s.y < oy - 24 || s.y > oy + H + 24) continue;
    const fade = Math.min(1, s.age / 1.2, (s.span - s.age) / 1.2);
    // Under the surface: only over water, and only while fully there (no pop-in at the edges of a sighting).
    const wet = (x: number, y: number, c: Color) => {
      if (sea.wet(x, y)) frame.set(x - ox, y - oy, c);
    };
    const cx = Math.round(s.x);
    const cy = Math.round(s.y);
    switch (s.kind) {
      case 'school': {
        if (fade < 0.35) break;
        const n = 5 + (s.seed % 4);
        const body = under(hex('#2a3a52'), 0.35);
        for (let i = 0; i < n; i++) {
          const hx = ((s.seed >>> (i * 3)) & 7) - 4;
          const hy = ((s.seed >>> (i * 2 + 5)) & 3) - 1;
          const wig = Math.round(Math.sin(time * 7 + i * 1.7));
          const x = cx + hx * 2 + wig;
          const y = cy + hy * 2;
          wet(x, y, body);
          wet(x - s.dir, y, body);
          // A glint now and then, as a fish turns.
          if (Math.floor(time * 3 + i * 0.37) % 7 === 0) wet(x + s.dir, y, palette.water.light);
        }
        break;
      }
      case 'jelly': {
        if (fade < 0.3) break;
        const night = live.ambientLight().night;
        const c = night ? JELLY_NIGHT : under(JELLY, 0.4);
        const pulse = Math.floor(time * 1.6 + (s.seed & 7)) % 2;
        wet(cx, cy - 1 - pulse, c);
        wet(cx - 1, cy, c);
        wet(cx, cy, c);
        wet(cx + 1, cy, c);
        wet(cx - 1, cy + 1 + pulse, under(c, 0.3));
        wet(cx + 1, cy + 2, under(c, 0.3));
        if (night) for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2 - pulse]]) wet(cx + dx, cy + dy, mix(palette.water.mid, JELLY_NIGHT, 0.35));
        break;
      }
      case 'dolphin': {
        if (fade <= 0) break;
        // Leaps every 2.2 s; between them a fin cuts the surface with a little wake.
        const q = (s.age % 2.2) / 2.2;
        if (q < 0.42) {
          const k = q / 0.42;
          const lift = Math.round(Math.sin(k * Math.PI) * 6);
          const tilt = k < 0.35 ? -1 : k > 0.65 ? 1 : 0; // nose up, level, nose down
          for (let i = -5; i <= 5; i++) {
            const x = cx + i * s.dir;
            const y = cy - lift + Math.round((i * tilt) / 2.5);
            const end = Math.abs(i) === 5;
            frame.set(x - ox, y - oy, end ? DOLPHIN.back : DOLPHIN.mid);
            if (!end) frame.set(x - ox, y + 1 - oy, Math.abs(i) < 4 ? DOLPHIN.belly : DOLPHIN.mid);
            if (Math.abs(i) < 3) frame.set(x - ox, y - 1 - oy, DOLPHIN.back);
            if (i === -1 || i === 0) frame.set(x - ox, y - 2 - oy, DOLPHIN.back); // the dorsal fin
          }
          frame.set(cx + 4 * s.dir - ox, cy - lift + Math.round((4 * tilt) / 2.5) - oy, INK); // the eye
          for (const d of [-1, 1]) frame.set(cx - 6 * s.dir - ox, cy - lift + d + Math.round((-6 * tilt) / 2.5) - oy, DOLPHIN.back); // the flukes
          // Splashes where it left and where it lands.
          if (k < 0.2) for (const d of [-2, 0, 2]) frame.set(cx - 5 * s.dir + d - ox, cy + 1 - oy, palette.foam);
          if (k > 0.8) for (const d of [-2, 0, 2]) frame.set(cx + 5 * s.dir + d - ox, cy + 1 - oy, palette.foam);
        } else {
          frame.set(cx - ox, cy - 2 - oy, DOLPHIN.back);
          frame.set(cx - ox, cy - 1 - oy, DOLPHIN.back);
          frame.set(cx - s.dir - ox, cy - 1 - oy, DOLPHIN.back);
          for (let i = -2; i <= 2; i++) frame.set(cx + i - ox, cy - oy, DOLPHIN.mid);
          wet(cx - 2 * s.dir, cy, palette.water.light);
          wet(cx - 4 * s.dir, cy, palette.water.light);
        }
        break;
      }
      case 'seal': {
        drawSeal(frame, live, s, ox, oy, time, palette);
        break;
      }
      case 'glowray': {
        if (fade <= 0) break;
        // The water around it lit, in a dithered ring, then the ray: a dark diamond with glowing spots.
        for (let dy = -6; dy <= 6; dy++)
          for (let dx = -9; dx <= 9; dx++) {
            const r = Math.hypot(dx / 9, dy / 6);
            if (r > 1 || (dx + dy + Math.floor(time * 2)) % 3 !== 0) continue;
            wet(cx + dx, cy + dy, mix(palette.water.mid, RAY_GLOW, 0.3 * (1 - r) * fade));
          }
        const flap = Math.round(Math.sin(time * 2.2 + (s.seed & 7)));
        const body = under(hex('#283a68'), 0.2);
        for (let dx = -5; dx <= 5; dx++) {
          const half = Math.max(0, 3 - Math.round(Math.abs(dx) * 0.55)) + (Math.abs(dx) >= 4 ? flap : 0);
          for (let dy = -half; dy <= Math.max(0, half - 1); dy++) wet(cx + dx, cy + dy, body);
        }
        for (let k = 1; k <= 4; k++) wet(cx - s.dir * (5 + k), cy + (k > 2 ? 1 : 0), body); // the tail
        const lit = 0.5 + 0.5 * Math.sin(time * 3);
        wet(cx, cy, RAY_CORE);
        wet(cx - 2, cy - 1, mix(body, RAY_GLOW, lit));
        wet(cx + 2, cy - 1, mix(body, RAY_GLOW, lit));
        wet(cx - 3, cy + 1, mix(body, RAY_GLOW, 1 - lit));
        wet(cx + 3, cy + 1, mix(body, RAY_GLOW, 1 - lit));
        break;
      }
    }
  }
}

/** The curious seal: rises, watches the Blobbi, edges closer when it is near, rolls over when waved to. */
function drawSeal(frame: PixelBuffer, live: LiveWorld, s: Sighting, ox: number, oy: number, time: number, palette: WorldPalette): void {
  const b = live.blobbi;
  // Curious: within a few steps, it comes up to six pixels closer to the shore the Blobbi stands on.
  const shore = s.shore ?? { x: b.x, y: b.y };
  const near = Math.hypot(b.x - s.x, b.y - s.y) < 60 ? 1 : 0;
  const pull = near * Math.min(1, s.age / 4);
  const len = Math.max(1, Math.hypot(shore.x - s.x, shore.y - s.y));
  let x = Math.round(s.x + ((shore.x - s.x) / len) * 6 * pull);
  let y = Math.round(s.y + ((shore.y - s.y) / len) * 6 * pull);
  // Never onto land.
  if (!live.marine.wet(x, y)) {
    x = Math.round(s.x);
    y = Math.round(s.y);
  }
  // Rising out of the water and sinking back: rows above the water line shown.
  const up = Math.min(1, s.age / 1, (s.span - s.age) / 1);
  if (up <= 0) return;
  const rows = Math.max(1, Math.round(up * 5));
  const bob = Math.round(Math.sin(time * 2.5 + (s.seed & 7)) * 0.6);
  const face = b.x >= x ? 1 : -1;
  const happy = live.sealHappy && live.sealHappy.id === s.id && live.clock.time < live.sealHappy.until;
  const art = happy && Math.floor(live.clock.time * 6) % 2 ? SEAL_ROLL : SEAL_HEAD;
  const colours: Record<string, Color> = { d: SEAL.dark, m: SEAL.mid, l: SEAL.light, u: SEAL.muzzle, e: INK, b: SEAL.belly };
  const w = art[0].length;
  for (let r = 5 - rows; r < 5; r++)
    for (let c = 0; c < w; c++) {
      const ch = art[r][face > 0 ? c : w - 1 - c];
      if (ch === '.') continue;
      frame.set(x - 3 + c - ox, y - 4 + r + bob - oy, colours[ch]);
    }
  // The ring it makes in the water.
  for (const dx of [-4, -3, 3, 4]) frame.set(x + dx - ox, y + 1 + bob - oy, palette.foam);
  if (happy) for (const dx of [-5, 5]) frame.set(x + dx - ox, y - 1 - oy, palette.foam);
}

/**
 * The ocean's features (M10 phase B): the message bottle bobbing (cork up), the kelp garden's ribbons swaying under
 * the surface, the silver shoal turning in a cloud of glints. In world pixels, over water only (the bottle's top
 * sits above it).
 */
export function drawOceanFeatures(frame: PixelBuffer, live: LiveWorld, ox: number, oy: number, time: number, palette: WorldPalette): void {
  const W = frame.width;
  const H = frame.height;
  const sea = live.marine;
  const wet = (x: number, y: number, c: Color) => {
    if (sea.wet(x, y)) frame.set(x - ox, y - oy, c);
  };
  for (const f of live.oceanNow()) {
    if (f.x < ox - 30 || f.x > ox + W + 30 || f.y < oy - 30 || f.y > oy + H + 30) continue;
    if (f.kind === 'bottle') {
      const bob = Math.round(Math.sin(time * 2.2) * 0.6);
      const glass = hex('#5a9ab8');
      const shine = hex('#b8e0f0');
      const cork = hex('#b07a3a');
      const x = f.x;
      const y = f.y + bob;
      for (const [dx, dy, c] of [[0, -4, cork], [0, -3, glass], [-1, -2, glass], [0, -2, shine], [1, -2, glass], [-1, -1, glass], [0, -1, glass], [1, -1, glass]] as const) frame.set(x + dx - ox, y + dy - oy, c);
      for (const dx of [-3, -2, 2, 3]) wet(x + dx, y, palette.water.light);
    } else if (f.kind === 'kelp') {
      const ready = live.kelpReady();
      const dark = mix(hex('#2a5a3a'), palette.water.dark, 0.35);
      const light = mix(hex('#5aa06a'), palette.water.dark, 0.3);
      // Eight ribbons rooted round the spot, swaying; shorter for a day after gathering.
      for (let k = 0; k < 8; k++) {
        const rx = f.x + ((k * 37) % 23) - 11;
        const ry = f.y + ((k * 53) % 13) - 6;
        const len = ready ? 5 + (k % 3) : 2;
        for (let i = 0; i < len; i++) {
          const sway = Math.round(Math.sin(time * 1.4 + k + i * 0.6) * (i / 3));
          wet(rx + sway, ry - i, i === len - 1 ? light : dark);
        }
      }
    } else {
      // A cloud of little fish turning together: glints that flicker on and off.
      const turn = Math.sin(time * 0.9) * 6;
      for (let k = 0; k < 26; k++) {
        const a = k * 2.399;
        const r = 3 + ((k * 7) % 9);
        const x = Math.round(f.x + Math.cos(a) * r * 1.4 + turn * Math.sin(k));
        const y = Math.round(f.y + Math.sin(a) * r * 0.7);
        const on = (Math.floor(time * 6) + k) % 4;
        wet(x, y, on === 0 ? hex('#ffffff') : on === 1 ? hex('#c8d0e8') : mix(hex('#9aa8c0'), palette.water.dark, 0.4));
      }
    }
  }
}
