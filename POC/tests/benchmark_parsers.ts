import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSamplePsd } from '../src/utils/sampleGenerator.js';
import { importPsd } from '../src/importers/psdImporter.js';
// @ts-ignore
import PSD from 'psd';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../');
const benchmarkDir = path.join(projectRoot, 'data', 'benchmarks');

interface ParserComparison {
  parser: string;
  parseTimeMs: number;
  totalLayers: number;
  textLayers: number;
  shapeLayers: number;
  rasterLayers: number;
  groupLayers: number;
  extractedTexts: string[];
  extractedFonts: string[];
  supportsCanvasExport: boolean;
  notes: string[];
}

export async function runParserBenchmark(): Promise<{
  agPsdResult: ParserComparison;
  psdJsResult: ParserComparison;
}> {
  await fs.mkdir(benchmarkDir, { recursive: true });
  const samplePsdPath = path.join(benchmarkDir, 'benchmark_sample.psd');
  const psdBuffer = await createSamplePsd(samplePsdPath);

  // 1. Benchmark ag-psd (our current pipeline)
  const t0 = performance.now();
  const agPsdImport = await importPsd(psdBuffer, 'benchmark_sample.psd', benchmarkDir);
  const t1 = performance.now();

  const agTextLayers = agPsdImport.design.layers.filter((l) => l.type === 'text');
  const agShapeLayers = agPsdImport.design.layers.filter((l) => l.type === 'shape');
  const agRasterLayers = agPsdImport.design.layers.filter((l) => l.type === 'raster');
  const agGroupLayers = agPsdImport.design.layers.filter((l) => l.type === 'group');

  // Count nested text layers inside groups
  let nestedTextCount = 0;
  const agExtractedTexts: string[] = [];
  const agExtractedFonts: string[] = [];

  for (const l of agPsdImport.design.layers) {
    if (l.type === 'text') {
      agExtractedTexts.push(l.text);
      if (l.style?.fontFamily) agExtractedFonts.push(l.style.fontFamily);
    } else if (l.type === 'group' && l.children) {
      for (const child of l.children) {
        if (child.type === 'text') {
          nestedTextCount++;
          agExtractedTexts.push(child.text);
          if (child.style?.fontFamily) agExtractedFonts.push(child.style.fontFamily);
        }
      }
    }
  }

  const agPsdResult: ParserComparison = {
    parser: 'ag-psd (v31.0.2)',
    parseTimeMs: Math.round(t1 - t0),
    totalLayers: agPsdImport.report.totalLayers,
    textLayers: agTextLayers.length + nestedTextCount,
    shapeLayers: agShapeLayers.length,
    rasterLayers: agRasterLayers.length,
    groupLayers: agGroupLayers.length,
    extractedTexts: agExtractedTexts,
    extractedFonts: Array.from(new Set(agExtractedFonts)),
    supportsCanvasExport: true,
    notes: [
      'Native TypeScript support with active maintenance (2024)',
      'Direct RGBA canvas decoding via @napi-rs/canvas',
      'Solid color canvas detection allows converting shape layers into CSS shapes',
      'Transforms and baseline corrections handled for point text',
      'Exports composite and layer images as PNG buffers cleanly',
    ],
  };

  // 2. Benchmark psd.js / psdjs
  let psdJsResult: ParserComparison;
  try {
    const t2 = performance.now();
    const psdInstance = PSD.fromFile(samplePsdPath);
    psdInstance.parse();
    const t3 = performance.now();

    const tree = psdInstance.tree();
    const descendants = tree.descendants();

    let psdJsTextCount = 0;
    let psdJsGroupCount = 0;
    let psdJsImageCount = 0;
    const psdJsTexts: string[] = [];
    const psdJsFonts: string[] = [];

    for (const node of descendants) {
      if (node.isGroup()) {
        psdJsGroupCount++;
      } else {
        const exported = node.export();
        if (exported && exported.text) {
          psdJsTextCount++;
          psdJsTexts.push(exported.text.value);
          if (exported.text.font && exported.text.font.names) {
            psdJsFonts.push(...exported.text.font.names);
          }
        } else {
          psdJsImageCount++;
        }
      }
    }

    psdJsResult = {
      parser: 'psd.js / psdjs (v3.4.0)',
      parseTimeMs: Math.round(t3 - t2),
      totalLayers: descendants.length,
      textLayers: psdJsTextCount,
      shapeLayers: 0, // psd.js does not distinguish shape layers from raster images
      rasterLayers: psdJsImageCount,
      groupLayers: psdJsGroupCount,
      extractedTexts: psdJsTexts,
      extractedFonts: Array.from(new Set(psdJsFonts)),
      supportsCanvasExport: true,
      notes: [
        'Historical library (written in CoffeeScript, mostly unmaintained since 2017)',
        'Treats all non-text layers as generic image/raster nodes without vector/shape awareness',
        'Text extraction relies on legacy TypeTool Object, missing advanced typography properties',
        'Directly outputs DOM nodes in node-psd-to-html with inline CSS background-image',
      ],
    };
  } catch (err: any) {
    console.error('psd.js error details:', err);
    psdJsResult = {
      parser: 'psd.js / psdjs (v3.4.0)',
      parseTimeMs: -1,
      totalLayers: 0,
      textLayers: 0,
      shapeLayers: 0,
      rasterLayers: 0,
      groupLayers: 0,
      extractedTexts: [],
      extractedFonts: [],
      supportsCanvasExport: false,
      notes: [`Failed to parse PSD: ${err.message || err}`],
    };
  }

  return { agPsdResult, psdJsResult };
}

// Run standalone if executed directly
if (process.argv[1] && process.argv[1].endsWith('benchmark_parsers.ts')) {
  runParserBenchmark().then(({ agPsdResult, psdJsResult }) => {
    console.log('\n================ PARSER BENCHMARK RESULTS ================');
    console.log('\n--- 1. ag-psd ---');
    console.log(`Parse Time: ${agPsdResult.parseTimeMs}ms`);
    console.log(`Total Layers: ${agPsdResult.totalLayers}`);
    console.log(`Text Layers: ${agPsdResult.textLayers}`);
    console.log(`Shape Layers (CSS): ${agPsdResult.shapeLayers}`);
    console.log(`Raster Layers: ${agPsdResult.rasterLayers}`);
    console.log(`Group Layers: ${agPsdResult.groupLayers}`);
    console.log(`Fonts: ${agPsdResult.extractedFonts.join(', ')}`);
    console.log('Sample Extracted Text:', agPsdResult.extractedTexts.slice(0, 3));

    console.log('\n--- 2. psd.js (psdjs / node-psd-to-html) ---');
    console.log(`Parse Time: ${psdJsResult.parseTimeMs}ms`);
    console.log(`Total Layers: ${psdJsResult.totalLayers}`);
    console.log(`Text Layers: ${psdJsResult.textLayers}`);
    console.log(`Shape Layers (CSS): ${psdJsResult.shapeLayers}`);
    console.log(`Raster Layers: ${psdJsResult.rasterLayers}`);
    console.log(`Group Layers: ${psdJsResult.groupLayers}`);
    console.log(`Fonts: ${psdJsResult.extractedFonts.join(', ')}`);
    console.log('Sample Extracted Text:', psdJsResult.extractedTexts.slice(0, 3));
    console.log('==========================================================\n');
  });
}
