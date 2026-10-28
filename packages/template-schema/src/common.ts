import { z } from 'zod';

export const LocalizedText = z.object({
  ar: z.string().min(1),
  en: z.string().optional(),
});
export type LocalizedText = z.infer<typeof LocalizedText>;

/** Opaque storage id of an Asset row. Never a URL — the renderer resolves ids. */
export const AssetId = z.string().min(1);

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()` or `transparent`. Kept strict so values can be emitted into CSS safely. */
export const Color = z
  .string()
  .regex(
    /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|transparent)$/,
    'Invalid color',
  );
export type Color = z.infer<typeof Color>;

/** Arabic script ranges (Arabic, Supplement, Extended-A, Presentation Forms A/B). */
export const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function detectDirection(text: string): 'rtl' | 'ltr' {
  return ARABIC_RE.test(text) ? 'rtl' : 'ltr';
}
