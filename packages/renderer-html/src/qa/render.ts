/// <reference lib="dom" />
import type { Browser } from 'playwright';

/** Origin every asset/page URL lives on inside the headless browser. Nothing else is reachable. */
export const ASSET_ORIGIN = 'https://assets.local';

export interface LoadedAsset {
  body: Buffer;
  contentType: string;
}

export interface RenderPageOptions {
  width: number;
  height: number;
  /** 1 = standard, 2 = HD, 0.5 = preview. */
  deviceScaleFactor?: number;
  /** Streams an asset by id (from storage in the worker, from disk in tests). */
  loadAsset: (assetId: string) => Promise<LoadedAsset | null>;
  timeoutMs?: number;
}

export interface RenderPageResult {
  png: Buffer;
  /** Field keys whose text still overflowed at the minimum font size. */
  overflow: string[];
  durationMs: number;
}

/**
 * Render a page produced by `buildRenderHtml(..., { mode: 'export' })` to PNG.
 * The page is served from ASSET_ORIGIN so fonts/masks are same-origin; every other
 * request (network, file:, other hosts) is aborted.
 */
export async function renderPage(browser: Browser, html: string, opts: RenderPageOptions): Promise<RenderPageResult> {
  const started = Date.now();
  const timeout = opts.timeoutMs ?? 20_000;
  const context = await browser.newContext({
    viewport: { width: Math.round(opts.width), height: Math.round(opts.height) },
    deviceScaleFactor: opts.deviceScaleFactor ?? 1,
  });
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === `${ASSET_ORIGIN}/__page`) {
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      }
      if (url.startsWith(`${ASSET_ORIGIN}/`)) {
        const id = decodeURIComponent(url.slice(ASSET_ORIGIN.length + 1).split('?')[0]!);
        const asset = await opts.loadAsset(id).catch(() => null);
        if (!asset) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({
          status: 200,
          contentType: asset.contentType,
          body: asset.body,
          headers: { 'access-control-allow-origin': '*' },
        });
      }
      return route.abort('blockedbyclient');
    });

    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    await page.goto(`${ASSET_ORIGIN}/__page`, { waitUntil: 'load' });
    await page.waitForFunction(() => (window as unknown as { __sammly?: { done: boolean } }).__sammly?.done === true);
    await page.evaluate(() =>
      Promise.all(
        Array.from(document.images).map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))),
      ),
    );
    const overflow = await page.evaluate(() => (window as unknown as { __sammly: { overflow: string[] } }).__sammly.overflow);
    const png = await page.locator('#canvas').screenshot({ animations: 'disabled', type: 'png' });
    return { png, overflow: [...new Set(overflow)], durationMs: Date.now() - started };
  } finally {
    await context.close();
  }
}
