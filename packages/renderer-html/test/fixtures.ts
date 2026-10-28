import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { TemplateDocument, type TemplateDocumentInput } from '@sammly/template-schema';
import type { LoadedAsset } from '../src/qa';
import type { RenderOptions, ResolvedFont } from '../src';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const fontsDir = path.join(root, 'fixtures', 'fonts');

export const FONTS: Record<string, ResolvedFont & { file: string }> = {
  'plex-400': { family: 'IBM Plex Sans Arabic', weight: 400, style: 'normal', url: 'https://assets.local/font%3Aplex-400', file: 'IBMPlexSansArabic-Regular.woff2' },
  'plex-700': { family: 'IBM Plex Sans Arabic', weight: 700, style: 'normal', url: 'https://assets.local/font%3Aplex-700', file: 'IBMPlexSansArabic-Bold.woff2' },
};

const svgPng = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();

/** Deterministic bitmap assets generated from SVG (no binary fixtures needed). */
async function buildAssets(): Promise<Map<string, LoadedAsset>> {
  const png = async (svg: string): Promise<LoadedAsset> => ({ body: await svgPng(svg), contentType: 'image/png' });
  const m = new Map<string, LoadedAsset>();
  m.set(
    'bg-cream',
    await png(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7e6"/><stop offset="1" stop-color="#f3dfb8"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#g)"/><rect x="40" y="40" width="1000" height="1000" fill="none" stroke="#c9a14a" stroke-width="6"/></svg>`),
  );
  m.set(
    'bg-green',
    await png(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#0f3d2e"/><circle cx="540" cy="-200" r="700" fill="#14543f"/><circle cx="1000" cy="1300" r="300" fill="#1b6b51"/></svg>`),
  );
  m.set(
    'photo',
    await png(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#5b8def"/><circle cx="200" cy="200" r="140" fill="#ffd34d"/><rect x="420" y="250" width="300" height="300" fill="#e2507a"/><polygon points="0,600 400,320 800,600" fill="#2e7d32"/></svg>`),
  );
  m.set(
    'mask-star',
    await png(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><polygon points="200,10 250,150 395,150 278,240 322,385 200,300 78,385 122,240 5,150 150,150" fill="#000"/></svg>`),
  );
  m.set(
    'frame',
    await png(`<svg xmlns="http://www.w3.org/2000/svg" width="440" height="440"><circle cx="220" cy="220" r="205" fill="none" stroke="#c9a14a" stroke-width="14"/></svg>`),
  );
  for (const [id, f] of Object.entries(FONTS)) {
    m.set(`font:${id}`, { body: await fs.readFile(path.join(fontsDir, f.file)), contentType: 'font/woff2' });
  }
  return m;
}

let assetsPromise: Promise<Map<string, LoadedAsset>> | undefined;
export const assets = () => (assetsPromise ??= buildAssets());
export const loadAsset = async (id: string) => (await assets()).get(id) ?? null;

export const exportOpts: RenderOptions = {
  mode: 'export',
  resolveAsset: (id) => `https://assets.local/${encodeURIComponent(id)}`,
  resolveFont: (id) => FONTS[id],
};

// ─── Template fixtures (Arabic first) ──────────────────────────────────

const doc = (d: TemplateDocumentInput) => TemplateDocument.parse(d);

/** Wedding congratulation: circle-masked photo slot + frame foreground, shrink-to-fit names. */
export const wedding = doc({
  schemaVersion: 1,
  canvas: { width: 1080, height: 1080, background: '#ffffff' },
  layers: [
    { id: 'bg', name: 'Background', type: 'raster', assetId: 'bg-cream', x: 0, y: 0, width: 1080, height: 1080 },
    { id: 'photo', name: '@photo', type: 'imageSlot', x: 340, y: 120, width: 400, height: 400, mask: { kind: 'shape', shape: 'circle' }, emptyColor: '#e8dcc4' },
    { id: 'frame', name: 'Frame', type: 'raster', assetId: 'frame', x: 320, y: 100, width: 440, height: 440 },
    {
      id: 'title', name: 'Title', type: 'text', text: 'ألف ألف مبروك', x: 90, y: 570, width: 900, height: 140, direction: 'rtl', verticalAlign: 'middle',
      style: { fontId: 'plex-700', fontFamily: 'IBMPlexSansArabic-Bold', fontSize: 100, color: '#8a5a00', align: 'center' },
    },
    {
      id: 'names', name: '@names', type: 'text', text: 'محمد و سارة', x: 140, y: 730, width: 800, height: 100, direction: 'rtl', textBox: 'point', verticalAlign: 'middle',
      style: { fontId: 'plex-400', fontFamily: 'IBMPlexSansArabic', fontSize: 72, color: '#333333', align: 'center' },
      fit: { mode: 'shrink', minFontSize: 30 },
    },
    {
      id: 'wish', name: 'Wish', type: 'text', text: 'بارك الله لكما وبارك عليكما وجمع بينكما في خير', x: 140, y: 860, width: 800, height: 120, direction: 'rtl',
      style: { fontId: 'plex-400', fontFamily: 'IBMPlexSansArabic', fontSize: 40, lineHeight: 56, color: '#5c4a2a', align: 'center' },
    },
  ],
  fields: [
    { key: 'names', label: { ar: 'أسماء العروسين' }, type: 'text', required: true, bindings: [{ layerId: 'names', prop: 'text' }], constraints: { maxLength: 60 } },
    { key: 'photo', label: { ar: 'الصورة' }, type: 'image', bindings: [{ layerId: 'photo', prop: 'image' }] },
  ],
  meta: { source: 'manual' },
});

/** Friday greeting: wrapped paragraph box, hijri date with Arabic digits, alpha-masked (star) slot. */
export const friday = doc({
  schemaVersion: 1,
  canvas: { width: 1080, height: 1350, background: '#0f3d2e' },
  layers: [
    { id: 'bg', name: 'Background', type: 'raster', assetId: 'bg-green', x: 0, y: 0, width: 1080, height: 1350 },
    {
      id: 'title', name: 'Title', type: 'text', text: 'جمعة مباركة', x: 90, y: 120, width: 900, height: 150, direction: 'rtl', verticalAlign: 'middle',
      style: { fontId: 'plex-700', fontFamily: 'IBMPlexSansArabic-Bold', fontSize: 120, color: '#f5d77a', align: 'center' },
    },
    {
      id: 'body', name: '@body', type: 'text', text: '', x: 140, y: 320, width: 800, height: 260, direction: 'rtl', textBox: 'box',
      style: { fontId: 'plex-400', fontFamily: 'IBMPlexSansArabic', fontSize: 48, lineHeight: 72, color: '#ffffff', align: 'center' },
      fit: { mode: 'wrap-shrink', minFontSize: 28, maxLines: 3 },
    },
    { id: 'logo', name: '@logo', type: 'imageSlot', x: 390, y: 640, width: 300, height: 300, fit: 'cover', mask: { kind: 'alpha', assetId: 'mask-star' } },
    {
      id: 'date', name: '@date', type: 'text', text: '', x: 140, y: 1000, width: 800, height: 70, direction: 'rtl', verticalAlign: 'middle',
      style: { fontId: 'plex-400', fontFamily: 'IBMPlexSansArabic', fontSize: 40, color: '#f5d77a', align: 'center' },
    },
    { id: 'divider', name: 'Divider', type: 'shape', x: 390, y: 1100, width: 300, height: 6, radius: 3, fill: '#f5d77a' },
  ],
  fields: [
    { key: 'body', label: { ar: 'الدعاء' }, type: 'textarea', required: true, bindings: [{ layerId: 'body', prop: 'text' }], constraints: { maxLength: 160, maxLines: 3 } },
    { key: 'logo', label: { ar: 'الشعار' }, type: 'image', source: 'brand.logo', bindings: [{ layerId: 'logo', prop: 'image' }] },
    { key: 'date', label: { ar: 'التاريخ' }, type: 'date', digits: 'arabic', bindings: [{ layerId: 'date', prop: 'text' }], constraints: { dateFormat: 'hijri' } },
    { key: 'accent', label: { ar: 'لون' }, type: 'color', bindings: [{ layerId: 'divider', prop: 'fill' }, { layerId: 'title', prop: 'color' }] },
  ],
  meta: { source: 'manual' },
});

/** Offer with a price: mixed Arabic/Latin/digits, path-masked slot, optional phone hides its badge. */
export const offer = doc({
  schemaVersion: 1,
  canvas: { width: 1080, height: 1080, background: '#fff4f0' },
  layers: [
    { id: 'band', name: 'Band', type: 'shape', x: 0, y: 0, width: 1080, height: 220, fill: '#d62d4b' },
    {
      id: 'headline', name: '@headline', type: 'text', text: 'خصم 50% على جميع العطور', x: 60, y: 50, width: 960, height: 120, direction: 'rtl', textBox: 'point', verticalAlign: 'middle',
      style: { fontId: 'plex-700', fontFamily: 'IBMPlexSansArabic-Bold', fontSize: 76, color: '#ffffff', align: 'start' },
      fit: { mode: 'shrink', minFontSize: 40 },
    },
    {
      id: 'product', name: '@product', type: 'imageSlot', x: 80, y: 280, width: 520, height: 520, fit: 'cover',
      mask: { kind: 'path', svgPath: 'M260 0 L520 260 L260 520 L0 260 Z' },
    },
    { id: 'price-bg', name: 'Price bg', type: 'shape', x: 640, y: 380, width: 360, height: 200, radius: 28, fill: '#1f2937' },
    {
      id: 'price', name: '@price', type: 'text', text: '199 ر.س', x: 660, y: 400, width: 320, height: 160, direction: 'rtl', verticalAlign: 'middle',
      style: { fontId: 'plex-700', fontFamily: 'IBMPlexSansArabic-Bold', fontSize: 80, color: '#ffffff', align: 'center' },
      fit: { mode: 'shrink', minFontSize: 40 },
    },
    {
      id: 'handle', name: '@instagram', type: 'text', text: '', x: 60, y: 880, width: 960, height: 60, direction: 'rtl', verticalAlign: 'middle',
      style: { fontId: 'plex-400', fontFamily: 'IBMPlexSansArabic', fontSize: 40, color: '#1f2937', align: 'start' },
    },
    { id: 'phone-badge', name: 'Phone badge', type: 'shape', x: 60, y: 960, width: 420, height: 80, radius: 40, fill: '#d62d4b', stroke: '#1f2937', strokeWidth: 4 },
    {
      id: 'phone', name: '@phone', type: 'text', text: '', x: 60, y: 960, width: 420, height: 80, direction: 'rtl', verticalAlign: 'middle',
      style: { fontId: 'plex-700', fontFamily: 'IBMPlexSansArabic-Bold', fontSize: 36, color: '#ffffff', align: 'center' },
    },
  ],
  fields: [
    { key: 'headline', label: { ar: 'العنوان' }, type: 'text', required: true, bindings: [{ layerId: 'headline', prop: 'text' }] },
    { key: 'product', label: { ar: 'صورة المنتج' }, type: 'image', bindings: [{ layerId: 'product', prop: 'image' }] },
    { key: 'price', label: { ar: 'السعر' }, type: 'text', bindings: [{ layerId: 'price', prop: 'text' }] },
    { key: 'instagram', label: { ar: 'انستقرام' }, type: 'text', source: 'brand.instagram', bindings: [{ layerId: 'handle', prop: 'text' }] },
    { key: 'phone', label: { ar: 'الجوال' }, type: 'phone', source: 'brand.phone', bindings: [{ layerId: 'phone', prop: 'text' }, { layerId: 'phone-badge', prop: 'visible' }] },
  ],
  meta: { source: 'manual' },
});

/** Story variant of the wedding template: same field keys, different layout. */
export const weddingStory = doc({
  ...wedding,
  canvas: { width: 1080, height: 1920, background: '#ffffff' },
  layers: wedding.layers.map((l) => ({ ...l, y: l.id === 'bg' ? 0 : l.y + 420, height: l.id === 'bg' ? 1920 : l.height })),
});
