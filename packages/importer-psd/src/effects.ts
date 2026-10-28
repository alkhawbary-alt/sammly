import type { BlendMode as PsdBlend, Layer as PsdLayer, LayerEffectGradientOverlay, LayerEffectShadow, LayerMaskData, UnitsValue } from 'ag-psd';
import { blendOnto } from './blend';
import { copy, ctx, placed, scaleAlpha, silhouette, surface, type Surface } from './canvas';
import { rgba, toRgb } from './color';

export interface EffectEnv {
  W: number;
  H: number;
  globalAngle: number;
  warn: (msg: string) => void;
}

/** A pre-composited piece of a layer, composited onto the backdrop with its own blend. */
export interface Piece {
  surface: Surface;
  blend: PsdBlend;
  opacity: number;
  role: 'shadow' | 'body';
}

const units = (v: UnitsValue | undefined, fallback = 0) => (v ? v.value : fallback);

function shadowed(src: Surface, color: string, blur: number, dx: number, dy: number, env: EffectEnv): Surface {
  // Draw with a shadow, then knock the source out so only the shadow remains (Photoshop's default knockout).
  const out = surface(env.W, env.H);
  const c = ctx(out);
  c.shadowColor = color;
  c.shadowBlur = blur;
  c.shadowOffsetX = dx;
  c.shadowOffsetY = dy;
  c.drawImage(src, 0, 0);
  c.shadowColor = 'transparent';
  c.globalCompositeOperation = 'destination-out';
  c.drawImage(src, 0, 0);
  return out;
}

function enabled<T extends { enabled?: boolean }>(list: T[] | T | undefined): T[] {
  if (!list) return [];
  return (Array.isArray(list) ? list : [list]).filter((e) => e.enabled !== false);
}

/** Photoshop's "size" is roughly 3σ; Skia's shadowBlur is 2σ. */
const blurFor = (size: number) => (size * 2) / 3;

function dropShadow(content: Surface, e: LayerEffectShadow, env: EffectEnv): Piece {
  const angle = ((e.useGlobalLight ? env.globalAngle : (e.angle ?? env.globalAngle)) * Math.PI) / 180;
  const d = units(e.distance);
  const color = rgba(toRgb(e.color), 1);
  return {
    surface: shadowed(content, color, blurFor(units(e.size)), -Math.cos(angle) * d, Math.sin(angle) * d, env),
    blend: e.blendMode ?? 'multiply',
    opacity: e.opacity ?? 0.75,
    role: 'shadow',
  };
}

function dilate(alpha: Surface, r: number, env: EffectEnv): Surface {
  const out = surface(env.W, env.H);
  const c = ctx(out);
  c.drawImage(alpha, 0, 0);
  if (r <= 0) return out;
  const rings = Math.max(1, Math.ceil(r / 2));
  for (let k = 1; k <= rings; k++) {
    const rr = (r * k) / rings;
    const steps = Math.max(12, Math.ceil(rr * 4));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      c.drawImage(alpha, Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }
  return out;
}

function inverse(s: Surface, env: EffectEnv): Surface {
  const out = surface(env.W, env.H);
  const c = ctx(out);
  c.fillStyle = '#000';
  c.fillRect(0, 0, env.W, env.H);
  c.globalCompositeOperation = 'destination-out';
  c.drawImage(s, 0, 0);
  return out;
}

function gradientOverlay(content: Surface, e: LayerEffectGradientOverlay, bounds: { left: number; top: number; right: number; bottom: number }, env: EffectEnv): Surface | null {
  const g = e.gradient;
  if (!g || g.type !== 'solid' || !g.colorStops?.length) return null;
  const angle = ((e.angle ?? 90) * Math.PI) / 180;
  const cx = (bounds.left + bounds.right) / 2 + (e.offset?.x ?? 0);
  const cy = (bounds.top + bounds.bottom) / 2 + (e.offset?.y ?? 0);
  const w = bounds.right - bounds.left, h = bounds.bottom - bounds.top;
  const half = ((Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h) / 2) * ((e.scale ?? 100) / 100);
  const dx = Math.cos(angle) * half, dy = -Math.sin(angle) * half;
  const out = surface(env.W, env.H);
  const c = ctx(out);
  const grad =
    e.type === 'radial'
      ? c.createRadialGradient(cx, cy, 0, cx, cy, half)
      : c.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  const stops = [...g.colorStops].sort((a, b) => a.location - b.location);
  const opac = (loc: number) => {
    const os = [...(g.opacityStops ?? [])].sort((a, b) => a.location - b.location);
    if (!os.length) return 1;
    if (loc <= os[0]!.location) return os[0]!.opacity;
    for (let i = 1; i < os.length; i++) {
      const a = os[i - 1]!, b = os[i]!;
      if (loc <= b.location) return a.opacity + ((b.opacity - a.opacity) * (loc - a.location)) / Math.max(1e-6, b.location - a.location);
    }
    return os[os.length - 1]!.opacity;
  };
  for (const s of stops) {
    const loc = e.reverse ? 1 - s.location : s.location;
    grad.addColorStop(Math.max(0, Math.min(1, loc)), rgba(toRgb(s.color), opac(s.location)));
  }
  c.fillStyle = grad;
  c.fillRect(0, 0, env.W, env.H);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(content, 0, 0);
  return out;
}

/** Full-document alpha surface for a raster layer mask, or undefined when it reveals everything. */
export function maskSurface(m: LayerMaskData | undefined, env: EffectEnv): Surface | undefined {
  if (!m || m.disabled) return undefined;
  const def = m.defaultColor ?? 255;
  if (!m.canvas && def >= 255) return undefined;
  const out = surface(env.W, env.H);
  const c = ctx(out);
  const density = m.userMaskDensity ?? 1;
  c.fillStyle = `rgba(0,0,0,${(def / 255) * density})`;
  c.fillRect(0, 0, env.W, env.H);
  if (m.canvas) {
    const mc = m.canvas as unknown as Surface;
    const src = ctx(mc).getImageData(0, 0, mc.width, mc.height);
    const d = src.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i + 3] = Math.round(d[i]! * density);
      d[i] = d[i + 1] = d[i + 2] = 0;
    }
    const left = Math.round(m.left ?? 0), top = Math.round(m.top ?? 0);
    c.clearRect(left, top, mc.width, mc.height);
    c.putImageData(src, left, top);
  }
  if (m.userMaskFeather) {
    const blurred = surface(env.W, env.H);
    const bc = ctx(blurred);
    bc.filter = `blur(${m.userMaskFeather / 2}px)`;
    bc.drawImage(out, 0, 0);
    return blurred;
  }
  return out;
}

/**
 * Render one layer's pixels + effects. `content` is the layer's own pixels on a full-document surface.
 * Returns pieces bottom→top: shadows/glows (blended with the backdrop individually) and the body
 * (content × fill opacity, with overlays and stroke applied inside).
 */
export function renderWithEffects(layer: PsdLayer, content: Surface, env: EffectEnv): Piece[] {
  const fx = layer.effects && !layer.effects.disabled ? layer.effects : undefined;
  const pieces: Piece[] = [];
  const bounds = { left: layer.left ?? 0, top: layer.top ?? 0, right: layer.right ?? env.W, bottom: layer.bottom ?? env.H };

  if (fx) {
    for (const e of enabled(fx.dropShadow)) pieces.push(dropShadow(content, e, env));
    for (const e of enabled(fx.outerGlow)) {
      pieces.push({
        surface: shadowed(content, rgba(toRgb(e.color), 1), blurFor(units(e.size)), 0, 0, env),
        blend: e.blendMode ?? 'screen',
        opacity: e.opacity ?? 0.75,
        role: 'shadow',
      });
    }
  }

  const fill = layer.fillOpacity ?? 1;
  const body = fill >= 1 ? copy(content) : applyFillOpacity(content, fill, layer.blendMode);

  if (fx) {
    for (const e of enabled(fx.innerShadow)) {
      const angle = ((e.useGlobalLight ? env.globalAngle : (e.angle ?? env.globalAngle)) * Math.PI) / 180;
      const d = units(e.distance);
      const inner = shadowed(inverse(content, env), rgba(toRgb(e.color), 1), blurFor(units(e.size)), -Math.cos(angle) * d, Math.sin(angle) * d, env);
      const c = ctx(inner);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(content, 0, 0);
      blendOnto(body, inner, e.blendMode ?? 'multiply', e.opacity ?? 0.75);
    }
    if (fx.innerGlow?.enabled) env.warn('Inner glow effect is not reproduced');
    if (fx.satin?.enabled) env.warn('Satin effect is not reproduced');
    if (fx.bevel?.enabled) env.warn('Bevel & emboss effect is not reproduced');
    for (const e of enabled(fx.solidFill)) blendOnto(body, silhouette(content, rgba(toRgb(e.color), 1)), e.blendMode ?? 'normal', e.opacity ?? 1);
    for (const e of enabled(fx.gradientOverlay)) {
      const g = gradientOverlay(content, e, bounds, env);
      if (g) blendOnto(body, g, (e.blendMode as PsdBlend) ?? 'normal', e.opacity ?? 1);
      else env.warn('Noise gradient overlay is not reproduced');
    }
    if (fx.patternOverlay?.enabled) env.warn('Pattern overlay effect is not reproduced');
    for (const e of enabled(fx.stroke)) {
      if (e.fillType && e.fillType !== 'color') {
        env.warn(`Stroke with ${e.fillType} fill is drawn as a solid colour`);
      }
      const size = units(e.size, 3);
      const pos = e.position ?? 'outside';
      const color = rgba(toRgb(e.color), 1);
      let ring: Surface;
      if (pos === 'outside') {
        ring = silhouette(dilate(content, size, env), color);
        const c = ctx(ring);
        c.globalCompositeOperation = 'destination-out';
        c.drawImage(content, 0, 0);
      } else {
        const r = pos === 'inside' ? size : size / 2;
        ring = silhouette(dilate(inverse(content, env), r, env), color);
        const c = ctx(ring);
        c.globalCompositeOperation = 'destination-in';
        c.drawImage(content, 0, 0);
        if (pos === 'center') {
          const outer = silhouette(dilate(content, size / 2, env), color);
          const oc = ctx(outer);
          oc.globalCompositeOperation = 'destination-out';
          oc.drawImage(content, 0, 0);
          ctx(ring).globalCompositeOperation = 'source-over';
          ctx(ring).drawImage(outer, 0, 0);
        }
      }
      blendOnto(body, ring, e.blendMode ?? 'normal', e.opacity ?? 1);
    }
  }
  pieces.push({ surface: body, blend: layer.blendMode ?? 'normal', opacity: layer.opacity ?? 1, role: 'body' });
  return pieces;
}

/**
 * Photoshop's "special eight" blend modes apply fill opacity by fading the colour towards the
 * mode's neutral colour (full coverage), not by fading alpha — which is why e.g. Color Dodge at
 * 25% fill is much stronger than at 25% opacity. Other modes fade alpha.
 */
const NEUTRAL: Partial<Record<PsdBlend, number>> = {
  'color dodge': 0,
  'linear dodge': 0,
  difference: 0,
  'color burn': 1,
  'linear burn': 1,
  'linear light': 0.5,
  'vivid light': 0.5,
  'hard mix': 0.5,
};

export function applyFillOpacity(content: Surface, fill: number, mode: PsdBlend | undefined): Surface {
  const neutral = mode ? NEUTRAL[mode] : undefined;
  if (neutral === undefined) return scaleAlpha(content, fill);
  const out = copy(content);
  const c = ctx(out);
  const img = c.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const n = neutral * 255;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] = n + (d[i]! - n) * fill;
    d[i + 1] = n + (d[i + 1]! - n) * fill;
    d[i + 2] = n + (d[i + 2]! - n) * fill;
  }
  c.putImageData(img, 0, 0);
  return out;
}

/** The layer's own pixels on a full-document surface (null when it has none). */
export function layerContent(layer: PsdLayer, env: EffectEnv): Surface | null {
  const cv = layer.canvas as unknown as Surface | undefined;
  if (!cv || !cv.width || !cv.height) return null;
  return placed(cv, layer.left ?? 0, layer.top ?? 0, env.W, env.H);
}
