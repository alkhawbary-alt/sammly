/** Dev tool: print the layer tree and features of each PSD in fixtures/psd. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { initializeCanvas, readPsd, type Layer } from 'ag-psd';

initializeCanvas(createCanvas as never, ((w: number, h: number) => new ImageData(w, h)) as never);

const dir = path.resolve(import.meta.dirname, '../../../fixtures/psd');
const only = process.argv[2];

function describe(l: Layer, depth: number): string {
  const pad = '  '.repeat(depth);
  const bits: string[] = [];
  const box = `[${l.left},${l.top} ${(l.right ?? 0) - (l.left ?? 0)}x${(l.bottom ?? 0) - (l.top ?? 0)}]`;
  if (l.children) bits.push(`GROUP(${l.children.length})`);
  if (l.text) {
    const t = l.text;
    const runs = t.styleRuns?.length ?? 0;
    bits.push(
      `TEXT "${(t.text ?? '').replace(/\r|\n/g, '⏎').slice(0, 60)}" font=${t.style?.font?.name} size=${t.style?.fontSize} ` +
        `color=${JSON.stringify(t.style?.fillColor)} just=${t.paragraphStyle?.justification} shape=${t.shapeType} ` +
        `box=${JSON.stringify(t.boxBounds)} tf=${JSON.stringify(t.transform)} runs=${runs} tracking=${t.style?.tracking} leading=${t.style?.leading} autoLead=${t.style?.autoLeading} dir=${t.paragraphStyle && (t.paragraphStyle as Record<string, unknown>).textComposerEngine}`,
    );
    if (runs > 1) bits.push(`runFonts=${[...new Set(t.styleRuns!.map((r) => r.style.font?.name))].join('|')}`);
  }
  if (l.placedLayer) bits.push(`SMART(${l.placedLayer.type})`);
  if (l.adjustment) bits.push(`ADJ(${l.adjustment.type})`);
  if (l.vectorFill) bits.push(`FILL(${l.vectorFill.type})`);
  if (l.vectorMask) bits.push('VMASK');
  if (l.vectorOrigination) bits.push(`ORIG(${l.vectorOrigination.keyDescriptorList?.map((k) => k.keyOriginType).join(',')})`);
  if (l.mask) bits.push(`MASK${l.mask.canvas ? '' : '(no px)'}${l.mask.disabled ? '(disabled)' : ''}`);
  if (l.clipping) bits.push('CLIP');
  if (l.effects && !l.effects.disabled) {
    const fx = Object.entries(l.effects)
      .filter(([k, v]) => k !== 'scale' && k !== 'disabled' && v && (Array.isArray(v) ? v.some((e) => e.enabled) : (v as { enabled?: boolean }).enabled))
      .map(([k]) => k);
    if (fx.length) bits.push(`FX(${fx.join(',')})`);
  }
  if (l.blendMode && l.blendMode !== 'normal' && l.blendMode !== 'pass through') bits.push(`blend=${l.blendMode}`);
  if (l.opacity !== undefined && l.opacity < 1) bits.push(`op=${l.opacity.toFixed(2)}`);
  if (l.fillOpacity !== undefined && l.fillOpacity < 1) bits.push(`fillOp=${l.fillOpacity.toFixed(2)}`);
  if (l.hidden) bits.push('HIDDEN');
  if (l.canvas) bits.push(`px=${l.canvas.width}x${l.canvas.height}`);
  return `${pad}- "${l.name}" ${box} ${bits.join(' ')}`;
}

function walk(layers: Layer[] | undefined, depth: number, out: string[]) {
  for (const l of layers ?? []) {
    out.push(describe(l, depth));
    if (l.children) walk(l.children, depth + 1, out);
  }
}

for (const f of await fs.readdir(dir)) {
  if (!f.toLowerCase().endsWith('.psd') || (only && !f.includes(only))) continue;
  const started = Date.now();
  const buf = await fs.readFile(path.join(dir, f));
  const psd = readPsd(buf, { skipLayerImageData: false, skipThumbnail: true, useImageData: false });
  const out: string[] = [];
  walk(psd.children, 0, out);
  console.log(`\n### ${f}  ${psd.width}x${psd.height}  bits=${psd.bitsPerChannel} mode=${psd.colorMode} composite=${!!psd.canvas} parse=${Date.now() - started}ms`);
  console.log(out.join('\n'));
}
