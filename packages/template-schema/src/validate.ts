import type { TemplateDocument, TemplateVariant } from './document';
import type { BindingProp } from './fields';
import type { LayerType } from './layers';
import { unmappedFonts, walkLayers } from './walk';

export interface Problem {
  code:
    | 'DUPLICATE_LAYER_ID'
    | 'DUPLICATE_FIELD_KEY'
    | 'BINDING_LAYER_MISSING'
    | 'BINDING_INCOMPATIBLE'
    | 'FIELD_TYPE_BINDING_MISMATCH'
    | 'FONT_UNMAPPED'
    | 'FIELD_MISSING_IN_VARIANT'
    | 'VARIANT_FIELD_TYPE_MISMATCH'
    | 'DUPLICATE_VARIANT_ID';
  message: string;
  path?: string;
}

const PROP_TARGETS: Record<BindingProp, readonly LayerType[] | 'any'> = {
  text: ['text'],
  image: ['imageSlot'],
  fill: ['shape', 'svg'],
  color: ['text'],
  stroke: ['shape'],
  visible: 'any',
};

const TEXT_TYPES = ['text', 'textarea', 'date', 'phone', 'number', 'select'];

/** Structural checks that the Zod schema can't express. Empty array → OK to publish. */
export function validateDocument(doc: TemplateDocument): Problem[] {
  const problems: Problem[] = [];
  const layers = new Map<string, LayerType>();
  for (const l of walkLayers(doc.layers)) {
    if (layers.has(l.id)) problems.push({ code: 'DUPLICATE_LAYER_ID', message: `Duplicate layer id "${l.id}"` });
    layers.set(l.id, l.type);
  }

  const keys = new Set<string>();
  for (const f of doc.fields) {
    if (keys.has(f.key)) problems.push({ code: 'DUPLICATE_FIELD_KEY', message: `Duplicate field key "${f.key}"` });
    keys.add(f.key);
    for (const b of f.bindings) {
      const type = layers.get(b.layerId);
      const path = `fields.${f.key}.bindings.${b.layerId}`;
      if (!type) {
        problems.push({ code: 'BINDING_LAYER_MISSING', message: `Field "${f.key}" is bound to missing layer "${b.layerId}"`, path });
        continue;
      }
      const targets = PROP_TARGETS[b.prop];
      if (targets !== 'any' && !targets.includes(type)) {
        problems.push({ code: 'BINDING_INCOMPATIBLE', message: `"${b.prop}" can't bind to a ${type} layer (field "${f.key}")`, path });
      }
      const typeOk =
        (b.prop === 'text' && TEXT_TYPES.includes(f.type)) ||
        (b.prop === 'image' && f.type === 'image') ||
        (['fill', 'color', 'stroke'].includes(b.prop) && f.type === 'color') ||
        b.prop === 'visible';
      if (!typeOk) {
        problems.push({ code: 'FIELD_TYPE_BINDING_MISMATCH', message: `A ${f.type} field can't drive "${b.prop}" (field "${f.key}")`, path });
      }
    }
  }

  for (const name of unmappedFonts(doc.layers)) {
    problems.push({ code: 'FONT_UNMAPPED', message: `Font "${name}" is not mapped to the font library` });
  }
  return problems;
}

/** Publish checks across variants: each variant valid, same field keys and types everywhere. */
export function validateVariants(variants: TemplateVariant[]): Problem[] {
  const problems: Problem[] = [];
  const ids = new Set<string>();
  for (const v of variants) {
    if (ids.has(v.id)) problems.push({ code: 'DUPLICATE_VARIANT_ID', message: `Duplicate variant id "${v.id}"` });
    ids.add(v.id);
    for (const p of validateDocument(v.document)) problems.push({ ...p, path: `variants.${v.id}${p.path ? '.' + p.path : ''}` });
  }

  const allKeys = new Map<string, string>(); // key → type
  for (const v of variants) for (const f of v.document.fields) if (!allKeys.has(f.key)) allKeys.set(f.key, f.type);

  for (const v of variants) {
    const own = new Map(v.document.fields.map((f) => [f.key, f.type]));
    for (const [key, type] of allKeys) {
      if (!own.has(key)) {
        problems.push({ code: 'FIELD_MISSING_IN_VARIANT', message: `Variant "${v.name}" has no field "${key}"`, path: `variants.${v.id}` });
      } else if (own.get(key) !== type) {
        problems.push({ code: 'VARIANT_FIELD_TYPE_MISMATCH', message: `Field "${key}" is ${own.get(key)} in "${v.name}" but ${type} elsewhere`, path: `variants.${v.id}` });
      }
    }
  }
  return problems;
}
