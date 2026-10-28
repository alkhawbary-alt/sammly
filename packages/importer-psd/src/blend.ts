import type { BlendMode as PsdBlend } from 'ag-psd';
import type { BlendMode as CssBlend } from '@sammly/template-schema';
import { copy, ctx, maskedBy, type Ctx2D, type Surface } from './canvas';

/** Photoshop modes Skia draws natively (canvas globalCompositeOperation). */
type CompositeOp = Ctx2D['globalCompositeOperation'];
const NATIVE: Partial<Record<PsdBlend, CompositeOp>> = {
  normal: 'source-over',
  'pass through': 'source-over',
  dissolve: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  'linear dodge': 'lighter',
};

type Separable = (b: number, s: number) => number;
const burn: Separable = (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s));
const dodge: Separable = (b, s) => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)));

/** Per-channel formulas (0..1) for modes the canvas can't draw. */
const CUSTOM: Partial<Record<PsdBlend, Separable>> = {
  'linear burn': (b, s) => Math.max(0, b + s - 1),
  'linear light': (b, s) => Math.min(1, Math.max(0, b + 2 * s - 1)),
  'vivid light': (b, s) => (s <= 0.5 ? burn(b, 2 * s) : dodge(b, 2 * s - 1)),
  'pin light': (b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1)),
  'hard mix': (b, s) => (b + s >= 1 ? 1 : 0),
  subtract: (b, s) => Math.max(0, b - s),
  subtraction: (b, s) => Math.max(0, b - s),
  divide: (b, s) => (s <= 0 ? 1 : Math.min(1, b / s)),
};

/** Non-separable "whole pixel" modes. */
const PIXEL: Partial<Record<PsdBlend, 'darker' | 'lighter'>> = { 'darker color': 'darker', 'lighter color': 'lighter' };

/**
 * Composite `src` (full-document surface) onto `dst` with a Photoshop blend mode.
 * `mask` (alpha channel) and `opacity` scale the source. Mutates `dst`.
 */
export function blendOnto(dst: Surface, src: Surface, mode: PsdBlend | undefined, opacity = 1, mask?: Surface): void {
  if (opacity <= 0) return;
  const source = mask ? maskedBy(src, mask) : src;
  const m = mode ?? 'normal';
  const native = NATIVE[m];
  if (native) {
    const c = ctx(dst);
    c.save();
    c.globalAlpha = opacity;
    c.globalCompositeOperation = native;
    c.drawImage(source, 0, 0);
    c.restore();
    return;
  }
  const f = CUSTOM[m];
  const px = PIXEL[m];
  if (!f && !px) {
    blendOnto(dst, source, 'normal', opacity);
    return;
  }

  const W = dst.width, H = dst.height;
  const dctx = ctx(dst);
  const D = dctx.getImageData(0, 0, W, H);
  const S = ctx(source).getImageData(0, 0, W, H).data;
  const d = D.data;
  for (let i = 0; i < d.length; i += 4) {
    const as = (S[i + 3]! / 255) * opacity;
    if (as <= 0) continue;
    const ab = d[i + 3]! / 255;
    const ao = as + ab * (1 - as);
    let br: number, bg: number, bb: number;
    const cbR = d[i]! / 255, cbG = d[i + 1]! / 255, cbB = d[i + 2]! / 255;
    const csR = S[i]! / 255, csG = S[i + 1]! / 255, csB = S[i + 2]! / 255;
    if (f) {
      br = f(cbR, csR);
      bg = f(cbG, csG);
      bb = f(cbB, csB);
    } else {
      const ls = csR * 0.3 + csG * 0.59 + csB * 0.11;
      const lb = cbR * 0.3 + cbG * 0.59 + cbB * 0.11;
      const takeSrc = px === 'darker' ? ls < lb : ls > lb;
      [br, bg, bb] = takeSrc ? [csR, csG, csB] : [cbR, cbG, cbB];
    }
    const mix = (cb: number, cs: number, bl: number) => (as * (1 - ab) * cs + as * ab * bl + (1 - as) * ab * cb) / ao;
    d[i] = Math.round(mix(cbR, csR, br) * 255);
    d[i + 1] = Math.round(mix(cbG, csG, bg) * 255);
    d[i + 2] = Math.round(mix(cbB, csB, bb) * 255);
    d[i + 3] = Math.round(ao * 255);
  }
  dctx.putImageData(D, 0, 0);
}

/** Mix `after` over `before` by opacity/mask: used for pass-through groups and adjustments. */
export function lerpOnto(before: Surface, after: Surface, opacity: number, mask?: Surface): Surface {
  const out = copy(before);
  blendOnto(out, after, 'normal', opacity, mask);
  return out;
}

const CSS: Partial<Record<PsdBlend, CssBlend>> = {
  normal: 'normal',
  'pass through': 'normal',
  dissolve: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  'linear dodge': 'plus-lighter',
};

/** Closest CSS blend for modes the browser can't draw (reported as approximated). */
const CSS_APPROX: Partial<Record<PsdBlend, CssBlend>> = {
  'linear burn': 'multiply',
  'linear light': 'overlay',
  'vivid light': 'overlay',
  'pin light': 'overlay',
  'hard mix': 'hard-light',
  'darker color': 'darken',
  'lighter color': 'lighten',
  subtract: 'difference',
  subtraction: 'difference',
  divide: 'color-dodge',
};

export function cssBlend(mode: PsdBlend | undefined): { blend: CssBlend; exact: boolean } {
  const m = mode ?? 'normal';
  const exact = CSS[m];
  if (exact) return { blend: exact, exact: true };
  return { blend: CSS_APPROX[m] ?? 'normal', exact: false };
}
