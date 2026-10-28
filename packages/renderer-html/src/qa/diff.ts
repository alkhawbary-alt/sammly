import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import sharp from 'sharp';

export interface ImageDiff {
  width: number;
  height: number;
  diffPixels: number;
  /** 0..100 */
  diffPercentage: number;
  /** 0..100, what the admin shows as the QA score. */
  matchPercentage: number;
  /** Red-highlighted diff image (PNG). */
  diffPng: Buffer;
}

/**
 * Pixel-diff two images (PNG/JPG/WebP buffers). Both are resized to the larger size and
 * flattened onto white so transparent areas compare consistently. Storage-agnostic port
 * of POC/src/rendering/visualDiff.ts.
 */
export async function compareImages(a: Buffer, b: Buffer, threshold = 0.1): Promise<ImageDiff> {
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  const width = Math.max(ma.width ?? 1, mb.width ?? 1);
  const height = Math.max(ma.height ?? 1, mb.height ?? 1);
  const raw = (buf: Buffer) =>
    sharp(buf).resize(width, height, { fit: 'fill' }).flatten({ background: '#ffffff' }).ensureAlpha().raw().toBuffer();
  const [ra, rb] = await Promise.all([raw(a), raw(b)]);

  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(ra, rb, diff.data, width, height, { threshold, includeAA: false, diffColor: [255, 0, 75] });
  const diffPercentage = Math.round((diffPixels / (width * height)) * 10000) / 100;
  return {
    width,
    height,
    diffPixels,
    diffPercentage,
    matchPercentage: Math.round((100 - diffPercentage) * 100) / 100,
    diffPng: PNG.sync.write(diff),
  };
}
