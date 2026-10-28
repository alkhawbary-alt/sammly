import { z } from 'zod';
import { AssetId, Color, LocalizedText } from './common';

export const FieldType = z.enum(['text', 'textarea', 'image', 'color', 'date', 'phone', 'select', 'number']);
export type FieldType = z.infer<typeof FieldType>;

export const BindingProp = z.enum(['text', 'image', 'fill', 'color', 'stroke', 'visible']);
export type BindingProp = z.infer<typeof BindingProp>;

/**
 * Where a field's value goes.
 * - text    → text layer content (text/textarea/date/phone/number/select)
 * - image   → imageSlot content
 * - fill    → shape fill / svg fill · color → text color · stroke → shape stroke
 * - visible → the layer is hidden when the field value is empty ('' / null), shown otherwise
 */
export const Binding = z.object({
  layerId: z.string().min(1),
  prop: BindingProp,
});
export type Binding = z.infer<typeof Binding>;

export const BrandSource = z.enum([
  'brand.logo',
  'brand.name',
  'brand.phone',
  'brand.primaryColor',
  'brand.secondaryColor',
  'brand.website',
  'brand.instagram',
  'brand.address',
]);
export type BrandSource = z.infer<typeof BrandSource>;

export const FieldConstraints = z.object({
  maxLength: z.number().int().positive().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLines: z.number().int().positive().optional(),
  options: z.array(z.object({ value: z.string(), label: LocalizedText })).optional(),
  allowedColors: z.array(Color).optional(),
  image: z
    .object({
      minWidth: z.number().int().positive().optional(),
      minHeight: z.number().int().positive().optional(),
      maxMB: z.number().positive().optional(),
      mime: z.array(z.string()).optional(),
    })
    .optional(),
  dateFormat: z.enum(['hijri', 'gregorian', 'both']).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type FieldConstraints = z.infer<typeof FieldConstraints>;

export const FIELD_KEY_RE = /^[a-z][a-z0-9_]*$/;

export const Field = z.object({
  key: z.string().regex(FIELD_KEY_RE, 'Field key must match ^[a-z][a-z0-9_]*$'),
  label: LocalizedText,
  help: LocalizedText.optional(),
  type: FieldType,
  required: z.boolean().default(false),
  default: z.unknown().optional(),
  bindings: z.array(Binding).min(1),
  constraints: FieldConstraints.optional(),
  source: z.union([z.literal('user'), BrandSource]).default('user'),
  /** Digits used when the value is drawn (text-like fields only). */
  digits: z.enum(['western', 'arabic']).default('western'),
  ai: z.object({ rewrite: z.boolean(), maxCredits: z.number().int().positive().optional() }).optional(),
});
export type Field = z.infer<typeof Field>;
export type FieldInput = z.input<typeof Field>;

// ─── Values ────────────────────────────────────────────────────────────

export const ImageCrop = z.object({
  /** Focal point, 0..1 of the image (0.5,0.5 = centre). */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  /** Extra zoom on top of the slot fit, ≥ 1. */
  scale: z.number().min(1).max(10),
});
export type ImageCrop = z.infer<typeof ImageCrop>;

export const ImageValue = z.object({ assetId: AssetId, crop: ImageCrop.optional() });
export type ImageValue = z.infer<typeof ImageValue>;

export type FieldValue = string | number | ImageValue | null;
export type FieldValues = Record<string, FieldValue | undefined>;

const PHONE_RE = /^\+?[0-9٠-٩\s()-]{5,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function textSchema(field: Field): z.ZodType<string> {
  const c = field.constraints ?? {};
  let s = z.string();
  if (c.maxLength !== undefined) s = s.max(c.maxLength, { message: `max ${c.maxLength} characters` });
  if (c.minLength !== undefined) s = s.min(c.minLength, { message: `min ${c.minLength} characters` });
  if (c.maxLines !== undefined) {
    const maxLines = c.maxLines;
    return s.refine((v) => v.split('\n').length <= maxLines, { message: `max ${maxLines} lines` });
  }
  if (field.type === 'text') return s.refine((v) => !v.includes('\n'), { message: 'single line only' });
  return s;
}

/** Zod schema for one field's value. Shared by the API and the forms. */
export function buildFieldValueSchema(field: Field): z.ZodType<FieldValue> {
  const c = field.constraints ?? {};
  switch (field.type) {
    case 'text':
    case 'textarea':
      return textSchema(field);
    case 'phone':
      return z.string().regex(PHONE_RE, { message: 'invalid phone number' });
    case 'date':
      return z
        .string()
        .regex(DATE_RE, { message: 'date must be YYYY-MM-DD' })
        .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), { message: 'invalid date' });
    case 'select': {
      const allowed = (c.options ?? []).map((o) => o.value);
      return z.string().refine((v) => allowed.includes(v), { message: 'not one of the options' });
    }
    case 'number': {
      let n = z.number();
      if (c.min !== undefined) n = n.min(c.min);
      if (c.max !== undefined) n = n.max(c.max);
      return n;
    }
    case 'color': {
      const allowed = c.allowedColors?.map((x) => x.toLowerCase());
      return allowed
        ? Color.refine((v) => allowed.includes(v.toLowerCase()), { message: 'color not in the allowed palette' })
        : Color;
    }
    case 'image':
      return ImageValue;
  }
}

/**
 * Builds the values schema for a template's field list. Required fields without a default
 * (and not brand-sourced) must be present and non-empty; unknown keys are rejected.
 */
export function buildValuesSchema(fields: Field[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    const value = buildFieldValueSchema(f);
    const mustProvide = f.required && f.default === undefined && f.source === 'user';
    if (mustProvide) {
      shape[f.key] =
        f.type === 'image' || f.type === 'number'
          ? value
          : value.refine((v) => typeof v !== 'string' || v.trim().length > 0, { message: 'required' });
    } else {
      // Optional: '' and null mean "intentionally empty" (hides visible-bound layers).
      shape[f.key] = z.union([z.literal(''), z.null(), value]).optional();
    }
  }
  return z.object(shape).strict();
}
