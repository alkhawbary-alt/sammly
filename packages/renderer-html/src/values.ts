import {
  Color,
  walkLayers,
  type BrandSource,
  type Field,
  type FieldValue,
  type FieldValues,
  type ImageValue,
  type Layer,
  type TemplateDocument,
} from '@sammly/template-schema';

export type BrandValues = Partial<Record<BrandSource, FieldValue>>;

export interface AppliedDocument {
  layers: Layer[];
  /** imageSlot layer id → image to draw (null = explicitly empty). */
  slotImages: Map<string, ImageValue | null>;
  /** svg layer id → fill override. */
  svgFills: Map<string, string>;
  /** layer id → field keys bound to it (for TEXT_OVERFLOW warnings). */
  fieldKeysByLayer: Map<string, string[]>;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toArabicDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]!);
}

export function formatDate(iso: string, format: 'hijri' | 'gregorian' | 'both', digits: 'western' | 'arabic'): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  const nu = digits === 'arabic' ? 'arab' : 'latn';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
  const greg = new Intl.DateTimeFormat(`ar-SA-u-ca-gregory-nu-${nu}`, opts).format(date);
  const hijri = new Intl.DateTimeFormat(`ar-SA-u-ca-islamic-umalqura-nu-${nu}`, opts).format(date);
  if (format === 'hijri') return hijri;
  if (format === 'both') return `${hijri} — ${greg}`;
  return greg;
}

/** Colors reach CSS, so re-check them here even though the API validates values. */
function safeColor(v: FieldValue | undefined): string | undefined {
  return typeof v === 'string' && Color.safeParse(v).success ? v : undefined;
}

function isEmpty(v: FieldValue | undefined): boolean {
  return v === null || v === '' || v === undefined;
}

/** Value precedence: locked brand value → user value → brand value → field default → (layer as designed). */
export function resolveValue(
  field: Field,
  values: FieldValues,
  brand: BrandValues,
  lockBrandFields: boolean,
): FieldValue | undefined {
  const brandValue = field.source !== 'user' ? brand[field.source] : undefined;
  if (lockBrandFields && brandValue !== undefined) return brandValue;
  const v = values[field.key];
  if (v !== undefined) return v;
  if (brandValue !== undefined) return brandValue;
  return field.default as FieldValue | undefined;
}

function textFor(field: Field, v: FieldValue): string {
  if (v === null || typeof v === 'object') return '';
  let s: string;
  if (field.type === 'date' && typeof v === 'string' && v) {
    return formatDate(v, field.constraints?.dateFormat ?? 'gregorian', field.digits);
  } else if (field.type === 'select') {
    s = field.constraints?.options?.find((o) => o.value === v)?.label.ar ?? String(v);
  } else {
    s = String(v);
  }
  return field.digits === 'arabic' ? toArabicDigits(s) : s;
}

/** Apply field values to a deep copy of the document's layers through the bindings. */
export function applyValues(doc: TemplateDocument, values: FieldValues, brand: BrandValues = {}): AppliedDocument {
  const layers = JSON.parse(JSON.stringify(doc.layers)) as Layer[];
  const byId = new Map<string, Layer>();
  for (const l of walkLayers(layers)) byId.set(l.id, l);

  const out: AppliedDocument = { layers, slotImages: new Map(), svgFills: new Map(), fieldKeysByLayer: new Map() };

  for (const field of doc.fields) {
    const v = resolveValue(field, values, brand, doc.rules.lockBrandFields);
    for (const b of field.bindings) {
      const layer = byId.get(b.layerId);
      if (!layer) continue;
      out.fieldKeysByLayer.set(layer.id, [...(out.fieldKeysByLayer.get(layer.id) ?? []), field.key]);
      if (v === undefined) continue; // keep the layer as designed

      switch (b.prop) {
        case 'text':
          if (layer.type === 'text') {
            layer.text = textFor(field, v);
            layer.runs = undefined;
          }
          break;
        case 'image':
          if (layer.type === 'imageSlot') {
            out.slotImages.set(layer.id, v !== null && typeof v === 'object' ? v : null);
          }
          break;
        case 'color':
          if (layer.type === 'text' && safeColor(v)) layer.style.color = safeColor(v)!;
          break;
        case 'fill':
          if (safeColor(v)) {
            if (layer.type === 'shape') layer.fill = safeColor(v);
            else if (layer.type === 'svg') out.svgFills.set(layer.id, safeColor(v)!);
          }
          break;
        case 'stroke':
          if (layer.type === 'shape' && safeColor(v)) layer.stroke = safeColor(v);
          break;
        case 'visible':
          if (isEmpty(v)) layer.visible = false;
          break;
      }
    }
  }
  return out;
}
