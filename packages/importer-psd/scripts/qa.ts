/**
 * Import every PSD in fixtures/psd, render the draft with its designed text, and pixel-diff
 * it against Photoshop's composite. Writes per-file outputs to test-output/qa/<name>/.
 *   pnpm --filter @sammly/importer-psd qa [filter]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildRenderHtml, type ResolvedFont } from '@sammly/renderer-html';
import { compareImages, renderPage, type LoadedAsset } from '@sammly/renderer-html/qa';
import { importPsd } from '../src';

const root = path.resolve(import.meta.dirname, '../../..');
const psdDir = path.join(root, 'fixtures/psd');
const fontDir = path.join(root, 'fixtures/fonts');
const outRoot = path.join(import.meta.dirname, '..', 'test-output', 'qa');
const filter = process.argv[2];

interface LibFont { id: string; family: string; weight: number; style: 'normal' | 'italic'; file: string; aliases: string[] }
const lib: LibFont[] = JSON.parse(await fs.readFile(path.join(fontDir, 'library.json'), 'utf8')).fonts;
const byAlias = new Map(lib.flatMap((f) => f.aliases.map((a) => [a.toLowerCase(), f] as const)));
const mime = (file: string) => (file.endsWith('.woff2') ? 'font/woff2' : 'font/ttf');

const browser = await chromium.launch();
const rows: string[] = [];
try {
  for (const file of (await fs.readdir(psdDir)).filter((f) => f.toLowerCase().endsWith('.psd'))) {
    if (filter && !file.includes(filter)) continue;
    const name = path.parse(file).name;
    const out = path.join(outRoot, name);
    await fs.mkdir(out, { recursive: true });

    const result = await importPsd(await fs.readFile(path.join(psdDir, file)), {
      fileName: file,
      fontIdFor: (ps) => byAlias.get(ps.toLowerCase())?.id,
    });
    const assets = new Map<string, LoadedAsset>(result.assets.map((a) => [a.id, { body: a.body, contentType: a.mime }]));
    for (const f of lib) assets.set(`font:${f.id}`, { body: await fs.readFile(path.join(fontDir, f.file)), contentType: mime(f.file) });

    const { html } = buildRenderHtml(result.document, {}, {
      mode: 'export',
      resolveAsset: (id) => `https://assets.local/${encodeURIComponent(id)}`,
      resolveFont: (id): ResolvedFont | undefined => {
        const f = lib.find((x) => x.id === id);
        return f && { family: f.family, weight: f.weight, style: f.style, url: `https://assets.local/${encodeURIComponent(`font:${f.id}`)}` };
      },
    });
    const { width, height } = result.document.canvas;
    const render = await renderPage(browser, html, { width, height, loadAsset: async (id) => assets.get(id) ?? null });
    const composite = result.assets.find((a) => a.kind === 'COMPOSITE');

    await fs.writeFile(path.join(out, 'render.png'), render.png);
    await fs.writeFile(path.join(out, 'document.json'), JSON.stringify(result.document, null, 2));
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(result.report, null, 2));
    await fs.writeFile(path.join(out, 'page.html'), html);
    const bg = result.assets.find((a) => a.name === 'Background (merged)');
    if (bg) await fs.writeFile(path.join(out, 'background.png'), bg.body);

    let score = 'n/a';
    if (composite) {
      await fs.writeFile(path.join(out, 'composite.png'), composite.body);
      const diff = await compareImages(composite.body, render.png);
      await fs.writeFile(path.join(out, 'diff.png'), diff.diffPng);
      score = `${diff.matchPercentage.toFixed(2)}%`;
    }
    const r = result.report;
    rows.push(
      `${name.padEnd(22)} ${String(width + 'x' + height).padEnd(10)} match=${score.padEnd(8)} import=${r.durationMs}ms render=${render.durationMs}ms ` +
        `layers=${result.document.layers.length} text=${r.counts.editable} merged=${r.counts.merged} missingFonts=[${r.missingFonts.map((m) => m.psdName).join(', ')}] suggested=[${r.suggestedFields.map((s) => s.key).join(', ')}]`,
    );
    console.log(rows[rows.length - 1]);
    for (const w of r.warnings) console.log(`    ! ${w}`);
  }
} finally {
  await browser.close();
}
console.log('\n' + rows.join('\n'));
