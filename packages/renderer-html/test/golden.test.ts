/**
 * Golden-image tests: render fixtures headlessly and pixel-diff against committed PNGs.
 * Goldens are per platform (font rasterization differs between Windows/macOS/Linux):
 *   test/golden/<platform>/<name>.png
 * A missing golden is written on first run (locally) and the test passes with a note;
 * on CI a missing golden is skipped instead. `pnpm golden:update` rewrites them.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FieldValues, TemplateDocument } from '@sammly/template-schema';
import { buildRenderHtml } from '../src';
import { compareImages, renderPage, type RenderPageResult } from '../src/qa';
import { exportOpts, friday, loadAsset, offer, wedding, weddingStory } from './fixtures';

const goldenDir = path.join(import.meta.dirname, 'golden', process.platform);
const outDir = path.join(import.meta.dirname, '..', 'test-output');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const MAX_DIFF_PERCENT = 0.5;

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

async function render(doc: TemplateDocument, values: FieldValues, brand = {}, deviceScaleFactor = 1): Promise<RenderPageResult> {
  const { html } = buildRenderHtml(doc, values, { ...exportOpts, brand });
  return renderPage(browser, html, { width: doc.canvas.width, height: doc.canvas.height, deviceScaleFactor, loadAsset });
}

async function matchGolden(name: string, png: Buffer): Promise<void> {
  const file = path.join(goldenDir, `${name}.png`);
  const exists = await fs.stat(file).then(() => true, () => false);
  if (!exists || UPDATE) {
    if (process.env.CI && !exists) return console.warn(`[golden] no ${process.platform} golden for ${name}; skipped on CI`);
    await fs.mkdir(goldenDir, { recursive: true });
    await fs.writeFile(file, png);
    console.warn(`[golden] wrote ${path.relative(process.cwd(), file)}`);
    return;
  }
  const diff = await compareImages(await fs.readFile(file), png);
  if (diff.diffPercentage > MAX_DIFF_PERCENT) {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, `${name}.actual.png`), png);
    await fs.writeFile(path.join(outDir, `${name}.diff.png`), diff.diffPng);
  }
  expect(diff.diffPercentage, `${name}: ${diff.diffPercentage}% pixels differ (see test-output/)`).toBeLessThanOrEqual(MAX_DIFF_PERCENT);
}

describe('golden renders', () => {
  it('wedding — Arabic RTL, embedded fonts, circle-masked photo slot', async () => {
    const r = await render(wedding, { names: 'عبدالله و نورة', photo: { assetId: 'photo', crop: { x: 0.3, y: 0.4, scale: 1.2 } } });
    expect(r.overflow).toEqual([]);
    await matchGolden('wedding', r.png);
  });

  it('friday — wrapped paragraph, hijri date with Arabic digits, alpha-masked brand logo', async () => {
    const r = await render(
      friday,
      { body: 'اللهم اجعل هذه الجمعة جمعة خير وبركة علينا وعلى أحبابنا', date: '2026-11-20', accent: '#7dd3fc' },
      { 'brand.logo': { assetId: 'photo' } },
    );
    expect(r.overflow).toEqual([]);
    await matchGolden('friday', r.png);
  });

  it('offer — mixed Arabic/Latin/digits, path mask, brand handle, phone badge', async () => {
    const r = await render(
      offer,
      { headline: 'خصم 50% على جميع العطور', price: '199 ر.س', product: { assetId: 'photo' } },
      { 'brand.instagram': '@sammly_shop', 'brand.phone': '+966 55 123 4567' },
    );
    expect(r.overflow).toEqual([]);
    await matchGolden('offer', r.png);
  });

  it('offer without phone — the badge bound to "visible" disappears', async () => {
    const r = await render(offer, { headline: 'عرض خاص', price: '99 ر.س', phone: '' });
    await matchGolden('offer-no-phone', r.png);
  });

  it('multi-variant — the story size renders from the same values', async () => {
    const values = { names: 'عبدالله و نورة', photo: { assetId: 'photo' } };
    const [sq, story] = await Promise.all([render(wedding, values), render(weddingStory, values)]);
    expect(sq.png.length).toBeGreaterThan(0);
    await matchGolden('wedding-story', story.png);
  });

  it('HD export doubles the pixel size', async () => {
    const r = await render(wedding, { names: 'محمد و سارة' }, {}, 2);
    const { default: sharp } = await import('sharp');
    const meta = await sharp(r.png).metadata();
    expect([meta.width, meta.height]).toEqual([2160, 2160]);
  });
});

describe('auto-fit (in the browser)', () => {
  async function measure(doc: TemplateDocument, values: FieldValues, layerId: string) {
    const { html } = buildRenderHtml(doc, values, exportOpts);
    const ctx = await browser.newContext({ viewport: { width: doc.canvas.width, height: doc.canvas.height } });
    try {
      await ctx.route('**/*', async (route) => {
        const url = route.request().url();
        if (url === 'https://assets.local/__page') return route.fulfill({ contentType: 'text/html', body: html });
        const a = await loadAsset(decodeURIComponent(url.slice('https://assets.local/'.length)));
        return a ? route.fulfill({ contentType: a.contentType, body: a.body }) : route.abort();
      });
      const page = await ctx.newPage();
      await page.goto('https://assets.local/__page');
      await page.waitForFunction(() => (window as unknown as { __sammly?: { done: boolean } }).__sammly?.done);
      return await page.evaluate((id) => {
        const box = document.querySelector<HTMLElement>(`[data-layer-id="${id}"]`)!;
        const tx = box.firstElementChild as HTMLElement;
        return {
          fontSize: parseFloat(getComputedStyle(tx).fontSize),
          fitsWidth: tx.scrollWidth <= tx.clientWidth + 1,
          fitsHeight: tx.scrollHeight <= box.clientHeight + 1,
          overflowFlag: box.hasAttribute('data-overflow'),
          fontLoaded: document.fonts.check('400 32px "sf-plex-400"'),
          overflow: (window as unknown as { __sammly: { overflow: string[] } }).__sammly.overflow,
        };
      }, layerId);
    } finally {
      await ctx.close();
    }
  }

  it('keeps the designed size when the text fits', async () => {
    const m = await measure(wedding, { names: 'علي و منى' }, 'names');
    expect(m.fontSize).toBe(72);
    expect(m.fontLoaded).toBe(true);
  });

  it('shrinks long single-line text until it fits', async () => {
    const m = await measure(wedding, { names: 'عبدالرحمن بن عبدالعزيز و الجوهرة بنت عبدالله' }, 'names');
    expect(m.fontSize).toBeLessThan(72);
    expect(m.fontSize).toBeGreaterThanOrEqual(30);
    expect(m.fitsWidth).toBe(true);
    expect(m.overflowFlag).toBe(false);
  });

  it('wraps then shrinks paragraph text within maxLines', async () => {
    const m = await measure(friday, { body: 'اللهم في هذه الجمعة المباركة اغفر لنا ولوالدينا وارحمنا واجمعنا بأحبابنا في جنات النعيم يا رب العالمين' }, 'body');
    expect(m.fontSize).toBeLessThanOrEqual(48);
    expect(m.fitsHeight).toBe(true);
  });

  it('reports TEXT_OVERFLOW field keys when the minimum size is not enough', async () => {
    const m = await measure(wedding, { names: 'اسم طويل جداً '.repeat(12) }, 'names');
    expect(m.overflowFlag).toBe(true);
    expect(m.overflow).toEqual(['names']);
  });
});
