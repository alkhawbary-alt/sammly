import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { DesignDocumentSchema, DesignDocument } from '../types/design.js';
import { generateHtmlCss } from '../generator/htmlGenerator.js';
import { generateFabricJson } from '../generator/fabricGenerator.js';
import { importImage } from '../importers/imageImporter.js';
import { importSvg } from '../importers/svgImporter.js';
import { importPsd } from '../importers/psdImporter.js';
import { renderDesignToPng, renderDesignToPdf, closeBrowser } from '../rendering/playwrightRenderer.js';
import { compareImages } from '../rendering/visualDiff.js';
import { createSamplePsd, createSampleSvg, createSamplePng } from '../utils/sampleGenerator.js';
import { runParserBenchmark } from '../../tests/benchmark_parsers.js';
import { convertWithNodePsdToHtml } from '../importers/nodePsdToHtml.js';
import { exploreWithPsdJs } from '../importers/psdJsExplorer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

const UPLOADS_DIR = path.join(projectRoot, 'data', 'uploads');
const ASSETS_DIR = path.join(projectRoot, 'data', 'assets');
const RENDERS_DIR = path.join(projectRoot, 'data', 'renders');

export async function createServer() {
  // Ensure data directories exist
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  await fs.mkdir(RENDERS_DIR, { recursive: true });

  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'error' : 'info',
    },
    bodyLimit: 100 * 1024 * 1024, // 100MB for large PSDs
    forceCloseConnections: true,
  });

  app.addHook('onClose', async () => {
    await closeBrowser();
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB
    },
  });

  // Serve static assets and renders
  await app.register(fastifyStatic, {
    root: ASSETS_DIR,
    prefix: '/assets/',
    decorateReply: false,
  });

  await app.register(fastifyStatic, {
    root: RENDERS_DIR,
    prefix: '/renders/',
    decorateReply: false,
  });

  let clientDist = path.join(projectRoot, 'dist', 'client');
  try {
    await fs.stat(clientDist);
  } catch {
    clientDist = path.join(projectRoot, 'client', 'dist');
  }

  try {
    const stat = await fs.stat(clientDist);
    if (stat.isDirectory()) {
      await app.register(fastifyStatic, {
        root: clientDist,
        prefix: '/',
        decorateReply: false,
      });
    }
  } catch {}

  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Import endpoint (PSD, PNG, JPG, WEBP, SVG)
  app.post('/api/import', async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const buffer = await data.toBuffer();
    const originalFileName = data.filename || 'uploaded_design';
    const ext = path.extname(originalFileName).toLowerCase().replace('.', '');

    // Save copy to uploads
    const uploadFilePath = path.join(UPLOADS_DIR, `${Date.now()}_${originalFileName}`);
    await fs.writeFile(uploadFilePath, buffer);

    try {
      let design: DesignDocument;
      let report: any;
      let compositeUrl: string | undefined;

      if (ext === 'psd') {
        const result = await importPsd(buffer, originalFileName, ASSETS_DIR);
        design = result.design;
        report = result.report;
        compositeUrl = result.design.meta?.compositeUrl;
      } else if (ext === 'svg') {
        const result = await importSvg(buffer, originalFileName, ASSETS_DIR);
        design = result.design;
        report = result.report;
      } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        const result = await importImage(buffer, originalFileName, ASSETS_DIR);
        design = result.design;
        report = result.report;
      } else {
        return reply.code(400).send({
          error: `Unsupported file format: .${ext}. Supported formats: PSD, PNG, JPG, JPEG, WEBP, SVG`,
        });
      }

      // Generate HTML & CSS
      const generated = generateHtmlCss(design, '');
      const fabricJson = generateFabricJson(design, '');

      return {
        design,
        report,
        compositeUrl,
        html: generated.html,
        css: generated.css,
        fullHtml: generated.fullHtml,
        fabricJson,
      };
    } catch (err: any) {
      req.log.error(err);
      return reply.code(500).send({
        error: `Import failed: ${err.message || 'Unknown parsing error'}`,
        details: err.stack,
      });
    }
  });

  // Convert endpoint (Normalized JSON -> HTML/CSS + Fabric.js JSON)
  app.post('/api/convert', async (req, reply) => {
    const parseResult = DesignDocumentSchema.safeParse((req.body as any)?.design);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Invalid Design Document JSON schema',
        issues: parseResult.error.format(),
      });
    }

    const design = parseResult.data;
    const generated = generateHtmlCss(design, '');
    const fabricJson = generateFabricJson(design, '');

    return {
      design,
      html: generated.html,
      css: generated.css,
      fullHtml: generated.fullHtml,
      fabricJson,
    };
  });

  // Render to PNG
  app.post('/api/render/png', async (req, reply) => {
    const parseResult = DesignDocumentSchema.safeParse((req.body as any)?.design);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Invalid Design Document JSON schema',
        issues: parseResult.error.format(),
      });
    }

    const design = parseResult.data;
    const port = (app.server.address() as any)?.port || 3001;
    const baseUrl = `http://localhost:${port}`;

    try {
      const render = await renderDesignToPng(design, RENDERS_DIR, baseUrl);
      return {
        success: true,
        pngUrl: render.urlPath,
        durationMs: render.durationMs,
        width: render.width,
        height: render.height,
      };
    } catch (err: any) {
      req.log.error(err);
      return reply.code(500).send({ error: `PNG render failed: ${err.message}` });
    }
  });

  // Render to PDF
  app.post('/api/render/pdf', async (req, reply) => {
    const parseResult = DesignDocumentSchema.safeParse((req.body as any)?.design);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Invalid Design Document JSON schema',
        issues: parseResult.error.format(),
      });
    }

    const design = parseResult.data;
    const port = (app.server.address() as any)?.port || 3001;
    const baseUrl = `http://localhost:${port}`;

    try {
      const render = await renderDesignToPdf(design, RENDERS_DIR, baseUrl);
      return {
        success: true,
        pdfUrl: render.urlPath,
        durationMs: render.durationMs,
        width: render.width,
        height: render.height,
      };
    } catch (err: any) {
      req.log.error(err);
      return reply.code(500).send({ error: `PDF render failed: ${err.message}` });
    }
  });

  // Visual comparison endpoint (Original PSD composite vs Rendered PNG)
  app.post('/api/compare', async (req, reply) => {
    const { design, compositeUrl } = req.body as any;
    if (!compositeUrl) {
      return reply.code(400).send({ error: 'No composite image available for this document' });
    }

    const parseResult = DesignDocumentSchema.safeParse(design);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Invalid Design Document JSON' });
    }

    const port = (app.server.address() as any)?.port || 3001;
    const baseUrl = `http://localhost:${port}`;

    // Extract composite local file path
    const compositeFileName = path.basename(compositeUrl);
    const compositeLocalPath = path.join(ASSETS_DIR, compositeFileName);

    try {
      // 1. Render design to PNG
      const render = await renderDesignToPng(parseResult.data, RENDERS_DIR, baseUrl);

      // 2. Perform pixel diff
      const diffResult = await compareImages(compositeLocalPath, render.outputPath, RENDERS_DIR);

      return {
        success: true,
        diff: diffResult,
        renderedPngUrl: render.urlPath,
        compositeUrl,
      };
    } catch (err: any) {
      req.log.error(err);
      return reply.code(500).send({ error: `Comparison failed: ${err.message}` });
    }
  });

  // Quick Sample Generator Endpoint
  app.get('/api/sample/:type', async (req, reply) => {
    const { type } = req.params as { type: string };

    try {
      if (type === 'psd') {
        const samplePath = path.join(UPLOADS_DIR, 'sample_poc.psd');
        const buffer = await createSamplePsd(samplePath);
        const result = await importPsd(buffer, 'sample_poc.psd', ASSETS_DIR);
        const generated = generateHtmlCss(result.design, '');
        const fabricJson = generateFabricJson(result.design, '');
        return {
          design: result.design,
          report: result.report,
          compositeUrl: result.design.meta?.compositeUrl,
          html: generated.html,
          css: generated.css,
          fullHtml: generated.fullHtml,
          fabricJson,
        };
      } else if (type === 'svg') {
        const svgContent = createSampleSvg();
        const result = await importSvg(svgContent, 'sample_vector.svg', ASSETS_DIR);
        const generated = generateHtmlCss(result.design, '');
        const fabricJson = generateFabricJson(result.design, '');
        return {
          design: result.design,
          report: result.report,
          compositeUrl: undefined,
          html: generated.html,
          css: generated.css,
          fullHtml: generated.fullHtml,
          fabricJson,
        };
      } else if (type === 'png') {
        const samplePath = path.join(UPLOADS_DIR, 'sample_banner.png');
        const buffer = await createSamplePng(samplePath);
        const result = await importImage(buffer, 'sample_banner.png', ASSETS_DIR);
        const generated = generateHtmlCss(result.design, '');
        const fabricJson = generateFabricJson(result.design, '');
        return {
          design: result.design,
          report: result.report,
          compositeUrl: undefined,
          html: generated.html,
          css: generated.css,
          fullHtml: generated.fullHtml,
          fabricJson,
        };
      } else {
        return reply.code(400).send({ error: `Unknown sample type: ${type}. Choose 'psd', 'svg', or 'png'.` });
      }
    } catch (err: any) {
      req.log.error(err);
      return reply.code(500).send({ error: `Sample generation failed: ${err.message}` });
    }
  });

  async function processAllEngines(buffer: Buffer, fileName: string) {
    const t0Modern = performance.now();
    const modernResult = await importPsd(buffer, fileName, ASSETS_DIR);
    const modernGen = generateHtmlCss(modernResult.design, '');
    const modernTime = Math.round(performance.now() - t0Modern);

    const t0Fabric = performance.now();
    const fabricJson = generateFabricJson(modernResult.design, '');
    const fabricTime = Math.round(performance.now() - t0Fabric);

    const t0NodePsd = performance.now();
    const nodePsdResult = await convertWithNodePsdToHtml(buffer, ASSETS_DIR, '');
    const nodePsdTime = Math.round(performance.now() - t0NodePsd);

    const t0PsdJs = performance.now();
    const psdJsResult = await exploreWithPsdJs(buffer);
    const psdJsTime = Math.round(performance.now() - t0PsdJs);

    const modernTextLayers = modernResult.design.layers.filter(l => l.type === 'text').length;
    const modernShapeLayers = modernResult.design.layers.filter(l => l.type === 'shape').length;
    const modernRasterLayers = modernResult.design.layers.filter(l => l.type === 'raster').length;

    return {
      fileName,
      modern: {
        engine: 'Modern Pipeline (ag-psd + Normalized JSON)',
        repo: 'ag-psd (v31.0.2)',
        githubUrl: 'https://github.com/Agamures/ag-psd',
        design: modernResult.design,
        html: modernGen.html,
        css: modernGen.css,
        fullHtml: modernGen.fullHtml,
        report: modernResult.report,
        compositeUrl: modernResult.design.meta?.compositeUrl,
        timeMs: modernTime,
        stats: {
          totalLayers: modernResult.report.totalLayers,
          textLayers: modernTextLayers,
          shapeLayers: modernShapeLayers,
          rasterLayers: modernRasterLayers,
        },
      },
      fabric: {
        engine: 'psd2fabric (Fabric.js 5.x Canvas)',
        repo: 'haibingtown/psd2fabric',
        githubUrl: 'https://github.com/haibingtown/psd2fabric',
        fabricJson,
        timeMs: fabricTime,
        stats: {
          totalObjects: fabricJson.objects.length,
          canvasWidth: fabricJson.width,
          canvasHeight: fabricJson.height,
        },
      },
      nodePsdToHtml: {
        engine: 'node-psd-to-html (Direct DOM Background Slicing)',
        repo: 'Clarence-pan/node-psd-to-html',
        githubUrl: 'https://github.com/Clarence-pan/node-psd-to-html',
        fullHtml: nodePsdResult.fullHtml,
        bodyHtml: nodePsdResult.bodyHtml,
        layerCount: nodePsdResult.layerCount,
        textCount: nodePsdResult.textCount,
        imageCount: nodePsdResult.imageCount,
        generatedAssets: nodePsdResult.generatedAssets,
        timeMs: nodePsdTime,
        stats: {
          totalLayers: nodePsdResult.layerCount,
          textLayers: nodePsdResult.textCount,
          imageSlices: nodePsdResult.imageCount,
          shapeLayers: 0,
        },
      },
      psdJs: {
        engine: 'psdjs (AST & Node Tree Explorer)',
        repo: 'jmorvan/psdjs',
        githubUrl: 'https://github.com/jmorvan/psdjs',
        header: psdJsResult.header,
        totalLayers: psdJsResult.totalLayers,
        textLayers: psdJsResult.textLayers,
        imageLayers: psdJsResult.imageLayers,
        groupLayers: psdJsResult.groupLayers,
        tree: psdJsResult.tree,
        rawExport: psdJsResult.rawExport,
        timeMs: psdJsTime,
        stats: {
          totalLayers: psdJsResult.totalLayers,
          textLayers: psdJsResult.textLayers,
          rasterLayers: psdJsResult.imageLayers,
          shapeLayers: 0,
        },
      },
      comparison: {
        metrics: [
          {
            feature: 'Core Parser',
            modern: 'ag-psd (TypeScript)',
            fabric: 'ag-psd ➔ Fabric Generator',
            nodePsd: 'psd.js (CoffeeScript / C++)',
            psdJs: 'psd.js (CoffeeScript)',
          },
          {
            feature: 'Target Representation',
            modern: 'Normalized JSON ➔ HTML/CSS',
            fabric: 'Fabric.js 5.3 Canvas JSON',
            nodePsd: 'Hardcoded Sliced HTML/CSS',
            psdJs: 'JavaScript AST Tree Object',
          },
          {
            feature: 'Parse Duration',
            modern: `${modernTime} ms`,
            fabric: `${fabricTime} ms`,
            nodePsd: `${nodePsdTime} ms`,
            psdJs: `${psdJsTime} ms`,
          },
          {
            feature: 'Text Representation',
            modern: `${modernTextLayers} Editable HTML Text Elements`,
            fabric: `${modernTextLayers} Interactive i-text Canvas Objects`,
            nodePsd: `${nodePsdResult.textCount} Hardcoded DIV tags`,
            psdJs: `${psdJsResult.textLayers} TypeTool string values`,
          },
          {
            feature: 'Shape Representation',
            modern: `${modernShapeLayers} Pure CSS Shapes (Fill/Radius)`,
            fabric: `${modernShapeLayers} Vector Rect/Circle Objects`,
            nodePsd: `${nodePsdResult.imageCount} Sliced PNG Images`,
            psdJs: '0 Shapes (Treated as Generic Bitmaps)',
          },
          {
            feature: 'Editability in Browser',
            modern: '✅ Full live JSON & HTML text editing',
            fabric: '✅ Drag, resize, rotate on HTML5 canvas',
            nodePsd: '❌ Read-only static slices',
            psdJs: '❌ AST Tree only (No UI renderer)',
          },
          {
            feature: 'Export Capabilities',
            modern: '✅ Vector PDF & PNG via Playwright',
            fabric: '⚠️ Canvas toDataURL (Raster only)',
            nodePsd: '⚠️ Static browser HTML only',
            psdJs: '❌ No direct exporter',
          },
        ],
      },
    };
  }

  // Multi-engine GitHub Lab Endpoint: Sample PSD
  app.get('/api/lab/sample', async (req, reply) => {
    try {
      const samplePath = path.join(UPLOADS_DIR, 'sample_banner.psd');
      let buffer: Buffer;
      try {
        buffer = await fs.readFile(samplePath);
      } catch {
        buffer = await createSamplePsd(samplePath);
      }

      const result = await processAllEngines(buffer, 'sample_banner.psd');
      return result;
    } catch (err: any) {
      req.log.error(err);
      return reply.code(500).send({ error: `Lab sample failed: ${err.message}` });
    }
  });

  // Multi-engine GitHub Lab Endpoint: Upload custom PSD
  app.post('/api/lab/upload', async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const buffer = await data.toBuffer();
    const originalFileName = data.filename || 'uploaded_design.psd';
    const ext = path.extname(originalFileName).toLowerCase().replace('.', '');

    if (ext !== 'psd') {
      return reply.code(400).send({ error: 'Only .psd files can be tested across all 4 GitHub engines.' });
    }

    const uploadFilePath = path.join(UPLOADS_DIR, `${Date.now()}_${originalFileName}`);
    await fs.writeFile(uploadFilePath, buffer);

    try {
      const result = await processAllEngines(buffer, originalFileName);
      return result;
    } catch (err: any) {
      req.log.error(err);
      return reply.code(500).send({ error: `Lab processing failed: ${err.message}` });
    }
  });

  // Benchmark comparison endpoint (ag-psd vs psd.js)
  app.get('/api/benchmark', async (req, reply) => {
    try {
      const benchmark = await runParserBenchmark();
      return {
        success: true,
        ...benchmark,
      };
    } catch (err: any) {
      req.log.error(err);
      return reply.code(500).send({ error: `Benchmark failed: ${err.message}` });
    }
  });

  return app;
}

async function start() {
  const server = await createServer();
  const PORT = parseInt(process.env.PORT || '3001', 10);
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 Fastify backend listening on http://localhost:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  start();
}

