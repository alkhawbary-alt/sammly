import { createCanvas, ImageData, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import { initializeCanvas } from 'ag-psd';

let initialised = false;

/** ag-psd decodes layer pixels into @napi-rs/canvas canvases. */
export function ensureAgPsdCanvas(): void {
  if (initialised) return;
  initializeCanvas(createCanvas as never, ((w: number, h: number) => new ImageData(w, h)) as never);
  initialised = true;
}

export type Surface = Canvas;
export type Ctx2D = SKRSContext2D;

export function surface(w: number, h: number): Surface {
  return createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

export function ctx(s: Surface): Ctx2D {
  return s.getContext('2d');
}

export function copy(s: Surface): Surface {
  const c = surface(s.width, s.height);
  ctx(c).drawImage(s, 0, 0);
  return c;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounding box of pixels with alpha > 0, or null when fully transparent. */
export function alphaBounds(s: Surface): Rect | null {
  const { width: w, height: h } = s;
  const d = ctx(s).getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (d[row + x * 4 + 3]! > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function crop(s: Surface, r: Rect): Surface {
  const c = surface(r.w, r.h);
  ctx(c).drawImage(s, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return c;
}

/** A full-document surface holding `layerCanvas` at (left, top). */
export function placed(layerCanvas: Surface, left: number, top: number, W: number, H: number): Surface {
  const s = surface(W, H);
  ctx(s).drawImage(layerCanvas, Math.round(left), Math.round(top));
  return s;
}

/** Multiply every pixel's alpha by `k` (0..1). */
export function scaleAlpha(s: Surface, k: number): Surface {
  if (k >= 1) return s;
  const out = surface(s.width, s.height);
  const c = ctx(out);
  c.globalAlpha = Math.max(0, k);
  c.drawImage(s, 0, 0);
  return out;
}

/** Keep `s` only where `mask` (alpha channel) is opaque. Returns a new surface. */
export function maskedBy(s: Surface, mask: Surface): Surface {
  const out = copy(s);
  const c = ctx(out);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(mask, 0, 0);
  return out;
}

/** Solid silhouette of `s` in `color`. */
export function silhouette(s: Surface, color: string): Surface {
  const out = copy(s);
  const c = ctx(out);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, out.width, out.height);
  return out;
}

export async function encodePng(s: Surface): Promise<Buffer> {
  return s.encode('png');
}
