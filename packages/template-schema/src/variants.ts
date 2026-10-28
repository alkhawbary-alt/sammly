import { z } from 'zod';
import { STANDARD_SIZES, TemplateDocument, TemplateVariant } from './document';
import type { Layer } from './layers';

/** What the editor saves: every size variant with its own document. Variant 0 is the primary. */
export const TemplateDraft = z
  .object({ variants: z.array(TemplateVariant).min(1) })
  .refine((d) => d.variants.every((v) => v.width === v.document.canvas.width && v.height === v.document.canvas.height), {
    message: 'variant size must match its canvas',
  })
  .refine((d) => new Set(d.variants.map((v) => v.id)).size === d.variants.length, { message: 'duplicate variant id' });
export type TemplateDraft = z.infer<typeof TemplateDraft>;

/** `square`, `story`… for standard sizes, else `custom-<w>x<h>`. */
export function variantIdFor(width: number, height: number, taken: string[] = []): string {
  const std = STANDARD_SIZES.find((s) => s.width === width && s.height === height);
  let id: string = std?.id ?? `custom-${width}x${height}`;
  for (let i = 2; taken.includes(id); i++) id = `${std?.id ?? `custom-${width}x${height}`}-${i}`;
  return id;
}

export function variantNameFor(width: number, height: number): string {
  return STANDARD_SIZES.find((s) => s.width === width && s.height === height)?.name ?? `${width}×${height}`;
}

function transformLayer(l: Layer, k: number, dx: number, dy: number): Layer {
  const base = { ...l, x: Math.round((l.x * k + dx) * 100) / 100, y: Math.round((l.y * k + dy) * 100) / 100, width: Math.round(l.width * k * 100) / 100, height: Math.round(l.height * k * 100) / 100 };
  switch (l.type) {
    case 'text':
      return {
        ...(base as typeof l),
        style: { ...l.style, fontSize: l.style.fontSize * k, lineHeight: l.style.lineHeight && l.style.lineHeight * k, letterSpacing: l.style.letterSpacing && l.style.letterSpacing * k },
        runs: l.runs?.map((r) => ({ ...r, style: { ...r.style, fontSize: r.style.fontSize && r.style.fontSize * k } })),
        fit: { ...l.fit, minFontSize: l.fit.minFontSize * k },
        baseline: l.baseline && l.baseline * k,
        shadow: l.shadow && { ...l.shadow, x: l.shadow.x * k, y: l.shadow.y * k, blur: l.shadow.blur * k },
        stroke: l.stroke && { ...l.stroke, width: l.stroke.width * k },
      };
    case 'shape':
      return { ...(base as typeof l), radius: l.radius * k, strokeWidth: l.strokeWidth * k };
    case 'imageSlot':
      return l.mask?.kind === 'shape' && l.mask.radius ? { ...(base as typeof l), mask: { ...l.mask, radius: l.mask.radius * k } } : (base as typeof l);
    case 'group':
      return { ...(base as typeof l), children: l.children.map((c) => transformLayer(c, k, dx, dy)) };
    default:
      return base as Layer;
  }
}

/**
 * "Duplicate as new size": scale the whole design uniformly to fit the new canvas and centre it.
 * Path masks keep their coordinates (they're slot-local) and are flagged for review by the admin.
 */
export function resizeDocument(doc: TemplateDocument, width: number, height: number): TemplateDocument {
  const k = Math.min(width / doc.canvas.width, height / doc.canvas.height);
  const dx = (width - doc.canvas.width * k) / 2;
  const dy = (height - doc.canvas.height * k) / 2;
  return TemplateDocument.parse({
    ...doc,
    canvas: { ...doc.canvas, width, height },
    layers: doc.layers.map((l) => transformLayer(l, k, dx, dy)),
  });
}
