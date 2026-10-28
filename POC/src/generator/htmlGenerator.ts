import { DesignDocument, Layer } from '../types/design.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeCss(str: string): string {
  return str.replace(/["\\]/g, '\\$&');
}

export function generateLayerCss(layer: Layer, index: number, prefix: string = ''): string {
  const selector = `#layer-${prefix}${layer.id}`;
  const lines: string[] = [];

  lines.push(`${selector} {`);
  lines.push(`  position: absolute;`);
  if (layer.type === 'group') {
    lines.push(`  left: 0;`);
    lines.push(`  top: 0;`);
    lines.push(`  width: 100%;`);
    lines.push(`  height: 100%;`);
    lines.push(`  pointer-events: none;`);
  } else {
    lines.push(`  left: ${layer.x}px;`);
    lines.push(`  top: ${layer.y}px;`);
    lines.push(`  width: ${layer.width}px;`);
    lines.push(`  height: ${layer.height}px;`);
  }

  const zIndex = layer.zIndex !== undefined ? layer.zIndex : index + 1;
  lines.push(`  z-index: ${zIndex};`);

  if (layer.opacity !== undefined && layer.opacity < 1) {
    lines.push(`  opacity: ${layer.opacity};`);
  }

  if (layer.rotation) {
    lines.push(`  transform: rotate(${layer.rotation}deg);`);
    lines.push(`  transform-origin: center center;`);
  }

  if (layer.visible === false) {
    lines.push(`  display: none;`);
  }

  if (layer.blendMode && layer.blendMode !== 'normal') {
    lines.push(`  mix-blend-mode: ${layer.blendMode};`);
  }

  switch (layer.type) {
    case 'text': {
      const style = layer.style || {};
      if (style.fontSize) lines.push(`  font-size: ${style.fontSize}px;`);
      if (style.fontFamily) lines.push(`  font-family: "${escapeCss(style.fontFamily)}", sans-serif;`);
      if (style.fontWeight) lines.push(`  font-weight: ${style.fontWeight};`);
      if (style.fontStyle) lines.push(`  font-style: ${style.fontStyle};`);
      if (style.color) lines.push(`  color: ${style.color};`);
      if (style.textAlign) lines.push(`  text-align: ${style.textAlign};`);
      if (style.lineHeight) {
        const lh = typeof style.lineHeight === 'number' ? `${style.lineHeight}px` : style.lineHeight;
        lines.push(`  line-height: ${lh};`);
      }
      if (style.letterSpacing) lines.push(`  letter-spacing: ${style.letterSpacing}px;`);
      if (style.textDecoration) lines.push(`  text-decoration: ${style.textDecoration};`);
      lines.push(`  word-break: break-word;`);
      lines.push(`  white-space: pre-wrap;`);
      lines.push(`  overflow: visible;`);
      break;
    }
    case 'shape': {
      if (layer.fill) lines.push(`  background-color: ${layer.fill};`);
      if (layer.stroke && (layer.strokeWidth ?? 0) > 0) {
        lines.push(`  border: ${layer.strokeWidth}px solid ${layer.stroke};`);
      }
      if (layer.shapeType === 'ellipse' || layer.shapeType === 'circle') {
        lines.push(`  border-radius: 50%;`);
      } else if (layer.borderRadius) {
        const br = typeof layer.borderRadius === 'number' ? `${layer.borderRadius}px` : layer.borderRadius;
        lines.push(`  border-radius: ${br};`);
      }
      break;
    }
    case 'image':
    case 'raster': {
      lines.push(`  object-fit: ${layer.fit || 'contain'};`);
      lines.push(`  display: block;`);
      break;
    }
    case 'svg': {
      lines.push(`  display: flex;`);
      lines.push(`  align-items: center;`);
      lines.push(`  justify-content: center;`);
      break;
    }
    case 'group': {
      lines.push(`  pointer-events: none;`);
      break;
    }
  }

  lines.push(`}`);

  let subCss = '';
  if (layer.type === 'group' && layer.children) {
    subCss = layer.children
      .map((child, i) => generateLayerCss(child, i, `${layer.id}-`))
      .join('\n');
  }

  return lines.join('\n') + (subCss ? '\n' + subCss : '');
}

export function generateLayerHtml(layer: Layer, prefix: string = '', assetUrlPrefix: string = ''): string {
  const idAttr = `id="layer-${prefix}${layer.id}"`;
  const classAttr = `class="canvas-layer layer-${layer.type}"`;
  const dataNameAttr = `data-name="${escapeHtml(layer.name)}"`;

  const resolveAssetSrc = (src: string) => {
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
      return src;
    }
    // Relative asset path like /assets/... or data/assets/...
    return `${assetUrlPrefix}${src.startsWith('/') ? src : '/' + src}`;
  };

  switch (layer.type) {
    case 'text': {
      return `<div ${idAttr} ${classAttr} ${dataNameAttr}>${escapeHtml(layer.text)}</div>`;
    }
    case 'image':
    case 'raster': {
      const src = resolveAssetSrc(layer.src);
      return `<img ${idAttr} ${classAttr} ${dataNameAttr} src="${src}" alt="${escapeHtml(layer.name)}" />`;
    }
    case 'shape': {
      return `<div ${idAttr} ${classAttr} ${dataNameAttr}></div>`;
    }
    case 'svg': {
      if (layer.svgContent) {
        return `<div ${idAttr} ${classAttr} ${dataNameAttr}>${layer.svgContent}</div>`;
      }
      const src = resolveAssetSrc(layer.src || '');
      return `<img ${idAttr} ${classAttr} ${dataNameAttr} src="${src}" alt="${escapeHtml(layer.name)}" />`;
    }
    case 'group': {
      const childrenHtml = layer.children
        .map((child) => generateLayerHtml(child, `${layer.id}-`, assetUrlPrefix))
        .join('\n    ');
      return `<div ${idAttr} ${classAttr} ${dataNameAttr}>\n    ${childrenHtml}\n  </div>`;
    }
  }
}

export interface GeneratedOutput {
  html: string;
  css: string;
  fullHtml: string;
}

export function generateHtmlCss(doc: DesignDocument, assetUrlPrefix: string = ''): GeneratedOutput {
  const canvasCss = `
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  margin: 0;
  padding: 0;
  background-color: transparent;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

#canvas {
  position: relative;
  width: ${doc.width}px;
  height: ${doc.height}px;
  background-color: ${doc.backgroundColor || '#ffffff'};
  overflow: hidden;
  margin: 0;
  box-sizing: border-box;
}

.canvas-layer {
  box-sizing: border-box;
}
`.trim();

  const layersCss = doc.layers.map((layer, index) => generateLayerCss(layer, index)).join('\n\n');
  const fullCss = `${canvasCss}\n\n/* Layers CSS */\n${layersCss}`;

  const layersHtml = doc.layers
    .map((layer) => generateLayerHtml(layer, '', assetUrlPrefix))
    .join('\n  ');

  const canvasHtml = `<div id="canvas" data-doc-name="${escapeHtml(doc.name || 'Design')}">\n  ${layersHtml}\n</div>`;

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(doc.name || 'Design Preview')}</title>
  <style>
${fullCss}
  </style>
</head>
<body>
  ${canvasHtml}
</body>
</html>`;

  return {
    html: canvasHtml,
    css: fullCss,
    fullHtml,
  };
}
