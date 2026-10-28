import { chromium, Browser, BrowserContext } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DesignDocument } from '../types/design.js';
import { generateHtmlCss } from '../generator/htmlGenerator.js';

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

export interface RenderResult {
  outputPath: string;
  urlPath: string;
  durationMs: number;
  width: number;
  height: number;
}

export async function renderDesignToPng(
  doc: DesignDocument,
  outputDir: string,
  assetServerBaseUrl: string = 'http://localhost:3001'
): Promise<RenderResult> {
  const startTime = Date.now();
  const browser = await getBrowser();

  const context: BrowserContext = await browser.newContext({
    viewport: {
      width: Math.max(1, Math.round(doc.width)),
      height: Math.max(1, Math.round(doc.height)),
    },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  try {
    const { fullHtml } = generateHtmlCss(doc, assetServerBaseUrl);

    // Set content and wait for images to load
    await page.setContent(fullHtml, { waitUntil: 'networkidle' });

    // Wait for any images inside canvas to finish loading
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );
    });

    const canvasElement = await page.$('#canvas');
    const fileName = `render_${doc.id || 'export'}_${Date.now()}.png`;
    const outputPath = path.join(outputDir, fileName);

    if (canvasElement) {
      await canvasElement.screenshot({ path: outputPath, omitBackground: false });
    } else {
      await page.screenshot({ path: outputPath, omitBackground: false });
    }

    const durationMs = Date.now() - startTime;
    return {
      outputPath,
      urlPath: `/renders/${fileName}`,
      durationMs,
      width: doc.width,
      height: doc.height,
    };
  } finally {
    await context.close();
  }
}

export async function renderDesignToPdf(
  doc: DesignDocument,
  outputDir: string,
  assetServerBaseUrl: string = 'http://localhost:3001'
): Promise<RenderResult> {
  const startTime = Date.now();
  const browser = await getBrowser();

  const context: BrowserContext = await browser.newContext({
    viewport: {
      width: Math.max(1, Math.round(doc.width)),
      height: Math.max(1, Math.round(doc.height)),
    },
  });

  const page = await context.newPage();

  try {
    const { fullHtml } = generateHtmlCss(doc, assetServerBaseUrl);

    await page.setContent(fullHtml, { waitUntil: 'networkidle' });

    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );
    });

    const fileName = `render_${doc.id || 'export'}_${Date.now()}.pdf`;
    const outputPath = path.join(outputDir, fileName);

    await page.pdf({
      path: outputPath,
      width: `${doc.width}px`,
      height: `${doc.height}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges: '1',
    });

    const durationMs = Date.now() - startTime;
    return {
      outputPath,
      urlPath: `/renders/${fileName}`,
      durationMs,
      width: doc.width,
      height: doc.height,
    };
  } finally {
    await context.close();
  }
}
