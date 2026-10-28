export interface TextStyle {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: number | string;
  letterSpacing?: number;
  textDecoration?: string;
}

export interface Layer {
  id: string;
  name: string;
  type: 'text' | 'image' | 'shape' | 'group' | 'raster' | 'svg';
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  rotation?: number;
  visible?: boolean;
  zIndex?: number;
  blendMode?: string;
  text?: string;
  style?: TextStyle;
  src?: string;
  fit?: 'contain' | 'cover' | 'fill' | 'none';
  shapeType?: 'rectangle' | 'ellipse' | 'circle' | 'line';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number | string;
  svgContent?: string;
  children?: Layer[];
}

export interface DesignDocument {
  id?: string;
  name?: string;
  width: number;
  height: number;
  backgroundColor?: string;
  layers: Layer[];
  meta?: {
    sourceFormat?: string;
    originalFileName?: string;
    importedAt?: string;
    compositeUrl?: string;
  };
}

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

export function generateLayerCss(
  layer: Layer,
  index: number,
  prefix: string = '',
  selectedId: string | null = null,
  showOutlines: boolean = false
): string {
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

  // Text layer specific styling
  switch (layer.type) {
    case 'text': {
      const style = layer.style || {};
      if (style.fontSize) lines.push(`  font-size: ${style.fontSize}px;`);
      if (style.fontFamily) lines.push(`  font-family: "${escapeCss(style.fontFamily)}", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;`);
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
      lines.push(`  cursor: pointer;`);
      lines.push(`  user-select: none;`);
      lines.push(`  -webkit-font-smoothing: antialiased;`);
      lines.push(`  -moz-osx-font-smoothing: grayscale;`);
      lines.push(`  text-rendering: optimizeLegibility;`);
      lines.push(`  transition: outline 0.12s ease, box-shadow 0.12s ease;`);

      if (layer.id === selectedId) {
        lines.push(`  outline: 2px solid #6366f1 !important;`);
        lines.push(`  outline-offset: 3px !important;`);
        lines.push(`  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.4), 0 4px 16px rgba(99, 102, 241, 0.35) !important;`);
      } else if (showOutlines) {
        lines.push(`  outline: 1px dashed rgba(99, 102, 241, 0.45);`);
        lines.push(`  outline-offset: 2px;`);
      }
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
      .map((child, i) => generateLayerCss(child, i, `${layer.id}-`, selectedId, showOutlines))
      .join('\n');
  }

  return lines.join('\n') + (subCss ? '\n' + subCss : '');
}

export function generateLayerHtml(
  layer: Layer,
  prefix: string = '',
  assetUrlPrefix: string = '',
  selectedId: string | null = null
): string {
  const idAttr = `id="layer-${prefix}${layer.id}"`;
  const isSelected = layer.id === selectedId;
  const classAttr = `class="canvas-layer layer-${layer.type} ${isSelected ? 'layer-selected' : ''}"`;
  const dataNameAttr = `data-name="${escapeHtml(layer.name)}"`;
  const dataIdAttr = `data-id="${escapeHtml(layer.id)}"`;
  const badgeText = `${escapeHtml(layer.name)} • ${Math.round(layer.width)}×${Math.round(layer.height)}px`;
  const dataBadgeAttr = `data-badge="${badgeText}"`;

  const resolveAssetSrc = (src: string) => {
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
      return src;
    }
    return `${assetUrlPrefix}${src.startsWith('/') ? src : '/' + src}`;
  };

  switch (layer.type) {
    case 'text': {
      return `<div ${idAttr} ${classAttr} ${dataNameAttr} ${dataIdAttr} ${dataBadgeAttr} onclick="window.parent.postMessage({type: 'SELECT_TEXT_LAYER', id: '${escapeHtml(layer.id)}'}, '*')" ondblclick="window.parent.postMessage({type: 'EDIT_TEXT_LAYER', id: '${escapeHtml(layer.id)}'}, '*')">${escapeHtml(layer.text || '')}</div>`;
    }
    case 'image':
    case 'raster': {
      const src = resolveAssetSrc(layer.src || '');
      return `<img ${idAttr} ${classAttr} ${dataNameAttr} ${dataIdAttr} src="${src}" alt="${escapeHtml(layer.name)}" />`;
    }
    case 'shape': {
      return `<div ${idAttr} ${classAttr} ${dataNameAttr} ${dataIdAttr}></div>`;
    }
    case 'svg': {
      if (layer.svgContent) {
        return `<div ${idAttr} ${classAttr} ${dataNameAttr} ${dataIdAttr}>${layer.svgContent}</div>`;
      }
      const src = resolveAssetSrc(layer.src || '');
      return `<img ${idAttr} ${classAttr} ${dataNameAttr} ${dataIdAttr} src="${src}" alt="${escapeHtml(layer.name)}" />`;
    }
    case 'group': {
      const childrenHtml = layer.children
        ? layer.children.map((child) => generateLayerHtml(child, `${layer.id}-`, assetUrlPrefix, selectedId)).join('\n    ')
        : '';
      return `<div ${idAttr} ${classAttr} ${dataNameAttr} ${dataIdAttr}>\n    ${childrenHtml}\n  </div>`;
    }
  }
}

export interface GeneratedOutput {
  html: string;
  css: string;
  fullHtml: string;
}

export function generateHtmlCssClient(
  doc: DesignDocument,
  assetUrlPrefix: string = '',
  selectedId: string | null = null,
  showOutlines: boolean = false
): GeneratedOutput {
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
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
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

/* Pro Figma-like Hover & Selection Styling */
.layer-text {
  position: absolute;
  cursor: pointer;
  transition: outline 0.1s ease, box-shadow 0.1s ease;
}

.layer-text:hover:not(.layer-selected) {
  outline: 1.5px dashed #818cf8 !important;
  outline-offset: 3px !important;
}

.layer-selected {
  outline: 2px solid #6366f1 !important;
  outline-offset: 3px !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5), 0 4px 14px rgba(99, 102, 241, 0.35) !important;
  position: absolute;
  z-index: 99999 !important;
}

.layer-selected::after {
  content: attr(data-badge);
  position: absolute;
  top: -24px;
  left: -2px;
  background: #6366f1;
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1000000;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.layer-selected::before {
  content: '';
  position: absolute;
  top: -6px;
  left: -6px;
  width: 7px;
  height: 7px;
  background: #ffffff;
  border: 1.5px solid #6366f1;
  border-radius: 1px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  z-index: 1000000;
}
`.trim();

  const layersCss = doc.layers
    .map((layer, index) => generateLayerCss(layer, index, '', selectedId, showOutlines))
    .join('\n\n');
  const fullCss = `${canvasCss}\n\n/* Layers CSS */\n${layersCss}`;

  const layersHtml = doc.layers
    .map((layer) => generateLayerHtml(layer, '', assetUrlPrefix, selectedId))
    .join('\n  ');

  const canvasHtml = `<div id="canvas" data-doc-name="${escapeHtml(doc.name || 'Design')}" onclick="if (event.target === this) window.parent.postMessage({type: 'DESELECT_LAYER'}, '*')">\n  ${layersHtml}\n</div>`;

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(doc.name || 'Design Preview')}</title>
  <style>
${fullCss}
  </style>
  <script>
    window.addEventListener('message', function(event) {
      if (!event.data) return;
      var d = event.data;
      if (d.type === 'SYNC_LAYER_TEXT') {
        var el = document.getElementById('layer-' + d.id);
        if (el) el.innerText = d.text;
      } else if (d.type === 'SYNC_LAYER_STYLE') {
        var el = document.getElementById('layer-' + d.id);
        if (el && d.style) {
          if (d.style.fontSize) el.style.fontSize = d.style.fontSize + 'px';
          if (d.style.fontFamily) el.style.fontFamily = d.style.fontFamily;
          if (d.style.color) el.style.color = d.style.color;
          if (d.style.fontWeight) el.style.fontWeight = d.style.fontWeight;
          if (d.style.fontStyle) el.style.fontStyle = d.style.fontStyle;
          if (d.style.textAlign) el.style.textAlign = d.style.textAlign;
        }
      } else if (d.type === 'SYNC_SELECTION') {
        document.querySelectorAll('.layer-selected').forEach(function(el) {
          el.classList.remove('layer-selected');
        });
        if (d.selectedId) {
          var el = document.getElementById('layer-' + d.selectedId);
          if (el) el.classList.add('layer-selected');
        }
      } else if (d.type === 'SYNC_BOUNDS') {
        var el = document.getElementById('layer-' + d.id);
        if (el && d.bounds) {
          if (d.bounds.x !== undefined) el.style.left = d.bounds.x + 'px';
          if (d.bounds.y !== undefined) el.style.top = d.bounds.y + 'px';
          if (d.bounds.width !== undefined) el.style.width = d.bounds.width + 'px';
          if (d.bounds.height !== undefined) el.style.height = d.bounds.height + 'px';
        }
      }
    });
  </script>
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

