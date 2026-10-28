import { describe, expect, it } from 'vitest';
import {
  TemplateDocument,
  buildValuesSchema,
  detectDirection,
  fromPocDesign,
  migrate,
  unmappedFonts,
  usedFontIds,
  validateDocument,
  validateVariants,
  type PocDesignDocument,
} from '../src';
import { wedding, weddingInput } from './fixtures';

describe('TemplateDocument', () => {
  it('parses and fills defaults', () => {
    const doc = wedding();
    const title = doc.layers.find((l) => l.id === 'title');
    expect(title?.locked).toBe(true);
    expect(title?.opacity).toBe(1);
    expect(doc.rules.lockBrandFields).toBe(false);
    expect(doc.fields[0]?.source).toBe('user');
  });

  it('round-trips through JSON', () => {
    const doc = wedding();
    expect(TemplateDocument.parse(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('rejects bad field keys and unsafe colors', () => {
    const badKey = structuredClone(weddingInput);
    badKey.fields![0]!.key = 'Bad-Key';
    expect(TemplateDocument.safeParse(badKey).success).toBe(false);

    const badColor = structuredClone(weddingInput);
    (badColor.canvas as { background: string }).background = 'red;}</style><script>';
    expect(TemplateDocument.safeParse(badColor).success).toBe(false);
  });

  it('parses nested groups', () => {
    const input = structuredClone(weddingInput);
    input.layers = [
      {
        id: 'g',
        name: 'Group',
        type: 'group',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        children: [{ id: 'inner', name: 'Inner', type: 'shape', x: 0, y: 0, width: 5, height: 5, fill: '#fff' }],
      },
    ];
    input.fields = [];
    const doc = TemplateDocument.parse(input);
    expect(doc.layers[0]?.type).toBe('group');
  });
});

describe('fonts & direction', () => {
  it('detects Arabic', () => {
    expect(detectDirection('ألف مبروك')).toBe('rtl');
    expect(detectDirection('Grand opening')).toBe('ltr');
    expect(detectDirection('خصم 50%')).toBe('rtl');
  });

  it('lists used and unmapped fonts', () => {
    const doc = wedding();
    expect(usedFontIds(doc.layers)).toEqual(['font-cairo-700', 'font-cairo-400']);
    expect(unmappedFonts(doc.layers)).toEqual([]);
  });
});

describe('buildValuesSchema', () => {
  const schema = buildValuesSchema(wedding().fields);

  it('accepts valid values', () => {
    const r = schema.safeParse({ names: 'أحمد و نورة', photo: { assetId: 'u1', crop: { x: 0.5, y: 0.3, scale: 1.2 } }, accent: '#1E3A8A' });
    expect(r.success).toBe(true);
  });

  it('requires required user fields and allows brand-sourced ones to be omitted', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ names: '   ' }).success).toBe(false);
    expect(schema.safeParse({ names: 'سارة' }).success).toBe(true);
  });

  it('enforces maxLength, single line, palette, phone format and unknown keys', () => {
    expect(schema.safeParse({ names: 'أ'.repeat(41) }).success).toBe(false);
    expect(schema.safeParse({ names: 'سطر\nسطر' }).success).toBe(false);
    expect(schema.safeParse({ names: 'سارة', accent: '#ff0000' }).success).toBe(false);
    expect(schema.safeParse({ names: 'سارة', phone: 'call me' }).success).toBe(false);
    expect(schema.safeParse({ names: 'سارة', phone: '+966 50 000 0000' }).success).toBe(true);
    expect(schema.safeParse({ names: 'سارة', phone: '' }).success).toBe(true);
    expect(schema.safeParse({ names: 'سارة', typo: 'x' }).success).toBe(false);
  });

  it('validates select, date, number and textarea lines', () => {
    const s = buildValuesSchema([
      { key: 'kind', label: { ar: 'نوع' }, type: 'select', required: true, bindings: [{ layerId: 'a', prop: 'text' }], constraints: { options: [{ value: 'a', label: { ar: 'أ' } }] }, source: 'user', digits: 'western' },
      { key: 'when', label: { ar: 'تاريخ' }, type: 'date', required: true, bindings: [{ layerId: 'b', prop: 'text' }], source: 'user', digits: 'western' },
      { key: 'price', label: { ar: 'سعر' }, type: 'number', required: true, bindings: [{ layerId: 'c', prop: 'text' }], constraints: { min: 0 }, source: 'user', digits: 'western' },
      { key: 'body', label: { ar: 'نص' }, type: 'textarea', required: false, bindings: [{ layerId: 'd', prop: 'text' }], constraints: { maxLines: 2 }, source: 'user', digits: 'western' },
    ]);
    expect(s.safeParse({ kind: 'a', when: '2026-11-20', price: 99, body: 'a\nb' }).success).toBe(true);
    expect(s.safeParse({ kind: 'z', when: '2026-11-20', price: 99 }).success).toBe(false);
    expect(s.safeParse({ kind: 'a', when: '20/11/2026', price: 99 }).success).toBe(false);
    expect(s.safeParse({ kind: 'a', when: '2026-11-20', price: -1 }).success).toBe(false);
    expect(s.safeParse({ kind: 'a', when: '2026-11-20', price: 1, body: 'a\nb\nc' }).success).toBe(false);
  });
});

describe('validateDocument / validateVariants', () => {
  it('passes a correct template', () => {
    expect(validateDocument(wedding())).toEqual([]);
  });

  it('reports bad bindings and unmapped fonts', () => {
    const input = structuredClone(weddingInput);
    input.fields!.push({ key: 'ghost', label: { ar: 'x' }, type: 'text', bindings: [{ layerId: 'nope', prop: 'text' }] });
    input.fields!.push({ key: 'wrong', label: { ar: 'x' }, type: 'text', bindings: [{ layerId: 'photo', prop: 'text' }] });
    const names = input.layers.find((l) => l.id === 'names') as { style: { fontId?: string } };
    delete names.style.fontId;
    const codes = validateDocument(TemplateDocument.parse(input)).map((p) => p.code);
    expect(codes).toContain('BINDING_LAYER_MISSING');
    expect(codes).toContain('BINDING_INCOMPATIBLE');
    expect(codes).toContain('FONT_UNMAPPED');
  });

  it('requires every variant to define every field key', () => {
    const square = wedding();
    const story = { ...wedding(), fields: wedding().fields.filter((f) => f.key !== 'accent') };
    const problems = validateVariants([
      { id: 'square', name: 'Square', width: 1080, height: 1080, document: square },
      { id: 'story', name: 'Story', width: 1080, height: 1920, document: story },
    ]);
    expect(problems.map((p) => p.code)).toEqual(['FIELD_MISSING_IN_VARIANT']);
  });
});

describe('migrate', () => {
  it('accepts v1 and rejects unknown versions', () => {
    expect(migrate(JSON.parse(JSON.stringify(wedding())))).toEqual(wedding());
    expect(() => migrate({ ...wedding(), schemaVersion: 99 })).toThrow(/schemaVersion/);
    expect(() => migrate(null)).toThrow();
  });

  it('converts a POC design document', () => {
    const poc: PocDesignDocument = {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff',
      meta: { sourceFormat: 'psd', originalFileName: 'sample.psd', compositeUrl: '/assets/composite.png' },
      layers: [
        { id: 't1', name: 'Arabic', type: 'text', x: 10, y: 10, width: 300, height: 50, text: 'عرض خاص', style: { fontSize: 40, fontFamily: 'Cairo-Bold', fontWeight: 'bold', textAlign: 'right', letterSpacing: 2, color: '#111111' } },
        { id: 't2', name: 'Latin', type: 'text', x: 10, y: 80, width: 300, height: 50, text: 'Sale', style: { fontSize: 30, textAlign: 'right', letterSpacing: 2 } },
        { id: 's1', name: 'Card', type: 'shape', x: 0, y: 0, width: 100, height: 100, shapeType: 'rectangle', fill: '#3b82f6', borderRadius: 8 },
        { id: 'r1', name: 'FX', type: 'raster', x: 0, y: 0, width: 50, height: 50, src: '/assets/fx.png', blendMode: 'vivid-light' },
        { id: 'g1', name: 'Group', type: 'group', x: 0, y: 0, width: 800, height: 600, children: [{ id: 'c1', name: 'Dot', type: 'shape', x: 1, y: 1, width: 2, height: 2, shapeType: 'circle', fill: '#000000' }] },
      ],
    };
    const doc = fromPocDesign(poc, { srcToAssetId: (s) => `asset:${s}`, fontIdFor: (f) => (f === 'Cairo-Bold' ? 'font-cairo-700' : undefined) });
    const [ar, en, card, fx, group] = doc.layers;
    expect(ar).toMatchObject({ type: 'text', direction: 'rtl', style: { align: 'start', fontWeight: 700, fontId: 'font-cairo-700', letterSpacing: undefined } });
    expect(en).toMatchObject({ type: 'text', direction: 'ltr', style: { align: 'end', letterSpacing: 2 } });
    expect(card).toMatchObject({ type: 'shape', radius: 8 });
    expect(fx).toMatchObject({ type: 'raster', assetId: 'asset:/assets/fx.png', blendMode: 'normal' });
    expect(group?.type === 'group' && group.children[0]).toMatchObject({ shape: 'ellipse' });
    expect(doc.meta).toEqual({ source: 'psd', sourceFileName: 'sample.psd', compositeAssetId: 'asset:/assets/composite.png' });
  });
});
