import { FIELD_KEY_RE, walkLayers, type FieldType, type TemplateDocument } from '@sammly/template-schema';

export interface SuggestedField {
  key: string;
  type: FieldType;
  layerId: string;
  layerName: string;
  /** Text fields: the designed text, a good default label/sample. */
  sample?: string;
  /** Image slots: the layer should be converted to an imageSlot when accepted. */
  convertToSlot?: boolean;
}

/**
 * Designer naming convention (documented in the admin help):
 *   text layers   `@key`, `field:key`, `{{key}}`             → text / textarea field
 *   image layers  `@photo`, `@logo`, `zone:key`, `slot:key`  → image field + image slot
 */
const PATTERNS = [/^\s*@([A-Za-z][\w-]*)/, /^\s*(?:field|zone|slot):\s*([A-Za-z][\w-]*)/i, /^\s*\{\{\s*([A-Za-z][\w-]*)\s*\}\}/];

export function keyFromLayerName(name: string): string | null {
  for (const re of PATTERNS) {
    const m = re.exec(name);
    if (m) {
      const key = m[1]!.toLowerCase().replace(/-/g, '_');
      return FIELD_KEY_RE.test(key) ? key : null;
    }
  }
  return null;
}

export function suggestFields(doc: TemplateDocument): SuggestedField[] {
  const out: SuggestedField[] = [];
  const used = new Set<string>();
  for (const l of walkLayers(doc.layers)) {
    const key = keyFromLayerName(l.name);
    if (!key || used.has(key)) continue;
    if (l.type === 'text') {
      out.push({ key, type: l.text.includes('\n') ? 'textarea' : 'text', layerId: l.id, layerName: l.name, sample: l.text });
    } else if (l.type === 'raster' || l.type === 'image' || l.type === 'imageSlot') {
      out.push({ key, type: 'image', layerId: l.id, layerName: l.name, convertToSlot: l.type !== 'imageSlot' });
    } else continue;
    used.add(key);
  }
  return out;
}
