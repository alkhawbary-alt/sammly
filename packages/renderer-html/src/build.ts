import {
  ARABIC_RE,
  usedFontIds,
  type FieldValues,
  type ImageSlotLayer,
  type Layer,
  type TemplateDocument,
  type TextLayer,
  type TextRun,
  type TextStyle,
} from '@sammly/template-schema';
import { AUTOFIT_NONCE, autofitScript } from './autofit';
import { cssString, escapeHtml, px, safeUrl } from './escape';
import { applyValues, type AppliedDocument, type BrandValues } from './values';

export interface ResolvedFont {
  family: string;
  url: string;
  weight: number;
  style: 'normal' | 'italic';
}

export interface RenderOptions {
  /** assetId → URL or data URI. Export: `https://assets.local/<id>` (served via page.route); preview: presigned URL. */
  resolveAsset: (assetId: string) => string;
  /** fontId → font file. Return undefined for unknown ids (the fallback family is used). */
  resolveFont: (fontId: string) => ResolvedFont | undefined;
  /**
   * export  → strict CSP: images/fonts only from https://assets.local and data: URIs.
   * preview → images/fonts from any https/data/blob URL (presigned storage URLs).
   */
  mode: 'preview' | 'export';
  /** Brand-kit values for `brand.*` fields. */
  brand?: BrandValues;
}

export interface RenderOutput {
  html: string;
  /** layer id → bound field keys (also emitted as data-fields on text boxes). */
  fieldKeysByLayer: Map<string, string[]>;
}

/** The CSS family name used for a library font, unique so a system font of the same name never wins. */
export const fontFaceFamily = (fontId: string) => `sf-${fontId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

interface Ctx {
  opts: RenderOptions;
  applied: AppliedDocument;
  fonts: Map<string, ResolvedFont>;
}

function baseStyle(l: Layer): string[] {
  const s = [`left:${px(l.x)}`, `top:${px(l.y)}`, `width:${px(l.width)}`, `height:${px(l.height)}`];
  if (l.opacity < 1) s.push(`opacity:${l.opacity}`);
  if (l.rotation) s.push(`transform:rotate(${l.rotation}deg)`);
  if (l.blendMode !== 'normal') s.push(`mix-blend-mode:${l.blendMode}`);
  if (!l.visible) s.push('display:none');
  return s;
}

function attrs(l: Layer, cls: string, style: string[], extra = ''): string {
  return `class="L ${cls}" data-layer-id="${escapeHtml(l.id)}" style="${escapeHtml(style.join(';'))}"${extra}`;
}

function assetUrl(ctx: Ctx, id: string): string {
  return safeUrl(ctx.opts.resolveAsset(id));
}

// ─── Text ──────────────────────────────────────────────────────────────

function fontStack(ctx: Ctx, style: Partial<TextStyle>): { family: string; weight?: number; italic?: boolean } {
  const face = style.fontId ? ctx.fonts.get(style.fontId) : undefined;
  const families = [face ? cssString(fontFaceFamily(style.fontId!)) : null, style.fontFamily ? cssString(style.fontFamily) : null, 'sans-serif'];
  return {
    family: families.filter(Boolean).join(','),
    // A mapped face already encodes its weight/style; drawing it at another weight would synthesize bold.
    weight: face?.weight ?? style.fontWeight,
    italic: face ? face.style === 'italic' : style.fontStyle === 'italic',
  };
}

function physicalAlign(align: TextStyle['align'], dir: TextLayer['direction']): string {
  // Fixed per layer direction so `unicode-bidi: plaintext` (needed for mixed Arabic/Latin/digits)
  // can't flip the alignment of a line that happens to start with a Latin character or digit.
  if (align === 'center' || align === 'justify') return align;
  if (dir === 'auto') return align;
  const startIsRight = dir === 'rtl';
  return (align === 'start') === startIsRight ? 'right' : 'left';
}

function runHtml(ctx: Ctx, run: TextRun, base: TextStyle, rtl: boolean): string {
  const s: string[] = [];
  const st = run.style;
  if (st.fontId || st.fontFamily) {
    const f = fontStack(ctx, st);
    s.push(`font-family:${f.family}`);
    if (f.weight) s.push(`font-weight:${f.weight}`);
    if (f.italic) s.push('font-style:italic');
  } else {
    if (st.fontWeight) s.push(`font-weight:${st.fontWeight}`);
    if (st.fontStyle) s.push(`font-style:${st.fontStyle}`);
  }
  if (st.fontSize) s.push(`font-size:${Math.round((st.fontSize / base.fontSize) * 10000) / 10000}em`);
  if (st.color) s.push(`color:${st.color}`);
  if (st.textDecoration && st.textDecoration !== 'none') s.push(`text-decoration:${st.textDecoration}`);
  if (st.letterSpacing && !rtl && !ARABIC_RE.test(run.text)) s.push(`letter-spacing:${Math.round((st.letterSpacing / base.fontSize) * 10000) / 10000}em`);
  return s.length ? `<span style="${escapeHtml(s.join(';'))}">${escapeHtml(run.text)}</span>` : escapeHtml(run.text);
}

function textHtml(ctx: Ctx, l: TextLayer): string {
  const st = l.style;
  const rtl = l.direction === 'rtl';
  const f = fontStack(ctx, st);
  const wrap = l.textBox === 'box' && l.fit.mode !== 'shrink';
  const outer = [
    ...baseStyle(l),
    'display:flex',
    'flex-direction:column',
    `justify-content:${l.verticalAlign === 'middle' ? 'center' : l.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start'}`,
  ];
  const inner = [
    'width:100%',
    'flex:none',
    `font-family:${f.family}`,
    `font-size:${px(st.fontSize)}`,
    `line-height:${st.lineHeight ? Math.round((st.lineHeight / st.fontSize) * 10000) / 10000 : 1.2}`,
    `color:${st.color}`,
    `text-align:${physicalAlign(st.align, l.direction)}`,
    `white-space:${wrap ? 'pre-wrap' : 'pre'}`,
    'unicode-bidi:plaintext',
  ];
  if (wrap) inner.push('overflow-wrap:anywhere');
  if (f.weight) inner.push(`font-weight:${f.weight}`);
  if (f.italic) inner.push('font-style:italic');
  if (st.textDecoration !== 'none') inner.push(`text-decoration:${st.textDecoration}`);
  if (st.letterSpacing && !rtl && !ARABIC_RE.test(l.text)) {
    inner.push(`letter-spacing:${Math.round((st.letterSpacing / st.fontSize) * 10000) / 10000}em`);
  }
  if (l.shadow) inner.push(`text-shadow:${px(l.shadow.x)} ${px(l.shadow.y)} ${px(l.shadow.blur)} ${l.shadow.color}`);
  if (l.stroke) inner.push(`-webkit-text-stroke:${px(l.stroke.width * 2)} ${l.stroke.color}`, 'paint-order:stroke fill');

  let extra = ` dir="${l.direction}"`;
  if (l.baseline !== undefined && l.verticalAlign === 'top') extra += ` data-baseline="${l.baseline}"`;
  if (l.fit.mode !== 'none') {
    const cfg = { mode: l.fit.mode, size: st.fontSize, min: Math.min(l.fit.minFontSize, st.fontSize), maxLines: l.fit.maxLines };
    extra += ` data-fit="${escapeHtml(JSON.stringify(cfg))}"`;
  }
  const keys = ctx.applied.fieldKeysByLayer.get(l.id);
  if (keys) extra += ` data-fields="${escapeHtml(keys.join(','))}"`;

  let content = l.runs?.length ? l.runs.map((r) => runHtml(ctx, r, st, rtl)).join('') : escapeHtml(l.text);
  // Zero-size marker sitting on the first baseline; the page script measures it to anchor the line.
  if (l.baseline !== undefined && l.verticalAlign === 'top') content = `<span class="bl"></span>${content}`;
  return `<div ${attrs(l, 'T', outer, extra)}><div class="tx" style="${escapeHtml(inner.join(';'))}">${content}</div></div>`;
}

// ─── Image slot ────────────────────────────────────────────────────────

function slotHtml(ctx: Ctx, l: ImageSlotLayer): string {
  const style = [...baseStyle(l), 'overflow:hidden'];
  const m = l.mask;
  if (m?.kind === 'alpha') {
    const url = assetUrl(ctx, m.assetId);
    style.push(`-webkit-mask-image:url("${url}")`, `mask-image:url("${url}")`, 'mask-size:100% 100%', '-webkit-mask-size:100% 100%', 'mask-repeat:no-repeat', '-webkit-mask-repeat:no-repeat');
  } else if (m?.kind === 'path') {
    style.push(`clip-path:path("${m.svgPath}")`);
  } else if (m?.kind === 'shape') {
    style.push(m.shape === 'circle' ? 'border-radius:50%' : `border-radius:${px(m.radius ?? 24)}`);
  }

  const value = ctx.applied.slotImages.get(l.id);
  let img = '';
  if (value) {
    const crop = l.allowUserCrop ? value.crop : undefined;
    const pos = crop ? `${crop.x * 100}% ${crop.y * 100}%` : '50% 50%';
    const s = ['width:100%', 'height:100%', 'display:block', `object-fit:${l.fit}`, `object-position:${pos}`];
    if (crop && crop.scale !== 1) s.push(`transform:scale(${crop.scale})`, `transform-origin:${pos}`);
    img = `<img src="${assetUrl(ctx, value.assetId)}" alt="" style="${s.join(';')}">`;
  } else if (value === undefined && l.placeholderAssetId) {
    img = `<img src="${assetUrl(ctx, l.placeholderAssetId)}" alt="" style="width:100%;height:100%;display:block;object-fit:${l.fit}">`;
  } else if (l.emptyColor) {
    style.push(`background:${l.emptyColor}`);
  }
  return `<div ${attrs(l, 'SL', style)}>${img}</div>`;
}

// ─── Layers ────────────────────────────────────────────────────────────

function layerHtml(ctx: Ctx, l: Layer, below: Layer | undefined): string {
  switch (l.type) {
    case 'text':
      return textHtml(ctx, l);
    case 'imageSlot':
      return slotHtml(ctx, l);
    case 'raster': {
      const style = baseStyle(l);
      // Photoshop clipping mask: clip to the alpha of the bitmap layer directly below.
      if (l.clipping && below && (below.type === 'raster' || below.type === 'image')) {
        const url = assetUrl(ctx, below.assetId);
        const pos = `${px(below.x - l.x)} ${px(below.y - l.y)}`;
        const size = `${px(below.width)} ${px(below.height)}`;
        style.push(`-webkit-mask-image:url("${url}")`, `mask-image:url("${url}")`, `-webkit-mask-position:${pos}`, `mask-position:${pos}`, `-webkit-mask-size:${size}`, `mask-size:${size}`, '-webkit-mask-repeat:no-repeat', 'mask-repeat:no-repeat');
      }
      return `<img ${attrs(l, 'R', [...style, 'object-fit:fill', 'display:block'])} src="${assetUrl(ctx, l.assetId)}" alt="">`;
    }
    case 'image':
      return `<img ${attrs(l, 'I', [...baseStyle(l), `object-fit:${l.fit}`, 'display:block'])} src="${assetUrl(ctx, l.assetId)}" alt="">`;
    case 'shape': {
      const s = baseStyle(l);
      if (l.fill) s.push(`background:${l.fill}`);
      if (l.stroke && l.strokeWidth > 0) s.push(`border:${px(l.strokeWidth)} solid ${l.stroke}`);
      if (l.shape === 'ellipse') s.push('border-radius:50%');
      else if (l.radius) s.push(`border-radius:${px(l.radius)}`);
      return `<div ${attrs(l, 'SH', s)}></div>`;
    }
    case 'svg': {
      const fill = ctx.applied.svgFills.get(l.id);
      const s = baseStyle(l);
      if (fill) s.push(`--sf:${fill}`);
      if (l.svgContent) return `<div ${attrs(l, 'SV', s, fill ? ' data-fill' : '')}>${l.svgContent}</div>`;
      return `<img ${attrs(l, 'SV', s)} src="${assetUrl(ctx, l.assetId!)}" alt="">`;
    }
    case 'group': {
      const s = ['left:0', 'top:0', 'width:100%', 'height:100%'];
      if (l.opacity < 1) s.push(`opacity:${l.opacity}`);
      if (l.blendMode !== 'normal') s.push(`mix-blend-mode:${l.blendMode}`);
      else s.push('isolation:auto');
      if (!l.visible) s.push('display:none');
      return `<div ${attrs(l, 'G', s)}>${layersHtml(ctx, l.children)}</div>`;
    }
  }
}

function layersHtml(ctx: Ctx, layers: Layer[]): string {
  return layers.map((l, i) => layerHtml(ctx, l, layers[i - 1])).join('');
}

const BASE_CSS = `*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent;overflow:hidden}
body{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
#canvas{position:relative;overflow:hidden;isolation:isolate}
.L{position:absolute}
.G{pointer-events:none}
.bl{display:inline-block;width:0;height:0;vertical-align:baseline}
.SV>svg{width:100%;height:100%;display:block}
.SV[data-fill] svg,.SV[data-fill] svg *:not([fill="none"]){fill:var(--sf)!important}`;

/**
 * Template Document + field values → a self-contained HTML page. Pure: no I/O, no DOM.
 * The same output drives the admin preview iframe and the worker's headless export.
 */
export function buildRenderHtml(doc: TemplateDocument, values: FieldValues, opts: RenderOptions): RenderOutput {
  const applied = applyValues(doc, values, opts.brand);

  const fonts = new Map<string, ResolvedFont>();
  for (const id of usedFontIds(applied.layers)) {
    const f = opts.resolveFont(id);
    if (f) fonts.set(id, f);
  }
  const ctx: Ctx = { opts, applied, fonts };

  const faces = [...fonts].map(([id, f]) => ({ family: fontFaceFamily(id), weight: f.weight, style: f.style, url: safeUrl(f.url) }));
  const fontCss = faces
    .map((f) => `@font-face{font-family:${cssString(f.family)};src:url("${f.url}");font-weight:${f.weight};font-style:${f.style};font-display:block}`)
    .join('\n');

  const sources = opts.mode === 'export' ? 'https://assets.local data:' : 'https: http: data: blob:';
  const csp = `default-src 'none'; img-src ${sources}; font-src ${sources}; style-src 'unsafe-inline'; script-src 'nonce-${AUTOFIT_NONCE}'`;

  const { width, height, background } = doc.canvas;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<meta name="viewport" content="width=${width}">
<style>
${fontCss}
${BASE_CSS}
#canvas{width:${px(width)};height:${px(height)};background:${background}}
</style></head>
<body><div id="canvas">${layersHtml(ctx, applied.layers)}</div>
<script nonce="${AUTOFIT_NONCE}">${autofitScript(faces.map(({ family, weight, style }) => ({ family, weight, style })))}</script>
</body></html>`;

  return { html, fieldKeysByLayer: applied.fieldKeysByLayer };
}
