import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { DesignDocumentSchema, DesignDocument } from '../src/types/design.js';
import { generateHtmlCss } from '../src/generator/htmlGenerator.js';
import { importImage } from '../src/importers/imageImporter.js';
import { importSvg } from '../src/importers/svgImporter.js';
import { importPsd } from '../src/importers/psdImporter.js';
import { renderDesignToPng, renderDesignToPdf, closeBrowser } from '../src/rendering/playwrightRenderer.js';
import { compareImages } from '../src/rendering/visualDiff.js';
import { createSamplePsd, createSampleSvg, createSamplePng } from '../src/utils/sampleGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDataDir = path.join(__dirname, 'test-data');
const testAssetsDir = path.join(testDataDir, 'assets');
const testRendersDir = path.join(testDataDir, 'renders');

describe('Design Conversion Pipeline POC Tests', () => {
  before(async () => {
    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testRendersDir, { recursive: true });
  });

  after(async () => {
    await closeBrowser();
    // Clean up test data folder
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. JSON Validation (Zod Schema)', () => {
    // Valid design document
    const validDoc: DesignDocument = {
      id: 'doc-valid-1',
      name: 'Test Document',
      width: 1080,
      height: 1080,
      backgroundColor: '#ffffff',
      layers: [
        {
          id: '1',
          type: 'text',
          name: 'Title Layer',
          x: 100,
          y: 100,
          width: 500,
          height: 100,
          text: 'Hello World',
          style: {
            fontSize: 48,
            fontFamily: 'Arial',
            color: '#000000',
          },
        },
      ],
    };

    const parsed = DesignDocumentSchema.safeParse(validDoc);
    assert.equal(parsed.success, true, 'Valid design should pass schema');

    // Invalid design document (negative width)
    const invalidDoc = {
      ...validDoc,
      width: -500,
    };
    const invalidParsed = DesignDocumentSchema.safeParse(invalidDoc);
    assert.equal(invalidParsed.success, false, 'Negative width should fail validation');
  });

  test('2. HTML and CSS Generation', () => {
    const doc: DesignDocument = {
      id: 'doc-gen-1',
      name: 'HTML Gen Test',
      width: 800,
      height: 600,
      backgroundColor: '#f0f0f0',
      layers: [
        {
          id: 'text-1',
          type: 'text',
          name: 'Heading',
          x: 50,
          y: 60,
          width: 400,
          height: 80,
          text: 'Generated Heading',
          style: {
            fontSize: 32,
            fontFamily: 'Helvetica',
            color: '#111827',
            textAlign: 'left',
          },
        },
        {
          id: 'shape-1',
          type: 'shape',
          name: 'Box Shape',
          x: 50,
          y: 200,
          width: 300,
          height: 150,
          shapeType: 'rectangle',
          fill: '#3b82f6',
          stroke: '#1d4ed8',
          strokeWidth: 2,
          borderRadius: 8,
        },
      ],
    };

    const result = generateHtmlCss(doc, 'http://localhost:3001');

    assert.ok(result.html.includes('id="canvas"'), 'Canvas element must be present');
    assert.ok(result.html.includes('Generated Heading'), 'Text content must be included in HTML');
    assert.ok(result.css.includes('width: 800px;'), 'Canvas width CSS must match');
    assert.ok(result.css.includes('height: 600px;'), 'Canvas height CSS must match');
    assert.ok(result.css.includes('#layer-text-1'), 'Layer CSS selector must exist');
    assert.ok(result.css.includes('font-size: 32px;'), 'Layer style must be generated');
    assert.ok(result.fullHtml.includes('<!DOCTYPE html>'), 'Full HTML must be a complete valid HTML page');
  });

  test('3. Bitmap Image Import (PNG/JPG)', async () => {
    const pngPath = path.join(testDataDir, 'test_input.png');
    const pngBuffer = await createSamplePng(pngPath);

    const result = await importImage(pngBuffer, 'test_input.png', testAssetsDir);

    assert.equal(result.design.width, 800, 'Image width should match 800px');
    assert.equal(result.design.height, 600, 'Image height should match 600px');
    assert.equal(result.design.layers.length, 1, 'Should have exactly 1 image layer');
    assert.equal(result.design.layers[0].type, 'image', 'Layer type should be image');
    assert.equal(result.report.totalLayers, 1);
    assert.equal(result.report.rasterizedLayers, 1);

    const fileExists = await fs.stat(result.assetPath).then(() => true).catch(() => false);
    assert.equal(fileExists, true, 'Asset file should be written to assets directory');
  });

  test('4. Vector SVG Import', async () => {
    const svgContent = createSampleSvg();
    const result = await importSvg(svgContent, 'test_vector.svg', testAssetsDir);

    assert.equal(result.design.width, 800);
    assert.equal(result.design.height, 600);
    assert.equal(result.design.layers.length, 1);
    assert.equal(result.design.layers[0].type, 'svg');
    assert.equal(result.report.editableLayers, 1);

    const fileExists = await fs.stat(result.assetPath).then(() => true).catch(() => false);
    assert.equal(fileExists, true, 'SVG asset file should be written');
  });

  test('5. PSD Parsing, Normalization, and Fallbacks', async () => {
    const psdPath = path.join(testDataDir, 'test_sample.psd');
    const psdBuffer = await createSamplePsd(psdPath);

    const result = await importPsd(psdBuffer, 'test_sample.psd', testAssetsDir);

    assert.equal(result.design.width, 800);
    assert.equal(result.design.height, 600);
    assert.ok(result.design.layers.length >= 6, `Should have extracted multiple layers, got ${result.design.layers.length}`);

    // Check layer types
    const textLayers = result.design.layers.filter((l) => l.type === 'text');
    const shapeLayers = result.design.layers.filter((l) => l.type === 'shape');
    const rasterLayers = result.design.layers.filter((l) => l.type === 'raster');
    const groupLayers = result.design.layers.filter((l) => l.type === 'group');

    assert.ok(textLayers.length > 0, 'Should have editable text layers');
    assert.ok(shapeLayers.length > 0, 'Should have editable shape layers');
    assert.ok(rasterLayers.length > 0, 'Should have raster fallback layer');
    assert.ok(groupLayers.length > 0, 'Should have group layers');

    // Verify report
    assert.ok(result.report.totalLayers >= 7);
    assert.ok(result.report.editableLayers >= 5);
    assert.ok(result.report.rasterizedLayers >= 1);
    assert.ok(result.design.meta?.compositeUrl, 'Composite URL should be present');

    // Verify composite file exists
    if (result.compositePath) {
      const compositeExists = await fs.stat(result.compositePath).then(() => true).catch(() => false);
      assert.equal(compositeExists, true, 'Original PSD composite PNG should exist on disk');
    }
  });

  test('6. Chromium PNG and PDF Rendering via Playwright', async () => {
    const doc: DesignDocument = {
      id: 'doc-render-test',
      name: 'Playwright Test',
      width: 400,
      height: 300,
      backgroundColor: '#f8fafc',
      layers: [
        {
          id: 'txt-1',
          type: 'text',
          name: 'Test Text',
          x: 30,
          y: 40,
          width: 340,
          height: 50,
          text: 'Playwright Test Render',
          style: {
            fontSize: 24,
            fontFamily: 'Arial',
            color: '#2563eb',
          },
        },
      ],
    };

    // Render PNG
    const pngResult = await renderDesignToPng(doc, testRendersDir);
    assert.ok(pngResult.outputPath.endsWith('.png'));
    const pngStat = await fs.stat(pngResult.outputPath);
    assert.ok(pngStat.size > 1000, 'Rendered PNG must have non-zero file size');

    // Render PDF
    const pdfResult = await renderDesignToPdf(doc, testRendersDir);
    assert.ok(pdfResult.outputPath.endsWith('.pdf'));
    const pdfStat = await fs.stat(pdfResult.outputPath);
    assert.ok(pdfStat.size > 1000, 'Rendered PDF must have non-zero file size');
  });

  test('7. Visual Validation / Diff (Composite vs Rendered PNG)', async () => {
    // Generate PSD and import
    const psdPath = path.join(testDataDir, 'test_diff.psd');
    const psdBuffer = await createSamplePsd(psdPath);
    const result = await importPsd(psdBuffer, 'test_diff.psd', testAssetsDir);

    assert.ok(result.compositePath, 'Composite path must exist');

    // Render HTML/CSS to PNG
    const render = await renderDesignToPng(result.design, testRendersDir);

    // Compare original composite with Playwright render
    const diff = await compareImages(result.compositePath!, render.outputPath, testRendersDir);

    assert.equal(diff.originalWidth, 800);
    assert.equal(diff.originalHeight, 600);
    assert.ok(typeof diff.diffPercentage === 'number', 'Diff percentage must be a number');
    assert.ok(diff.diffPercentage >= 0 && diff.diffPercentage <= 100);

    const diffFileExists = await fs.stat(diff.diffImagePath).then(() => true).catch(() => false);
    assert.equal(diffFileExists, true, 'Diff image file should be created');
    console.log(`\n    [Visual Diff Result] Mismatch: ${diff.diffPercentage}% across ${diff.totalPixels} pixels`);
  });

  test('8. Fabric.js JSON Generation (Interoperability)', async () => {
    const { generateFabricJson } = await import('../src/generator/fabricGenerator.js');
    const doc: DesignDocument = {
      id: 'doc-fabric-test',
      name: 'Fabric Interop Test',
      width: 800,
      height: 600,
      backgroundColor: '#1e1e2f',
      layers: [
        {
          id: 'text-1',
          type: 'text',
          name: 'Title Text',
          x: 100,
          y: 150,
          width: 400,
          height: 60,
          text: 'Fabric.js Title',
          style: {
            fontSize: 28,
            fontFamily: 'Arial',
            color: '#ffffff',
            textAlign: 'left',
          },
        },
        {
          id: 'shape-1',
          type: 'shape',
          name: 'Badge Box',
          x: 100,
          y: 230,
          width: 200,
          height: 48,
          shapeType: 'rectangle',
          fill: '#6366f1',
          borderRadius: 8,
        },
      ],
    };

    const fabricDoc = generateFabricJson(doc, 'http://localhost:3001');
    assert.equal(fabricDoc.version, '5.3.0');
    assert.equal(fabricDoc.width, 800);
    assert.equal(fabricDoc.height, 600);
    assert.ok(fabricDoc.objects.length >= 3, 'Must contain workspace rect and 2 layers');

    const textObj = fabricDoc.objects.find((o) => o.type === 'i-text');
    assert.ok(textObj, 'Fabric text object must exist');
    assert.equal(textObj?.text, 'Fabric.js Title');
    assert.equal(textObj?.fontSize, 28);

    const rectObj = fabricDoc.objects.find((o) => o.type === 'rect' && o.id === 'shape-1');
    assert.ok(rectObj, 'Fabric rect object must exist');
    assert.equal(rectObj?.fill, '#6366f1');
  });

  test('9. Parser Benchmark (ag-psd vs psd.js / psdjs)', async () => {
    const { runParserBenchmark } = await import('./benchmark_parsers.js');
    const { agPsdResult, psdJsResult } = await runParserBenchmark();

    assert.equal(agPsdResult.parser, 'ag-psd (v31.0.2)');
    assert.ok(agPsdResult.totalLayers > 0);
    assert.ok(agPsdResult.textLayers > 0);
    assert.ok(agPsdResult.shapeLayers > 0, 'ag-psd must detect editable CSS shape layers');

    assert.ok(psdJsResult.totalLayers > 0, 'psd.js must parse layers');
    assert.equal(psdJsResult.shapeLayers, 0, 'psd.js does not separate shapes from raster images');
  });
});
