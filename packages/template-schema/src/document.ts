import { z } from 'zod';
import { AssetId, Color } from './common';
import { Field } from './fields';
import { Layer } from './layers';

export const SCHEMA_VERSION = 1 as const;

export const FontRef = z.object({
  fontId: z.string().min(1),
});
export type FontRef = z.infer<typeof FontRef>;

export const TemplateRules = z.object({
  lockBrandFields: z.boolean().default(false),
  aiPolicy: z
    .object({
      level: z.enum(['none', 'text', 'text+image']).default('none'),
      /** "AI instructions per template": what may change, what must stay, tone, how to treat images. */
      instructions: z.string().max(4000).optional(),
    })
    .default({ level: 'none' }),
  /** Variant ids allowed for export (empty = all variants). */
  exportSizes: z.array(z.string()).default([]),
});
export type TemplateRules = z.infer<typeof TemplateRules>;

export const TemplateMeta = z.object({
  source: z.enum(['psd', 'manual', 'duplicate']),
  sourceFileName: z.string().optional(),
  importReportId: z.string().optional(),
  compositeAssetId: AssetId.optional(),
});

export const TemplateDocument = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  canvas: z.object({
    width: z.number().int().positive().max(10000),
    height: z.number().int().positive().max(10000),
    background: Color.default('#ffffff'),
  }),
  /** Paint order: index 0 is drawn first (bottom). */
  layers: z.array(Layer),
  /** The form; array order is form order. */
  fields: z.array(Field).default([]),
  fonts: z.array(FontRef).default([]),
  rules: TemplateRules.default({ lockBrandFields: false, aiPolicy: { level: 'none' }, exportSizes: [] }),
  meta: TemplateMeta,
});
export type TemplateDocument = z.infer<typeof TemplateDocument>;
export type TemplateDocumentInput = z.input<typeof TemplateDocument>;

/** One output size of a template. All variants of a template share the same field keys. */
export const TemplateVariant = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  document: TemplateDocument,
});
export type TemplateVariant = z.infer<typeof TemplateVariant>;

export const STANDARD_SIZES = [
  { id: 'square', name: 'Square', width: 1080, height: 1080 },
  { id: 'portrait', name: 'Portrait', width: 1080, height: 1350 },
  { id: 'story', name: 'Story', width: 1080, height: 1920 },
  { id: 'landscape', name: 'Landscape', width: 1200, height: 628 },
] as const;
