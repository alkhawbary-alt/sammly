import type { Color as PsdColor } from 'ag-psd';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** ag-psd colors come as RGB(A) 0..255, float RGB 0..1, HSB, grayscale… */
export function toRgb(c: PsdColor | undefined): RGB {
  if (!c) return { r: 0, g: 0, b: 0 };
  const x = c as unknown as Record<string, number>;
  if ('r' in x) return { r: clamp255(x.r!), g: clamp255(x.g!), b: clamp255(x.b!) };
  if ('fr' in x) return { r: clamp255(x.fr! * 255), g: clamp255(x.fg! * 255), b: clamp255(x.fb! * 255) };
  if ('k' in x) {
    const v = clamp255(255 - (x.k! * 255) / 100);
    return { r: v, g: v, b: v };
  }
  if ('h' in x) return hsbToRgb(x.h!, x.s!, x.b!);
  return { r: 0, g: 0, b: 0 };
}

function hsbToRgb(h: number, s: number, v: number): RGB {
  // ag-psd HSB: h 0..360, s/b 0..1
  const c = v * s;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = v - c;
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
}

export function hex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function rgba({ r, g, b }: RGB, a: number): string {
  if (a >= 1) return hex({ r, g, b });
  return `rgba(${r}, ${g}, ${b}, ${Math.round(Math.max(0, a) * 1000) / 1000})`;
}
