/**
 * THE CANVAS'S BACKING STORE. The game draws in canvas pixels and the page shows them with nearest-neighbour
 * scaling (`image-rendering: pixelated`). Each canvas pixel must cover a whole number of device pixels: at a
 * fractional device pixel ratio (Windows at 125 % or 150 %, most Android phones at 2.625 or 2.75, a browser zoom)
 * a canvas the size of its CSS box covers 1.25 or 2.625 device pixels per canvas pixel, so blocks alternate in
 * width and shimmer as the world scrolls.
 *
 * At a whole ratio (1, 2, 3) nothing changes: the canvas is its CSS size, exactly as before. Otherwise a canvas
 * pixel becomes `round(ratio)` device pixels (never fewer than one), and the element is sized in CSS pixels to
 * show exactly that. The world then looks smaller or larger than at the CSS size by ratio/round(ratio) (1.25: 0.8×;
 * 1.5: 1.33×; 2.625: 1.14×), and crisp.
 *
 * OFF BY DEFAULT (`wholeDevicePixels`): fewer canvas pixels can cost the menus a whole UI scale (a phone held sideways
 * at 2.625, 412 CSS pixels tall, gets 360 canvas pixels: the 2× panel no longer fits and drops to 1×, too small to
 * read). Until that is designed for, the page keeps a canvas the size of its CSS box (whole canvas pixels, shown one
 * to one at a whole ratio), as before.
 */

export interface Backing {
  /** The canvas's size in canvas pixels. */
  width: number;
  height: number;
  /** The element's size in CSS pixels (shows each canvas pixel as `devicePerPixel` device pixels). */
  cssWidth: number;
  cssHeight: number;
  /** Device pixels per canvas pixel (a whole number). */
  devicePerPixel: number;
}

/** The backing store for a CSS box of `cssW`×`cssH` at device pixel ratio `dpr`. */
export function canvasBacking(cssW: number, cssH: number, dpr: number, opts: { wholeDevicePixels?: boolean } = {}): Backing {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const k = Math.max(1, Math.round(ratio));
  if (Math.abs(ratio - k) < 0.01 || !opts.wholeDevicePixels) {
    const width = Math.max(1, Math.floor(cssW));
    const height = Math.max(1, Math.floor(cssH));
    return { width, height, cssWidth: width, cssHeight: height, devicePerPixel: k };
  }
  // Whole device pixels inside the box (never past its edge), then whole groups of k of them.
  const width = Math.max(1, Math.floor(Math.floor(cssW * ratio + 1e-6) / k));
  const height = Math.max(1, Math.floor(Math.floor(cssH * ratio + 1e-6) / k));
  return { width, height, cssWidth: (width * k) / ratio, cssHeight: (height * k) / ratio, devicePerPixel: k };
}
