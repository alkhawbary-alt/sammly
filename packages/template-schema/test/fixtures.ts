import { TemplateDocument, type TemplateDocumentInput } from '../src';

/** A small wedding-congratulation template used across tests. */
export const weddingInput: TemplateDocumentInput = {
  schemaVersion: 1,
  canvas: { width: 1080, height: 1080, background: '#fdf8f0' },
  layers: [
    { id: 'bg', name: 'Background', type: 'raster', assetId: 'asset-bg', x: 0, y: 0, width: 1080, height: 1080 },
    {
      id: 'photo',
      name: '@photo',
      type: 'imageSlot',
      x: 340,
      y: 140,
      width: 400,
      height: 400,
      mask: { kind: 'shape', shape: 'circle' },
    },
    {
      id: 'title',
      name: 'Title',
      type: 'text',
      text: 'ألف مبروك',
      x: 140,
      y: 600,
      width: 800,
      height: 120,
      direction: 'rtl',
      style: { fontId: 'font-cairo-700', fontFamily: 'Cairo-Bold', fontSize: 96, fontWeight: 700, color: '#8a5a00', align: 'center' },
    },
    {
      id: 'names',
      name: '@names',
      type: 'text',
      text: 'محمد و سارة',
      x: 140,
      y: 740,
      width: 800,
      height: 90,
      direction: 'rtl',
      style: { fontId: 'font-cairo-400', fontFamily: 'Cairo-Regular', fontSize: 64, color: '#333333', align: 'center' },
      fit: { mode: 'shrink', minFontSize: 38 },
    },
    { id: 'phone-icon', name: 'Phone icon', type: 'shape', x: 860, y: 960, width: 40, height: 40, shape: 'ellipse', fill: '#8a5a00' },
    {
      id: 'phone',
      name: '@phone',
      type: 'text',
      text: '0500000000',
      x: 540,
      y: 960,
      width: 300,
      height: 44,
      style: { fontId: 'font-cairo-400', fontFamily: 'Cairo-Regular', fontSize: 32, color: '#333333', align: 'end' },
    },
  ],
  fields: [
    {
      key: 'names',
      label: { ar: 'أسماء العروسين', en: 'Couple names' },
      type: 'text',
      required: true,
      bindings: [{ layerId: 'names', prop: 'text' }],
      constraints: { maxLength: 40 },
      ai: { rewrite: true },
    },
    {
      key: 'photo',
      label: { ar: 'الصورة' },
      type: 'image',
      bindings: [{ layerId: 'photo', prop: 'image' }],
    },
    {
      key: 'phone',
      label: { ar: 'رقم الجوال' },
      type: 'phone',
      source: 'brand.phone',
      bindings: [
        { layerId: 'phone', prop: 'text' },
        { layerId: 'phone-icon', prop: 'visible' },
      ],
    },
    {
      key: 'accent',
      label: { ar: 'اللون' },
      type: 'color',
      bindings: [
        { layerId: 'title', prop: 'color' },
        { layerId: 'phone-icon', prop: 'fill' },
      ],
      constraints: { allowedColors: ['#8a5a00', '#1e3a8a', '#065f46'] },
    },
  ],
  fonts: [{ fontId: 'font-cairo-700' }, { fontId: 'font-cairo-400' }],
  rules: { aiPolicy: { level: 'text', instructions: 'Keep it formal.' } },
  meta: { source: 'manual' },
};

export const wedding = (): TemplateDocument => TemplateDocument.parse(weddingInput);
