/** PNG export for Node scripts and tests (pngjs is a pure-JS encoder, not artwork). */
import { PNG } from 'pngjs';
import type { PixelBuffer } from '../core/pixel';

export function toPng(buf: PixelBuffer): Buffer {
  const png = new PNG({ width: buf.width, height: buf.height });
  // PixelBuffer packs bytes as R,G,B,A in little-endian Uint32; copy via a byte view.
  const bytes = new Uint8Array(buf.data.buffer, buf.data.byteOffset, buf.data.byteLength);
  png.data = Buffer.from(bytes);
  return PNG.sync.write(png);
}
