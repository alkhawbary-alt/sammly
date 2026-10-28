/**
 * Acceptance gate on the owner's real PSDs (brief §6.4): ≥95% pixel match against the
 * Photoshop composite for ≥80% of files. Skipped when fixtures/psd has no PSDs (e.g. CI).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { buildRenderHtml } from '@sammly/renderer-html';
import { compareImages, renderPage, type LoadedAsset } from '@sammly/renderer-html/qa';
import { importPsd } from '../src';

const root = path.resolve(import.meta.dirname, '../../..');
const psdDir = path.join(root, 'fixtures/psd');
const fontDir = path.join(root, 'fixtures/fonts');
const psds = fs.existsSync(psdDir) ? fs.readdirSync(psdDir).filter((f) => f.toLowerCase().endsWith('.psd')) : [];

interface LibFont { id: string; family: string; weight: number; style: 'normal' | 'italic'; file: string; aliases: string[] }

describe.skipIf(psds.length === 0)('real PSD fixtures', () => {
  it('≥95% match on ≥80% of files, Arabic text extracted RTL, missing fonts listed', { timeout: 600_000 }, async () => {
    const lib: LibFont[] = JSON.parse(fs.readFileSync(path.join(fontDir, 'library.json'), 'utf8')).fonts;
    const byAlias = new Map(lib.flatMap((f) => f.aliases.map((a) => [a.toLowerCase(), f] as const)));
    const browser = await chromium.launch();
    const scores: Record<string, number> = {};
    try {
      for (const file of psds) {
        const r = await importPsd(fs.readFileSync(path.join(psdDir, file)), { fileName: file, fontIdFor: (ps) => byAlias.get(ps.toLowerCase())?.id });
        const assets = new Map<string, LoadedAsset>(r.assets.map((a) => [a.id, { body: a.body, contentType: a.mime }]));
        for (const f of lib) assets.set(`font:${f.id}`, { body: fs.readFileSync(path.join(fontDir, f.file)), contentType: f.file.endsWith('.woff2') ? 'font/woff2' : 'font/ttf' });
        const { html } = buildRenderHtml(r.document, {}, {
          mode: 'export',
          resolveAsset: (id) => `https://assets.local/${encodeURIComponent(id)}`,
          resolveFont: (id) => {
            const f = lib.find((x) => x.id === id);
            return f && { family: f.family, weight: f.weight, style: f.style, url: `https://assets.local/${encodeURIComponent(`font:${f.id}`)}` };
          },
        });
        const render = await renderPage(browser, html, { width: r.document.canvas.width, height: r.document.canvas.height, loadAsset: async (id) => assets.get(id) ?? null });
        const composite = r.assets.find((a) => a.kind === 'COMPOSITE')!;
        scores[file] = (await compareImages(composite.body, render.png)).matchPercentage;

        // Arabic text layers come out RTL with readable strings.
        for (const l of r.document.layers.flatMap(function flat(x): typeof r.document.layers {
          return x.type === 'group' ? x.children.flatMap(flat) : [x];
        })) {
          if (l.type === 'text' && /[؀-ۿ]/.test(l.text)) expect(l.direction).toBe('rtl');
        }
        // Every unmapped font is reported.
        const unmapped = new Set(r.report.missingFonts.map((m) => m.psdName));
        for (const ps of unmapped) expect(byAlias.has(ps.toLowerCase())).toBe(false);
      }
    } finally {
      await browser.close();
    }
    console.table(scores);
    const passing = Object.values(scores).filter((s) => s >= 95).length;
    expect(passing / psds.length).toBeGreaterThanOrEqual(0.8);
  });
});
