import type { Layer as PsdLayer, TextStyle as PsdTextStyle } from 'ag-psd';
import { detectDirection, type LayerInput } from '@sammly/template-schema';
import { cssBlend } from './blend';
import { rgba, toRgb, type RGB } from './color';

type TextLayerInput = Extract<LayerInput, { type: 'text' }>;
type StyleInput = TextLayerInput['style'];

const WEIGHTS: [RegExp, number][] = [
  [/hairline|thin/i, 100],
  [/extra-?light|ultra-?light/i, 200],
  [/light/i, 300],
  [/semi-?bold|demi-?bold/i, 600],
  [/extra-?bold|ultra-?bold|heavy/i, 800],
  [/black/i, 900],
  [/bold/i, 700],
  [/medium/i, 500],
];

/** Weight implied by a PostScript name such as `IBMPlexSansArabic-SemiBold`. */
export function weightFromFontName(name: string): number {
  const suffix = name.includes('-') ? name.slice(name.lastIndexOf('-') + 1) : name;
  for (const [re, w] of WEIGHTS) if (re.test(suffix)) return w;
  return 400;
}

export interface TextEnv {
  globalAngle: number;
  fontIdFor: (psName: string) => string | undefined;
  warn: (msg: string) => void;
  /** Called with every PostScript font name used, to build the missing-fonts list. */
  noteFont: (psName: string, layerName: string) => void;
}

const lerp = (a: RGB, b: RGB, t: number): RGB => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t),
});

interface ResolvedStyle {
  fontName: string;
  fontSize: number;
  color: RGB;
  weight: number;
  italic: boolean;
  tracking: number;
  leading?: number;
  underline: boolean;
  strike: boolean;
}

function resolve(base: PsdTextStyle | undefined, run: PsdTextStyle | undefined, scale: number): ResolvedStyle {
  const s = { ...base, ...run };
  const fontName = s.font?.name ?? base?.font?.name ?? 'sans-serif';
  return {
    fontName,
    fontSize: (s.fontSize ?? 12) * scale,
    color: toRgb(s.fillColor),
    weight: s.fauxBold ? Math.max(700, weightFromFontName(fontName)) : weightFromFontName(fontName),
    italic: !!s.fauxItalic,
    tracking: s.tracking ?? 0,
    leading: s.autoLeading === false && s.leading ? s.leading * scale : undefined,
    underline: !!s.underline,
    strike: !!s.strikethrough,
  };
}

const sameStyle = (a: ResolvedStyle, b: ResolvedStyle) =>
  a.fontName === b.fontName && Math.abs(a.fontSize - b.fontSize) < 0.01 && a.color.r === b.color.r && a.color.g === b.color.g &&
  a.color.b === b.color.b && a.weight === b.weight && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike;

function styleInput(s: ResolvedStyle, env: TextEnv, layerName: string, colorOverride?: string): StyleInput {
  env.noteFont(s.fontName, layerName);
  return {
    fontId: env.fontIdFor(s.fontName),
    fontFamily: s.fontName,
    fontSize: Math.round(s.fontSize * 100) / 100,
    fontWeight: s.weight,
    fontStyle: s.italic ? 'italic' : 'normal',
    color: colorOverride ?? rgba(s.color, 1),
    lineHeight: s.leading ? Math.round(s.leading * 100) / 100 : undefined,
    letterSpacing: s.tracking ? Math.round((s.tracking / 1000) * s.fontSize * 100) / 100 : undefined,
    textDecoration: s.underline ? 'underline' : s.strike ? 'line-through' : 'none',
  };
}

/**
 * Photoshop text layer → Template text layer.
 *
 * Point text is anchored at `transform` (tx, ty) = the first baseline at the alignment point;
 * we build a generous box around it in text-local coordinates (so slightly wider browser
 * glyphs never clip), rotate it by the transform's angle and set `baseline` so the renderer
 * puts the first line exactly on Photoshop's baseline.
 */
export function convertText(layer: PsdLayer, id: string, env: TextEnv): TextLayerInput {
  const t = layer.text!;
  const [a = 1, b = 0, c = 0, d = 1, tx = layer.left ?? 0, ty = layer.bottom ?? 0] = t.transform ?? [];
  const scale = Math.sqrt(Math.abs(a * d - b * c)) || 1;
  const rotation = (Math.atan2(b, a) * 180) / Math.PI;

  const raw = t.text ?? '';
  const runsRaw = t.styleRuns?.length ? t.styleRuns : [{ length: raw.length, style: {} as PsdTextStyle }];
  const base = resolve(t.style, runsRaw[0]?.style, scale);
  const text = raw.replace(/\r\n?/g, '\n').replace(/\n+$/, '');

  // ─── Effects ───
  const fx = layer.effects && !layer.effects.disabled ? layer.effects : undefined;
  // Colour overlay replaces the fill colour; fill opacity fades the glyphs but not the effects.
  const fill = fx?.solidFill?.find((e) => e.enabled !== false);
  const fillOpacity = layer.fillOpacity ?? 1;
  const overlay = fill ? lerp(base.color, toRgb(fill.color), fill.opacity ?? 1) : undefined;
  const colorOverride = overlay || fillOpacity < 1 ? rgba(overlay ?? base.color, fillOpacity) : undefined;

  let shadow: TextLayerInput['shadow'];
  const ds = fx?.dropShadow?.find((e) => e.enabled !== false);
  const glow = fx?.outerGlow && fx.outerGlow.enabled !== false ? fx.outerGlow : undefined;
  if (ds) {
    const ang = (((ds.useGlobalLight ? env.globalAngle : (ds.angle ?? env.globalAngle)) * Math.PI) / 180);
    const dist = ds.distance?.value ?? 0;
    shadow = {
      color: rgba(toRgb(ds.color), ds.opacity ?? 0.75),
      x: Math.round(-Math.cos(ang) * dist * 100) / 100,
      y: Math.round(Math.sin(ang) * dist * 100) / 100,
      blur: Math.round((((ds.size?.value ?? 0) * 2) / 3) * 100) / 100,
    };
  } else if (glow) {
    shadow = { color: rgba(toRgb(glow.color), glow.opacity ?? 0.75), x: 0, y: 0, blur: Math.round((((glow.size?.value ?? 0) * 2) / 3) * 100) / 100 };
  }
  let stroke: TextLayerInput['stroke'];
  const st = fx?.stroke?.find((e) => e.enabled !== false);
  if (st) stroke = { color: rgba(toRgb(st.color), st.opacity ?? 1), width: st.size?.value ?? 1 };
  for (const k of ['innerShadow', 'innerGlow', 'bevel', 'satin', 'gradientOverlay', 'patternOverlay'] as const) {
    const e = fx?.[k];
    if (e && (Array.isArray(e) ? e.some((x) => x.enabled !== false) : e.enabled !== false)) env.warn(`Text effect "${k}" is not reproduced on live text`);
  }
  if (t.warp && t.warp.style && t.warp.style !== 'none') env.warn('Warped text is drawn without the warp');

  // ─── Runs ───
  const styles: { text: string; s: ResolvedStyle }[] = [];
  let pos = 0;
  for (const r of runsRaw) {
    const piece = raw.slice(pos, pos + r.length).replace(/\r\n?/g, '\n');
    pos += r.length;
    const s = resolve(t.style, r.style, scale);
    const last = styles[styles.length - 1];
    if (last && sameStyle(last.s, s)) last.text += piece;
    else styles.push({ text: piece, s });
  }
  // Drop the trailing paragraph break from the last run, mirroring `text`.
  if (styles.length) styles[styles.length - 1]!.text = styles[styles.length - 1]!.text.replace(/\n+$/, '');
  const visibleStyles = styles.filter((r) => r.text.length > 0);
  const multi = visibleStyles.length > 1;
  const baseStyle = multi ? visibleStyles.reduce((m, r) => (r.text.length > m.text.length ? r : m)).s : base;

  // ─── Geometry ───
  const fs = baseStyle.fontSize;
  const justification = t.paragraphStyle?.justification ?? 'left';
  const align: StyleInput['align'] =
    justification === 'center' ? 'center' : justification === 'right' ? 'end' : justification.startsWith('justify') ? 'justify' : 'start';
  const direction = detectDirection(text);
  const lineHeight = baseStyle.leading ?? fs * 1.2;
  const lines = text.split('\n').length;
  const box = t.shapeType === 'box' && t.boxBounds;

  let x0: number, y0: number, w: number, h: number, baseline: number | undefined;
  if (box) {
    const [bl, bt, br, bb] = t.boxBounds!;
    x0 = bl! * scale;
    y0 = bt! * scale;
    w = (br! - bl!) * scale;
    h = (bb! - bt!) * scale;
  } else {
    const W = (layer.right ?? 0) - (layer.left ?? 0);
    const H = (layer.bottom ?? 0) - (layer.top ?? 0);
    const th = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(th)), sin = Math.abs(Math.sin(th));
    const den = cos * cos - sin * sin;
    const localW = den > 0.3 && W > 0 ? (W * cos - H * sin) / den : W;
    w = Math.max(fs, localW * 1.15 + fs * 0.6);
    const rightAnchored = (align === 'start' && direction === 'rtl') || (align === 'end' && direction === 'ltr');
    x0 = align === 'center' || align === 'justify' ? -w / 2 : rightAnchored ? -w : 0;
    baseline = Math.round(fs * 1.25 * 100) / 100;
    y0 = -baseline;
    h = baseline + (lines - 1) * lineHeight + fs * 0.6;
  }

  // Box centre in text space → document space (the CSS rotation is about the centre).
  const ux = a / scale, uy = b / scale, vx = c / scale, vy = d / scale;
  const lcx = x0 + w / 2, lcy = y0 + h / 2;
  const cx = tx + ux * lcx + vx * lcy;
  const cy = ty + uy * lcx + vy * lcy;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const { blend, exact } = cssBlend(layer.blendMode);
  if (!exact) env.warn(`Blend mode "${layer.blendMode}" approximated as "${blend}" on text`);

  const style = styleInput(baseStyle, env, layer.name ?? '', colorOverride);
  style.align = align;

  return {
    id,
    name: layer.name ?? 'Text',
    type: 'text',
    x: r2(cx - w / 2),
    y: r2(cy - h / 2),
    width: r2(w),
    height: r2(h),
    rotation: Math.abs(rotation) < 0.05 ? 0 : r2(rotation),
    opacity: layer.opacity ?? 1,
    visible: !layer.hidden,
    blendMode: blend,
    text,
    direction,
    textBox: box ? 'box' : 'point',
    verticalAlign: 'top',
    style,
    runs: multi
      ? visibleStyles.map((r) => {
          const si = styleInput(r.s, env, layer.name ?? '', colorOverride);
          return { text: r.text, style: { fontId: si.fontId, fontFamily: si.fontFamily, fontSize: si.fontSize, fontWeight: si.fontWeight, color: si.color, textDecoration: si.textDecoration } };
        })
      : undefined,
    fit: { mode: box ? 'wrap-shrink' : 'shrink', minFontSize: r2(fs * 0.6) },
    baseline,
    shadow,
    stroke,
  };
}
