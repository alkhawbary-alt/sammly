import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DesignDocument, ImportReport } from '../types/design.js';

export interface SvgImportResult {
  design: DesignDocument;
  report: ImportReport;
  assetPath: string;
}

export async function importSvg(
  content: string | Buffer,
  originalFileName: string,
  assetsDir: string
): Promise<SvgImportResult> {
  await fs.mkdir(assetsDir, { recursive: true });
  const svgString = Buffer.isBuffer(content) ? content.toString('utf-8') : content;

  // Extract dimensions from SVG attributes or viewBox
  let width = 800;
  let height = 600;

  const widthMatch = svgString.match(/\bwidth=["']([0-9.]+)(?:px)?["']/i);
  const heightMatch = svgString.match(/\bheight=["']([0-9.]+)(?:px)?["']/i);
  const viewBoxMatch = svgString.match(/\bviewBox=["']\s*([0-9.-]+)\s+([0-9.-]+)\s+([0-9.]+)\s+([0-9.]+)\s*["']/i);

  if (widthMatch && heightMatch) {
    width = Math.round(parseFloat(widthMatch[1]));
    height = Math.round(parseFloat(heightMatch[1]));
  } else if (viewBoxMatch) {
    width = Math.round(parseFloat(viewBoxMatch[3]));
    height = Math.round(parseFloat(viewBoxMatch[4]));
  }

  const fileHash = crypto.createHash('md5').update(svgString).digest('hex').slice(0, 10);
  const assetFileName = `svg_${fileHash}.svg`;
  const fullAssetPath = path.join(assetsDir, assetFileName);

  await fs.writeFile(fullAssetPath, svgString, 'utf-8');

  const layerId = 'svg-1';
  const design: DesignDocument = {
    id: `doc-${Date.now()}`,
    name: path.parse(originalFileName).name || 'Imported SVG',
    width: width || 800,
    height: height || 600,
    backgroundColor: 'transparent',
    layers: [
      {
        id: layerId,
        type: 'svg',
        name: originalFileName,
        x: 0,
        y: 0,
        width: width || 800,
        height: height || 600,
        opacity: 1,
        rotation: 0,
        visible: true,
        zIndex: 1,
        src: `/assets/${assetFileName}`,
        svgContent: svgString,
      },
    ],
    meta: {
      sourceFormat: 'svg',
      originalFileName,
      importedAt: new Date().toISOString(),
    },
  };

  const report: ImportReport = {
    totalLayers: 1,
    editableLayers: 1,
    rasterizedLayers: 0,
    unsupportedFeatures: [],
    missingFonts: [],
    warnings: [],
    details: [
      {
        layerId,
        name: originalFileName,
        type: 'svg',
        status: 'editable',
        notes: `Imported SVG document preserved as vector SVG layer (${width}x${height})`,
      },
    ],
  };

  return {
    design,
    report,
    assetPath: fullAssetPath,
  };
}
