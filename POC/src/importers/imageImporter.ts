import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DesignDocument, ImportReport } from '../types/design.js';

export interface ImageImportResult {
  design: DesignDocument;
  report: ImportReport;
  assetPath: string;
}

export async function importImage(
  buffer: Buffer,
  originalFileName: string,
  assetsDir: string
): Promise<ImageImportResult> {
  await fs.mkdir(assetsDir, { recursive: true });
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 800;
  const height = metadata.height || 600;
  const format = metadata.format || 'png';

  const ext = format === 'jpeg' ? 'jpg' : format;
  const fileHash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 10);
  const assetFileName = `img_${fileHash}.${ext}`;
  const fullAssetPath = path.join(assetsDir, assetFileName);

  await fs.writeFile(fullAssetPath, buffer);

  const layerId = 'img-1';
  const design: DesignDocument = {
    id: `doc-${Date.now()}`,
    name: path.parse(originalFileName).name || 'Imported Image',
    width,
    height,
    backgroundColor: 'transparent',
    layers: [
      {
        id: layerId,
        type: 'image',
        name: originalFileName,
        x: 0,
        y: 0,
        width,
        height,
        opacity: 1,
        rotation: 0,
        visible: true,
        zIndex: 1,
        src: `/assets/${assetFileName}`,
        fit: 'contain',
        originalFileName,
      },
    ],
    meta: {
      sourceFormat: (format as any) || 'png',
      originalFileName,
      importedAt: new Date().toISOString(),
    },
  };

  const report: ImportReport = {
    totalLayers: 1,
    editableLayers: 0,
    rasterizedLayers: 1,
    unsupportedFeatures: [],
    missingFonts: [],
    warnings: [],
    details: [
      {
        layerId,
        name: originalFileName,
        type: 'image',
        status: 'rasterized',
        notes: `Imported single ${format.toUpperCase()} bitmap image (${width}x${height})`,
      },
    ],
  };

  return {
    design,
    report,
    assetPath: fullAssetPath,
  };
}
