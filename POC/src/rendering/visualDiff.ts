import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface VisualDiffResult {
  totalPixels: number;
  diffPixels: number;
  diffPercentage: number;
  diffImagePath: string;
  diffImageUrl: string;
  originalWidth: number;
  originalHeight: number;
}

export async function compareImages(
  originalImagePath: string,
  renderedImagePath: string,
  outputDir: string
): Promise<VisualDiffResult> {
  const origMetadata = await sharp(originalImagePath).metadata();
  const rendMetadata = await sharp(renderedImagePath).metadata();

  const targetWidth = Math.max(origMetadata.width || 1, rendMetadata.width || 1);
  const targetHeight = Math.max(origMetadata.height || 1, rendMetadata.height || 1);

  // Resize both images to target size as 4-channel raw RGBA buffers
  const origRaw = await sharp(originalImagePath)
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const rendRaw = await sharp(renderedImagePath)
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const diffPng = new PNG({ width: targetWidth, height: targetHeight });
  const totalPixels = targetWidth * targetHeight;

  const diffPixels = pixelmatch(
    origRaw,
    rendRaw,
    diffPng.data,
    targetWidth,
    targetHeight,
    {
      threshold: 0.1,
      includeAA: false,
      diffColor: [255, 0, 75],
    }
  );

  const diffFileName = `diff_${Date.now()}.png`;
  const diffImagePath = path.join(outputDir, diffFileName);

  const diffBuffer = PNG.sync.write(diffPng);
  await fs.writeFile(diffImagePath, diffBuffer);

  const diffPercentage = parseFloat(((diffPixels / totalPixels) * 100).toFixed(2));

  return {
    totalPixels,
    diffPixels,
    diffPercentage,
    diffImagePath,
    diffImageUrl: `/renders/${diffFileName}`,
    originalWidth: targetWidth,
    originalHeight: targetHeight,
  };
}
