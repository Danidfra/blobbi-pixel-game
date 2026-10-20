import { readFileSync } from 'node:fs';

/** The size a PNG file's header declares (no decoder needed). */
export function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  if (b.subarray(1, 4).toString('ascii') !== 'PNG') throw new Error(`${file} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
