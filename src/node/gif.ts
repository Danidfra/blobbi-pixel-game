/**
 * A minimal animated GIF writer for Node scripts: frames of the same size, each with its own colour table (pixel
 * art has few colours; frames with more than 256 are refused), no dithering, no resampling, looping forever.
 * Transparent pixels become the frame's first colour.
 */
import type { PixelBuffer } from '../core/pixel';

export function toGif(frames: readonly PixelBuffer[], delayMs: number): Buffer {
  if (!frames.length) throw new Error('gif: no frames');
  const { width, height } = frames[0];
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 255, (v >> 8) & 255);
  out.push(...Buffer.from('GIF89a'));
  u16(width);
  u16(height);
  out.push(0x00, 0, 0); // no global colour table
  // Loop forever (NETSCAPE2.0).
  out.push(0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 0x03, 0x01, 0x00, 0x00, 0x00);
  for (const f of frames) {
    if (f.width !== width || f.height !== height) throw new Error('gif: frames differ in size');
    const palette = new Map<number, number>();
    const indices = new Uint8Array(width * height);
    for (let i = 0; i < f.data.length; i++) {
      const c = f.data[i] >>> 24 ? f.data[i] & 0xffffff : 0;
      let k = palette.get(c);
      if (k === undefined) {
        k = palette.size;
        if (k >= 256) throw new Error('gif: more than 256 colours in a frame');
        palette.set(c, k);
      }
      indices[i] = k;
    }
    const bits = 8;
    // Graphic control: delay in hundredths of a second, no transparency.
    out.push(0x21, 0xf9, 0x04, 0x00);
    u16(Math.round(delayMs / 10));
    out.push(0x00, 0x00);
    // Image descriptor with a local colour table of 2^bits entries.
    out.push(0x2c);
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    out.push(0x80 | (bits - 1));
    const table = new Array<number>(3 * (1 << bits)).fill(0);
    for (const [c, k] of palette) {
      table[k * 3] = c & 255;
      table[k * 3 + 1] = (c >> 8) & 255;
      table[k * 3 + 2] = (c >> 16) & 255;
    }
    out.push(...table);
    out.push(bits);
    const data = lzw(indices, bits);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      out.push(chunk.length, ...chunk);
    }
    out.push(0x00);
  }
  out.push(0x3b);
  return Buffer.from(out);
}

/** GIF's variable-width LZW. */
function lzw(indices: Uint8Array, minBits: number): number[] {
  const clear = 1 << minBits;
  const end = clear + 1;
  const bytes: number[] = [];
  let acc = 0;
  let accBits = 0;
  let size = minBits + 1;
  const emit = (code: number) => {
    acc |= code << accBits;
    accBits += size;
    while (accBits >= 8) {
      bytes.push(acc & 255);
      acc >>>= 8;
      accBits -= 8;
    }
  };
  let dict = new Map<string, number>();
  let next = end + 1;
  emit(clear);
  let prefix = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = `${prefix},${k}`;
    if (dict.has(key)) {
      prefix = key;
      continue;
    }
    emit(prefix.includes(',') ? dict.get(prefix)! : Number(prefix));
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map();
      next = end + 1;
      size = minBits + 1;
    }
    prefix = String(k);
  }
  emit(prefix.includes(',') ? dict.get(prefix)! : Number(prefix));
  emit(end);
  if (accBits > 0) bytes.push(acc & 255);
  return bytes;
}
