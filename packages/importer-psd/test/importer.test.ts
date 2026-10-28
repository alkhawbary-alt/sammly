import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { writePsdBuffer, type Psd } from 'ag-psd';
import { blendOnto } from '../src/blend';
import { ensureAgPsdCanvas, surface, ctx } from '../src/canvas';
import { applyFillOpacity } from '../src/effects';
import { importPsd, keyFromLayerName, weightFromFontName } from '../src';

ensureAgPsdCanvas();

const pixel = (s: ReturnType<typeof surface>, x = 0, y = 0) => Array.from(ctx(s).getImageData(x, y, 1, 1).data);
const solid = (w: number, h: number, color: string) => {
  const s = surface(w, h);
  ctx(s).fillStyle = color;
  ctx(s).fillRect(0, 0, w, h);
  return s;
};

describe('naming conventions', () => {
  it('derives field keys from tagged layer names', () => {
    expect(keyFromLayerName('@groom_name')).toBe('groom_name');
    expect(keyFromLayerName('field:groom_name')).toBe('groom_name');
    expect(keyFromLayerName('zone:photo')).toBe('photo');
    expect(keyFromLayerName('{{ business-name }}')).toBe('business_name');
    expect(keyFromLayerName('اسم العريس')).toBeNull();
  });

  it('reads weights from PostScript names', () => {
    expect(weightFromFontName('IBMPlexSansArabic-SemiBold')).toBe(600);
    expect(weightFromFontName('IBMPlexSansArabic-ExtraLight')).toBe(200);
    expect(weightFromFontName('Rubik-Light')).toBe(300);
    expect(weightFromFontName('Cairo-Bold')).toBe(700);
    expect(weightFromFontName('Barada-Reqa')).toBe(400);
  });
});

describe('compositing', () => {
  it('linear light follows Photoshop (b + 2s - 1)', () => {
    const dst = solid(1, 1, 'rgb(100,100,100)');
    blendOnto(dst, solid(1, 1, 'rgb(191,64,128)'), 'linear light');
    const [r, g, b] = pixel(dst);
    expect(r).toBeCloseTo(100 + 2 * 191 - 255, -1);
    expect(g).toBe(0);
    expect(b).toBeCloseTo(100 + 2 * 128 - 255, -1);
  });

  it('fill opacity fades colour (not alpha) for the special-eight modes', () => {
    const src = solid(1, 1, 'rgb(200,200,200)');
    const dodge = applyFillOpacity(src, 0.25, 'color dodge');
    expect(pixel(dodge)).toEqual([50, 50, 50, 255]);
    const normal = applyFillOpacity(src, 0.25, 'normal');
    expect(pixel(normal)[3]).toBeLessThan(80);
  });
});

describe('importPsd (synthetic PSD)', () => {
  function makePsd(): Buffer {
    const W = 400, H = 300;
    const bg = createCanvas(W, H);
    const b = bg.getContext('2d');
    b.fillStyle = '#204060';
    b.fillRect(0, 0, W, H);
    const photo = createCanvas(200, 150);
    photo.getContext('2d').fillStyle = '#e0a020';
    photo.getContext('2d').fillRect(0, 0, 200, 150);
    const composite = createCanvas(W, H);
    composite.getContext('2d').drawImage(bg, 0, 0);
    composite.getContext('2d').drawImage(photo, 100, 20);
    const psd: Psd = {
      width: W,
      height: H,
      canvas: composite as never,
      children: [
        { name: 'Background', left: 0, top: 0, canvas: bg as never },
        { name: '@photo', left: 100, top: 20, canvas: photo as never },
        {
          name: '@names',
          text: {
            text: 'محمد و سارة',
            transform: [2, 0, 0, 2, 300, 250],
            style: { font: { name: 'IBMPlexSansArabic-Bold' }, fontSize: 20, fillColor: { r: 255, g: 255, b: 255 }, tracking: 50 },
            paragraphStyle: { justification: 'left' },
          },
        },
        {
          name: 'Footer',
          text: {
            text: 'Sale',
            transform: [1, 0, 0, 1, 20, 280],
            style: { font: { name: 'SomeCommercialFont-Black' }, fontSize: 16, fillColor: { r: 0, g: 0, b: 0 } },
            paragraphStyle: { justification: 'left' },
          },
        },
      ],
    };
    return writePsdBuffer(psd, { invalidateTextLayers: true });
  }

  it('bakes the background, keeps text live, maps fonts and suggests fields', async () => {
    let n = 0;
    const r = await importPsd(makePsd(), {
      fileName: 'synthetic.psd',
      fontIdFor: (ps) => (ps === 'IBMPlexSansArabic-Bold' ? 'plex-700' : undefined),
      newAssetId: () => `a${++n}`,
    });
    const doc = r.document;
    expect(doc.canvas).toMatchObject({ width: 400, height: 300 });
    expect(doc.layers.map((l) => [l.name, l.type])).toEqual([
      ['Background (merged)', 'raster'],
      ['@photo', 'raster'],
      ['@names', 'text'],
      ['Footer', 'text'],
    ]);
    const names = doc.layers[2]!;
    if (names.type !== 'text') throw new Error('expected text');
    expect(names).toMatchObject({ direction: 'rtl', textBox: 'point', text: 'محمد و سارة' });
    expect(names.style).toMatchObject({ fontId: 'plex-700', fontSize: 40, fontWeight: 700, align: 'start' });
    // RTL "left" justification anchors the right edge at the transform x (300)
    expect(names.x + names.width).toBeCloseTo(300, 0);
    expect(names.baseline).toBeGreaterThan(0);
    expect(doc.fonts).toEqual([{ fontId: 'plex-700' }]);
    expect(r.report.missingFonts).toEqual([{ psdName: 'SomeCommercialFont-Black', layers: ['Footer'] }]);
    expect(r.report.suggestedFields.map((s) => [s.key, s.type])).toEqual([
      ['photo', 'image'],
      ['names', 'text'],
    ]);
    expect(r.assets.filter((a) => a.kind === 'COMPOSITE')).toHaveLength(1);
    expect(doc.meta.compositeAssetId).toBeDefined();
  });
});
