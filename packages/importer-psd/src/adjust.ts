import type { Layer as PsdLayer } from 'ag-psd';
import { copy, ctx, type Surface } from './canvas';
import { toRgb } from './color';

type Adjustment = NonNullable<PsdLayer['adjustment']>;
type Lut = Uint8Array; // 256 entries

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const identity = (): Lut => Uint8Array.from({ length: 256 }, (_, i) => i);

/** Natural cubic spline through the curve points (how Photoshop draws curves). */
function curveLut(points: { input: number; output: number }[] | undefined): Lut {
  if (!points || points.length < 2) return identity();
  const p = [...points].sort((a, b) => a.input - b.input);
  const n = p.length;
  const xs = p.map((q) => q.input), ys = p.map((q) => q.output);
  const h = xs.slice(1).map((x, i) => x - xs[i]! || 1e-6);
  const alpha = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) alpha[i] = (3 / h[i]!) * (ys[i + 1]! - ys[i]!) - (3 / h[i - 1]!) * (ys[i]! - ys[i - 1]!);
  const l = new Array<number>(n).fill(1), mu = new Array<number>(n).fill(0), z = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1]! - xs[i - 1]!) - h[i - 1]! * mu[i - 1]!;
    mu[i] = h[i]! / l[i]!;
    z[i] = (alpha[i]! - h[i - 1]! * z[i - 1]!) / l[i]!;
  }
  const c = new Array<number>(n).fill(0), b = new Array<number>(n).fill(0), d = new Array<number>(n).fill(0);
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j]! - mu[j]! * c[j + 1]!;
    b[j] = (ys[j + 1]! - ys[j]!) / h[j]! - (h[j]! * (c[j + 1]! + 2 * c[j]!)) / 3;
    d[j] = (c[j + 1]! - c[j]!) / (3 * h[j]!);
  }
  const lut = new Uint8Array(256);
  for (let x = 0; x < 256; x++) {
    if (x <= xs[0]!) lut[x] = clamp(ys[0]!);
    else if (x >= xs[n - 1]!) lut[x] = clamp(ys[n - 1]!);
    else {
      let j = 0;
      while (j < n - 2 && x > xs[j + 1]!) j++;
      const dx = x - xs[j]!;
      lut[x] = clamp(Math.round(ys[j]! + b[j]! * dx + c[j]! * dx * dx + d[j]! * dx * dx * dx));
    }
  }
  return lut;
}

function levelsLut(ch: { shadowInput: number; highlightInput: number; shadowOutput: number; highlightOutput: number; midtoneInput: number } | undefined): Lut {
  if (!ch) return identity();
  const gamma = ch.midtoneInput > 10 ? ch.midtoneInput / 100 : ch.midtoneInput || 1;
  const lut = new Uint8Array(256);
  const span = Math.max(1, ch.highlightInput - ch.shadowInput);
  for (let x = 0; x < 256; x++) {
    const t = Math.min(1, Math.max(0, (x - ch.shadowInput) / span));
    lut[x] = clamp(Math.round(ch.shadowOutput + Math.pow(t, 1 / gamma) * (ch.highlightOutput - ch.shadowOutput)));
  }
  return lut;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hh = h / 360;
  return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)];
}

function parseCube(data: Uint8Array): { size: number; table: Float32Array } | null {
  const text = new TextDecoder().decode(data);
  let size = 0;
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^LUT_3D_SIZE\s+(\d+)/i.exec(line);
    if (m) {
      size = Number(m[1]);
      continue;
    }
    if (/^[A-Z_]/i.test(line)) continue;
    const parts = line.split(/\s+/).map(Number);
    if (parts.length === 3 && parts.every(Number.isFinite)) values.push(...parts);
  }
  if (!size || values.length < size * size * size * 3) return null;
  return { size, table: Float32Array.from(values) };
}

function sampleCube(cube: { size: number; table: Float32Array }, r: number, g: number, b: number): [number, number, number] {
  const n = cube.size - 1;
  const fr = r * n, fg = g * n, fb = b * n;
  const r0 = Math.floor(fr), g0 = Math.floor(fg), b0 = Math.floor(fb);
  const r1 = Math.min(n, r0 + 1), g1 = Math.min(n, g0 + 1), b1 = Math.min(n, b0 + 1);
  const tr = fr - r0, tg = fg - g0, tb = fb - b0;
  const at = (ri: number, gi: number, bi: number, k: number) => cube.table[(ri + gi * cube.size + bi * cube.size * cube.size) * 3 + k]!;
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const c00 = at(r0, g0, b0, k) * (1 - tr) + at(r1, g0, b0, k) * tr;
    const c10 = at(r0, g1, b0, k) * (1 - tr) + at(r1, g1, b0, k) * tr;
    const c01 = at(r0, g0, b1, k) * (1 - tr) + at(r1, g0, b1, k) * tr;
    const c11 = at(r0, g1, b1, k) * (1 - tr) + at(r1, g1, b1, k) * tr;
    out[k] = (c00 * (1 - tg) + c10 * tg) * (1 - tb) + (c01 * (1 - tg) + c11 * tg) * tb;
  }
  return out;
}

type PixelFn = (r: number, g: number, b: number) => [number, number, number];

function pixelFn(adj: Adjustment): PixelFn | string {
  switch (adj.type) {
    case 'curves': {
      const ch = adj.channels ?? [];
      const [m, r, g, b] = [curveLut(ch[0]), curveLut(ch[1]), curveLut(ch[2]), curveLut(ch[3])];
      return (R, G, B) => [r[m[R]!]!, g[m[G]!]!, b[m[B]!]!];
    }
    case 'levels': {
      const ch = adj.channels ?? [];
      const [m, r, g, b] = [levelsLut(ch[0]), levelsLut(ch[1]), levelsLut(ch[2]), levelsLut(ch[3])];
      return (R, G, B) => [r[m[R]!]!, g[m[G]!]!, b[m[B]!]!];
    }
    case 'brightness/contrast': {
      const br = adj.brightness ?? 0, ct = (adj.contrast ?? 0) / 100;
      const k = ct >= 0 ? 1 / Math.max(0.01, 1 - ct * 0.99) : 1 + ct;
      const f = (v: number) => clamp(Math.round((v + br * 0.5 - 127.5) * k + 127.5));
      return (R, G, B) => [f(R), f(G), f(B)];
    }
    case 'hue/saturation': {
      if (adj.colorize && adj.colorization) {
        const { hue, saturation, lightness } = adj.colorization;
        return (R, G, B) => {
          const l = (R * 0.3 + G * 0.59 + B * 0.11) / 255;
          const [r, g, b] = hslToRgb(hue, saturation / 100, Math.min(1, Math.max(0, l + lightness / 200)));
          return [r * 255, g * 255, b * 255];
        };
      }
      const m = adj.master ?? { hue: 0, saturation: 0, lightness: 0 };
      return (R, G, B) => {
        const [h0, s0, l] = rgbToHsl(R / 255, G / 255, B / 255);
        const s = m.saturation >= 0 ? s0 + (1 - s0) * s0 * (m.saturation / 100) : s0 * (1 + m.saturation / 100);
        let [r, g, b] = hslToRgb(h0 + m.hue, Math.min(1, Math.max(0, s)), l);
        if (m.lightness > 0) [r, g, b] = [r, g, b].map((v) => v + (1 - v) * (m.lightness / 100)) as [number, number, number];
        else if (m.lightness < 0) [r, g, b] = [r, g, b].map((v) => v * (1 + m.lightness / 100)) as [number, number, number];
        return [r * 255, g * 255, b * 255];
      };
    }
    case 'color lookup': {
      const cube = adj.lutFormat === 'cube' && adj.lut3DFileData ? parseCube(adj.lut3DFileData) : null;
      if (!cube) return `Color lookup (${adj.lutFormat ?? adj.lookupType ?? 'profile'}) is not reproduced`;
      return (R, G, B) => sampleCube(cube, R / 255, G / 255, B / 255).map((v) => v * 255) as [number, number, number];
    }
    case 'gradient map': {
      const stops = [...(adj.colorStops ?? [])].sort((a, b) => a.location - b.location).map((s) => ({ at: s.location, c: toRgb(s.color) }));
      if (!stops.length) return 'Empty gradient map';
      const lut = Array.from({ length: 256 }, (_, i) => {
        let t = i / 255;
        if (adj.reverse) t = 1 - t;
        if (t <= stops[0]!.at) return stops[0]!.c;
        for (let k = 1; k < stops.length; k++) {
          const a = stops[k - 1]!, b = stops[k]!;
          if (t <= b.at) {
            const u = (t - a.at) / Math.max(1e-6, b.at - a.at);
            return { r: a.c.r + (b.c.r - a.c.r) * u, g: a.c.g + (b.c.g - a.c.g) * u, b: a.c.b + (b.c.b - a.c.b) * u };
          }
        }
        return stops[stops.length - 1]!.c;
      });
      return (R, G, B) => {
        const c = lut[Math.round(R * 0.3 + G * 0.59 + B * 0.11)]!;
        return [c.r, c.g, c.b];
      };
    }
    case 'invert':
      return (R, G, B) => [255 - R, 255 - G, 255 - B];
    case 'posterize': {
      const lv = Math.max(2, adj.levels ?? 4);
      const f = (v: number) => Math.round(Math.round((v / 255) * (lv - 1)) * (255 / (lv - 1)));
      return (R, G, B) => [f(R), f(G), f(B)];
    }
    case 'threshold': {
      const t = adj.level ?? 128;
      return (R, G, B) => {
        const v = R * 0.3 + G * 0.59 + B * 0.11 >= t ? 255 : 0;
        return [v, v, v];
      };
    }
    case 'exposure': {
      const k = Math.pow(2, adj.exposure ?? 0), off = (adj.offset ?? 0) * 255, gm = 1 / (adj.gamma || 1);
      const f = (v: number) => clamp(255 * Math.pow(Math.max(0, (v * k + off) / 255), gm));
      return (R, G, B) => [f(R), f(G), f(B)];
    }
    default:
      return `Adjustment "${adj.type}" is not reproduced`;
  }
}

/** Returns the adjusted copy of `backdrop`, or a warning when the adjustment isn't supported. */
export function applyAdjustment(backdrop: Surface, adj: Adjustment): Surface | string {
  const fn = pixelFn(adj);
  if (typeof fn === 'string') return fn;
  const out = copy(backdrop);
  const c = ctx(out);
  const img = c.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [r, g, b] = fn(d[i]!, d[i + 1]!, d[i + 2]!);
    d[i] = clamp(Math.round(r));
    d[i + 1] = clamp(Math.round(g));
    d[i + 2] = clamp(Math.round(b));
  }
  c.putImageData(img, 0, 0);
  return out;
}
