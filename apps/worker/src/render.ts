import { chromium, type Browser } from 'playwright';
import { db } from '@sammly/db';
import { assetBody } from '@sammly/platform';
import { buildRenderHtml, type BrandValues, type ResolvedFont } from '@sammly/renderer-html';
import { renderPage, type RenderPageResult } from '@sammly/renderer-html/qa';
import { usedFontIds, type FieldValues, type TemplateDocument } from '@sammly/template-schema';

let browser: Promise<Browser> | undefined;

/** One shared Chromium; each render gets its own context (closed after use). */
export function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = chromium.launch({ args: ['--disable-dev-shm-usage'] }).then((b) => {
      b.on('disconnected', () => (browser = undefined));
      return b;
    });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  const b = await browser;
  browser = undefined;
  await b?.close();
}

const assetUrl = (id: string) => `https://assets.local/${encodeURIComponent(id)}`;

/** Template Document + values → PNG. Assets and fonts stream from storage through `assets.local`. */
export async function renderDocument(
  doc: TemplateDocument,
  values: FieldValues,
  opts: { brand?: BrandValues; deviceScaleFactor?: number } = {},
): Promise<RenderPageResult> {
  const fontIds = usedFontIds(doc.layers);
  const fonts = new Map(
    (await db().font.findMany({ where: { id: { in: fontIds } } })).map((f): [string, ResolvedFont] => [
      f.id,
      { family: f.family, weight: f.weight, style: f.style === 'italic' ? 'italic' : 'normal', url: assetUrl(f.assetId) },
    ]),
  );
  const { html } = buildRenderHtml(doc, values, { mode: 'export', brand: opts.brand, resolveAsset: assetUrl, resolveFont: (id) => fonts.get(id) });
  return renderPage(await getBrowser(), html, {
    width: doc.canvas.width,
    height: doc.canvas.height,
    deviceScaleFactor: opts.deviceScaleFactor ?? 1,
    loadAsset: async (id) => {
      const a = await assetBody(id);
      return a && { body: a.body, contentType: a.mime };
    },
  });
}
