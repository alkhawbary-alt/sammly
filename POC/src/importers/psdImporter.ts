import { createCanvas, ImageData } from '@napi-rs/canvas';
import { initializeCanvas, readPsd, Layer as AgPsdLayer, Psd } from 'ag-psd';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  DesignDocument,
  Layer,
  ImportReport,
  ImportReportItem,
  TextStyle,
} from '../types/design.js';

// Initialize ag-psd canvas implementation with @napi-rs/canvas
const createImageData = (w: number, h: number) => new ImageData(w, h);
initializeCanvas(createCanvas as any, createImageData as any);

const WEB_SAFE_FONTS = new Set([
  'arial',
  'helvetica',
  'times new roman',
  'times',
  'georgia',
  'courier new',
  'courier',
  'verdana',
  'tahoma',
  'trebuchet ms',
  'impact',
  'roboto',
  'open sans',
  'lato',
  'montserrat',
  'inter',
  'sans-serif',
  'serif',
  'monospace',
  'system-ui',
]);

function toHexColor(color: any): string {
  if (!color) return '#000000';
  if (typeof color === 'string') return color;
  const r = Math.round(color.r ?? 0).toString(16).padStart(2, '0');
  const g = Math.round(color.g ?? 0).toString(16).padStart(2, '0');
  const b = Math.round(color.b ?? 0).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export interface PsdImportResult {
  design: DesignDocument;
  report: ImportReport;
  compositePath?: string;
}

export async function importPsd(
  buffer: Buffer,
  originalFileName: string,
  assetsDir: string
): Promise<PsdImportResult> {
  await fs.mkdir(assetsDir, { recursive: true });
  const fileHash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 8);
  const psd = readPsd(buffer, { skipLayerImageData: false });

  const psdWidth = psd.width || 800;
  const psdHeight = psd.height || 600;

  let compositeUrl: string | undefined;
  let compositePath: string | undefined;

  // Extract composite image if available
  if (psd.canvas) {
    const compositeFileName = `composite_${fileHash}.png`;
    compositePath = path.join(assetsDir, compositeFileName);
    const pngBuffer = (psd.canvas as any).toBuffer('image/png');
    await fs.writeFile(compositePath, pngBuffer);
    compositeUrl = `/assets/${compositeFileName}`;
  }

  const report: ImportReport = {
    totalLayers: 0,
    editableLayers: 0,
    rasterizedLayers: 0,
    unsupportedFeatures: [],
    missingFonts: [],
    warnings: [],
    details: [],
  };

  const unsupportedSet = new Set<string>();
  const missingFontsSet = new Set<string>();

  let layerCounter = 1;

  async function processLayer(
    psdLayer: AgPsdLayer,
    layerIndex: number,
    depth: number = 0
  ): Promise<Layer | null> {
    report.totalLayers++;
    const currentId = `layer-${layerCounter++}`;
    const layerName = psdLayer.name || `Layer ${currentId}`;

    // Calculate layer dimensions and position
    let x = Number.isFinite(psdLayer.left) ? (psdLayer.left as number) : 0;
    let y = Number.isFinite(psdLayer.top) ? (psdLayer.top as number) : 0;
    let width =
      Number.isFinite(psdLayer.right) && Number.isFinite(psdLayer.left)
        ? (psdLayer.right as number) - (psdLayer.left as number)
        : 0;
    let height =
      Number.isFinite(psdLayer.bottom) && Number.isFinite(psdLayer.top)
        ? (psdLayer.bottom as number) - (psdLayer.top as number)
        : 0;

    const opacity = psdLayer.opacity !== undefined ? Math.max(0, Math.min(1, psdLayer.opacity)) : 1;
    const visible = psdLayer.hidden !== true;
    const blendMode = psdLayer.blendMode || 'normal';

    // Check unsupported Photoshop features on this layer
    if (psdLayer.effects) {
      if (psdLayer.effects.gradientOverlay) unsupportedSet.add('Gradient Overlay effect');
      if (psdLayer.effects.patternOverlay) unsupportedSet.add('Pattern Overlay effect');
      if (psdLayer.effects.bevel) unsupportedSet.add('Bevel and Emboss effect');
      if (psdLayer.effects.innerGlow) unsupportedSet.add('Inner Glow effect');
      if (psdLayer.effects.satin) unsupportedSet.add('Satin effect');
    }
    if (psdLayer.adjustments) {
      unsupportedSet.add('Adjustment Layer (Curves/Levels/Color)');
    }
    if (psdLayer.mask) {
      unsupportedSet.add('Layer Mask / Clipping');
    }

    // 1. Group Layer
    if (psdLayer.children && psdLayer.children.length > 0) {
      const childLayers: Layer[] = [];
      for (let i = 0; i < psdLayer.children.length; i++) {
        const child = await processLayer(psdLayer.children[i], i, depth + 1);
        if (child) childLayers.push(child);
      }

      report.editableLayers++;
      report.details.push({
        layerId: currentId,
        name: layerName,
        type: 'group',
        status: 'editable',
        notes: `Folder group with ${childLayers.length} child layers`,
      });

      return {
        id: currentId,
        type: 'group',
        name: layerName,
        x: x || 0,
        y: y || 0,
        width: width || psdWidth,
        height: height || psdHeight,
        opacity,
        visible,
        zIndex: layerIndex + 1,
        blendMode: blendMode !== 'normal' ? blendMode : undefined,
        children: childLayers,
      };
    }

    // 2. Text Layer -> editable HTML text
    if (psdLayer.text) {
      const textData = psdLayer.text;
      const textContent = textData.text || '';
      const textStyle = textData.style || {};

      let fontSize = 16;
      if (textStyle.fontSize) {
        fontSize = Math.round(textStyle.fontSize);
      } else if (textData.transform && textData.transform[0]) {
        // Transform scaling fallback
        fontSize = Math.round(Math.abs(textData.transform[0]) * 16);
      }

      // If coordinates are NaN (common for point text in ag-psd)
      if (!Number.isFinite(psdLayer.left) && textData.transform) {
        x = Math.round(textData.transform[4] || 0);
        y = Math.round(textData.transform[5] || 0) - fontSize; // Baseline correction
      }
      if (width <= 0) {
        width = Math.min(psdWidth - x, Math.max(100, textContent.length * (fontSize * 0.65)));
      }
      if (height <= 0) {
        height = Math.round(fontSize * 1.4);
      }

      const fontName = textStyle.font?.name || 'sans-serif';
      const cleanFontName = fontName.replace(/[-_]/g, ' ').toLowerCase();

      // Check font availability
      let isWebSafe = false;
      for (const wsf of WEB_SAFE_FONTS) {
        if (cleanFontName.includes(wsf)) {
          isWebSafe = true;
          break;
        }
      }
      if (!isWebSafe && fontName !== 'AdobeInvisFont' && fontName !== 'sans-serif') {
        missingFontsSet.add(fontName);
      }

      const color = toHexColor(textStyle.fillColor);
      let textAlign: 'left' | 'center' | 'right' | 'justify' = 'left';
      const justification = textData.paragraphStyle?.justification;
      if (justification === 'center') textAlign = 'center';
      else if (justification === 'right') textAlign = 'right';
      else if (justification === 'justifyAll' || justification === 'justifyLeft') textAlign = 'justify';

      const style: TextStyle = {
        fontSize,
        fontFamily: fontName !== 'AdobeInvisFont' ? fontName : 'sans-serif',
        color,
        textAlign,
        fontWeight: textStyle.bold ? 'bold' : 'normal',
        fontStyle: textStyle.italic ? 'italic' : 'normal',
      };

      report.editableLayers++;
      report.details.push({
        layerId: currentId,
        name: layerName,
        type: 'text',
        status: 'editable',
        notes: `Converted to editable text (Font: ${fontName}, Size: ${fontSize}px, Color: ${color})`,
      });

      return {
        id: currentId,
        type: 'text',
        name: layerName,
        x,
        y,
        width,
        height,
        opacity,
        visible,
        zIndex: layerIndex + 1,
        blendMode: blendMode !== 'normal' ? blendMode : undefined,
        text: textContent,
        style,
      };
    }

    // 3. Basic Shape Layer or Solid Fill Layer
    let detectedSolidColor: string | null = null;
    if (psdLayer.solidColor) {
      detectedSolidColor = toHexColor(psdLayer.solidColor);
    } else if (psdLayer.canvas && psdLayer.canvas.width && psdLayer.canvas.height) {
      // Check if canvas is uniform solid color
      try {
        const ctx = (psdLayer.canvas as any).getContext('2d');
        const imgData = ctx.getImageData(0, 0, psdLayer.canvas.width, psdLayer.canvas.height);
        const data = imgData.data;
        if (data.length >= 4 && data[3] > 0) {
          const r0 = data[0];
          const g0 = data[1];
          const b0 = data[2];
          const a0 = data[3];
          let isSolid = true;
          const step = Math.max(1, Math.floor(data.length / (4 * 60)));
          for (let i = 0; i < data.length; i += step * 4) {
            if (
              Math.abs(data[i] - r0) > 2 ||
              Math.abs(data[i + 1] - g0) > 2 ||
              Math.abs(data[i + 2] - b0) > 2 ||
              Math.abs(data[i + 3] - a0) > 2
            ) {
              isSolid = false;
              break;
            }
          }
          if (isSolid) {
            const rHex = r0.toString(16).padStart(2, '0');
            const gHex = g0.toString(16).padStart(2, '0');
            const bHex = b0.toString(16).padStart(2, '0');
            detectedSolidColor = `#${rHex}${gHex}${bHex}`;
          }
        }
      } catch {}
    }

    const hasVectorMask = (psdLayer as any).vectorMask !== undefined;
    const hasUnsupportedFx =
      psdLayer.effects &&
      (psdLayer.effects.gradientOverlay ||
        psdLayer.effects.patternOverlay ||
        psdLayer.effects.bevel);

    if (detectedSolidColor && !hasUnsupportedFx && !hasVectorMask && (width > 0 || (psdLayer.canvas && psdLayer.canvas.width > 0))) {
      const shapeWidth = width > 0 ? width : (psdLayer.canvas?.width || 100);
      const shapeHeight = height > 0 ? height : (psdLayer.canvas?.height || 100);

      report.editableLayers++;
      report.details.push({
        layerId: currentId,
        name: layerName,
        type: 'shape',
        status: 'editable',
        notes: `Converted to CSS rectangle shape with solid fill: ${detectedSolidColor}`,
      });

      return {
        id: currentId,
        type: 'shape',
        name: layerName,
        x,
        y,
        width: shapeWidth,
        height: shapeHeight,
        opacity,
        visible,
        zIndex: layerIndex + 1,
        shapeType: 'rectangle',
        fill: detectedSolidColor,
        strokeWidth: 0,
      };
    }

    // 4. Raster Fallback (Layer with pixel data/canvas or complex features)
    if (psdLayer.canvas) {
      const assetFileName = `layer_${fileHash}_${currentId}.png`;
      const assetFilePath = path.join(assetsDir, assetFileName);
      const pngBuffer = (psdLayer.canvas as any).toBuffer('image/png');
      await fs.writeFile(assetFilePath, pngBuffer);

      const actualWidth = psdLayer.canvas.width || width || 100;
      const actualHeight = psdLayer.canvas.height || height || 100;

      const isFallback = !!detectedSolidColor || hasVectorMask || !!hasUnsupportedFx || !!psdLayer.adjustments;
      const fallbackReason = isFallback
        ? 'Complex effects/masks required raster fallback to preserve visual appearance'
        : 'Bitmap image/raster layer';

      report.rasterizedLayers++;
      report.details.push({
        layerId: currentId,
        name: layerName,
        type: 'raster',
        status: 'rasterized',
        notes: `${fallbackReason} (${actualWidth}x${actualHeight}px)`,
      });

      return {
        id: currentId,
        type: 'raster',
        name: layerName,
        x,
        y,
        width: actualWidth,
        height: actualHeight,
        opacity,
        visible,
        zIndex: layerIndex + 1,
        blendMode: blendMode !== 'normal' ? blendMode : undefined,
        src: `/assets/${assetFileName}`,
        fit: 'contain',
        originalFileName: layerName,
      };
    }

    // Layer has no canvas and is empty/adjustment without pixels
    report.warnings.push(`Layer "${layerName}" has no renderable pixel or vector content and was skipped.`);
    report.details.push({
      layerId: currentId,
      name: layerName,
      type: 'unknown',
      status: 'skipped',
      notes: 'No pixel canvas or text data found',
    });

    return null;
  }

  const layers: Layer[] = [];
  if (psd.children && psd.children.length > 0) {
    for (let i = 0; i < psd.children.length; i++) {
      const converted = await processLayer(psd.children[i], i);
      if (converted) {
        layers.push(converted);
      }
    }
  }

  report.unsupportedFeatures = Array.from(unsupportedSet);
  report.missingFonts = Array.from(missingFontsSet);

  const design: DesignDocument = {
    id: `psd-${fileHash}`,
    name: path.parse(originalFileName).name || 'Imported PSD',
    width: psdWidth,
    height: psdHeight,
    backgroundColor: '#ffffff',
    layers,
    meta: {
      sourceFormat: 'psd',
      originalFileName,
      importedAt: new Date().toISOString(),
      compositeUrl,
    },
  };

  return {
    design,
    report,
    compositePath,
  };
}
