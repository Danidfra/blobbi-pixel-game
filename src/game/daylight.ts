/**
 * DAY AND NIGHT from saved world time. A day lasts `DAY_SECONDS` of world time (which only passes while the game
 * runs); world time 0 is a fresh morning. Light is presentation only: nothing grows, decays or happens differently
 * at night (crops are pure functions of world time), and the night tint stays light enough to play in.
 */
import { t as tr } from '../i18n';
export const DAY_SECONDS = 1200;
/** The hour world time 0 begins at. */
export const START_HOUR = 7;
export const DAWN_HOUR = 6;

/** Hour of the day 0..24 at a world time. */
export const hourAt = (t: number): number => (((START_HOUR + (t / DAY_SECONDS) * 24) % 24) + 24) % 24;

/** Days begun since world time 0 (day 1 is the first). */
export const dayAt = (t: number): number => Math.floor(((t / DAY_SECONDS) * 24 + START_HOUR - DAWN_HOUR) / 24) + 1;

/** World time of the next dawn after t. */
export function nextDawn(t: number): number {
  const hoursUntil = (DAWN_HOUR - hourAt(t) + 24) % 24 || 24;
  return t + (hoursUntil / 24) * DAY_SECONDS;
}

/** "9:40 in the morning" style. */
export function clockLabel(t: number): string {
  const h = hourAt(t);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 6) * 10;
  const part = hh < 5 ? 'night' : hh < 12 ? 'morning' : hh < 17 ? 'afternoon' : hh < 21 ? 'evening' : 'night';
  const h12 = ((hh + 11) % 12) + 1;
  // In the player's language (M11B): "7:30 in the morning", "7h30 da manhã", "7:30 de la mañana".
  return tr(`clock.${part}`, { h: h12, mm: String(mm).padStart(2, '0') });
}

/** The hour on a 12-hour clock (for "it is one o'clock" agreement). */
export const clockHour = (t: number): number => ((Math.floor(hourAt(t)) + 11) % 12) + 1;

/**
 * Light at a world time: `dark` 0 (full day) .. 0.45 (deep night; never darker, so the island stays readable), and
 * `warm` 0..1 around dawn and dusk (a golden hour).
 */
export function lightAt(t: number): { dark: number; warm: number; night: boolean } {
  const h = hourAt(t);
  // Daylight ramps: night until 5, dawn 5-7, day 7-18, dusk 18-20.5, night after.
  let day: number;
  if (h < 5 || h >= 20.5) day = 0;
  else if (h < 7) day = (h - 5) / 2;
  else if (h < 18) day = 1;
  else day = 1 - (h - 18) / 2.5;
  // A golden hour around dawn (over by 7:00, when a new world begins) and around dusk.
  const warm = h >= 5 && h < 7 ? 1 - Math.abs(h - 6) : h >= 17 && h < 20.5 ? 1 - Math.abs(h - 18.8) / 1.7 : 0;
  return { dark: (1 - day) * 0.45, warm: Math.max(0, warm), night: day < 0.25 };
}

/**
 * Weather from the world seed and world time: about one day in four has a gentle afternoon shower (13:00-16:00,
 * easing in and out). Deterministic; rain waters the outdoor crops it falls on and is otherwise only scenery.
 */
export function rainAt(worldSeed: string, t: number): number {
  const day = Math.floor(((t / DAY_SECONDS) * 24 + START_HOUR) / 24);
  let h = 2166136261;
  for (const ch of `${worldSeed}/rain/${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  if ((h >>> 0) % 4 !== 1) return 0;
  const hour = hourAt(t);
  if (hour < 13 || hour >= 16) return 0;
  return Math.min(1, (hour - 13) / 0.5, (16 - hour) / 0.5);
}

/** A light source for the night: where and how far its warm pool reaches (world pixels). */
export interface LightSource {
  x: number;
  y: number;
  radius: number;
}

/**
 * Light a frame for the time of day (and rain): darken toward a cool night blue, warm toward gold at dawn and dusk,
 * keep warm pools of light around lamps. `ox`, `oy` are the frame's world origin. Never darker than `lightAt`
 * allows, so the island stays readable at night.
 */
export function applyLight(data: Uint32Array, width: number, height: number, ox: number, oy: number, light: { dark: number; warm: number }, rain: number, lights: readonly LightSource[]): void {
  const dark = Math.min(0.5, light.dark + rain * 0.12);
  const warm = light.warm;
  if (dark < 0.01 && warm < 0.01) return;
  const near = lights.filter((l) => l.x + l.radius >= ox && l.x - l.radius < ox + width && l.y + l.radius >= oy && l.y - l.radius < oy + height);
  // Away from every lamp each channel depends on itself alone: three 256-entry tables give exactly the per-pixel
  // formula below, without its floating point on every pixel (most of a frame, every frame of a night or rain).
  const lr = LIGHT_TABLES.r;
  const lg = LIGHT_TABLES.g;
  const lb = LIGHT_TABLES.b;
  for (let v = 0; v < 256; v++) {
    lr[v] = Math.min(255, Math.max(0, v * (1 - dark * 1.05) * (1 + warm * 0.1)));
    lg[v] = Math.min(255, Math.max(0, v * (1 - dark * 0.9) * (1 - warm * 0.03))) << 8;
    lb[v] = Math.min(255, Math.max(0, v * (1 - dark * 0.45) * (1 - warm * 0.18) + dark * 40)) << 16;
  }
  for (let y = 0; y < height; y++) {
    // A row no lamp reaches: tables only.
    let lit = false;
    for (const l of near) if (Math.abs(y + oy - l.y) * 1.3 < l.radius) lit = true;
    if (!lit) {
      for (let i = y * width, end = i + width; i < end; i++) {
        const c = data[i];
        if (c >>> 24 === 0) continue;
        data[i] = ((c & 0xff000000) | lb[(c >>> 16) & 0xff] | lg[(c >>> 8) & 0xff] | lr[c & 0xff]) >>> 0;
      }
      continue;
    }
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const c = data[i];
      if (c >>> 24 === 0) continue;
      let f = 1;
      for (const l of near) {
        const dx = x + ox - l.x;
        const dy = (y + oy - l.y) * 1.3;
        const d2 = dx * dx + dy * dy;
        if (d2 < l.radius * l.radius) f = Math.min(f, Math.sqrt(d2) / l.radius);
      }
      const d = dark * f;
      const glow = (1 - f) * light.dark * 1.2; // warm light where a lamp reaches
      let r = c & 0xff;
      let g = (c >>> 8) & 0xff;
      let b = (c >>> 16) & 0xff;
      r = r * (1 - d * 1.05) * (1 + warm * 0.1) + glow * 40;
      g = g * (1 - d * 0.9) * (1 - warm * 0.03) + glow * 28;
      b = b * (1 - d * 0.45) * (1 - warm * 0.18) + d * 40;
      data[i] = ((c & 0xff000000) | (Math.min(255, Math.max(0, b)) << 16) | (Math.min(255, Math.max(0, g)) << 8) | Math.min(255, Math.max(0, r))) >>> 0;
    }
  }
}

/** Per-channel tables for `applyLight`, refilled for each call (the red one holds floats, truncated on use). */
const LIGHT_TABLES = { r: new Float64Array(256), g: new Int32Array(256), b: new Int32Array(256) };
