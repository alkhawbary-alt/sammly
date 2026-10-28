import { createCanvas, ImageData } from '@napi-rs/canvas';
import { initializeCanvas, writePsd, Psd } from 'ag-psd';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const createImageData = (w: number, h: number) => new ImageData(w, h);
initializeCanvas(createCanvas as any, createImageData as any);

export async function createSamplePsd(outputPath: string): Promise<Buffer> {
  const width = 800;
  const height = 600;

  // Create composite canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1e1e2f';
  ctx.fillRect(0, 0, width, height);

  // Card background
  ctx.fillStyle = '#2d2d44';
  ctx.roundRect?.(50, 50, 700, 500, 20) || ctx.fillRect(50, 50, 700, 500);
  ctx.fill();

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Arial';
  ctx.fillText('Photoshop to HTML/CSS POC', 100, 140);

  // Subtitle
  ctx.fillStyle = '#9d9db5';
  ctx.font = '20px Arial';
  ctx.fillText('Feasibility Test: Text, Shapes, and Raster Fallback', 100, 190);

  // Badge shape
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(100, 230, 220, 48);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px Arial';
  ctx.fillText('HIGH FIDELITY PIPELINE', 115, 260);

  // Layer canvas for a raster illustration / circular gradient
  const rasterCanvas = createCanvas(180, 180);
  const rCtx = rasterCanvas.getContext('2d');
  const gradient = rCtx.createRadialGradient(90, 90, 10, 90, 90, 80);
  gradient.addColorStop(0, '#f43f5e');
  gradient.addColorStop(1, '#8b5cf6');
  rCtx.fillStyle = gradient;
  rCtx.beginPath();
  rCtx.arc(90, 90, 80, 0, Math.PI * 2);
  rCtx.fill();

  // Draw raster onto composite
  ctx.drawImage(rasterCanvas as any, 500, 250);

  // Body text
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '16px Arial';
  ctx.fillText('1. Text layers remain editable HTML text.', 100, 330);
  ctx.fillText('2. Basic shapes convert cleanly to CSS rules.', 100, 370);
  ctx.fillText('3. Complex effects automatically fall back to raster assets.', 100, 410);
  ctx.fillText('4. Generated HTML & CSS export to PNG and PDF via Chromium.', 100, 450);

  // Shape canvases
  const bgCanvas = createCanvas(width, height);
  const bgCtx = bgCanvas.getContext('2d');
  bgCtx.fillStyle = '#1e1e2f';
  bgCtx.fillRect(0, 0, width, height);

  const boxCanvas = createCanvas(700, 500);
  const boxCtx = boxCanvas.getContext('2d');
  boxCtx.fillStyle = '#2d2d44';
  boxCtx.fillRect(0, 0, 700, 500);

  const pillCanvas = createCanvas(220, 48);
  const pillCtx = pillCanvas.getContext('2d');
  pillCtx.fillStyle = '#6366f1';
  pillCtx.fillRect(0, 0, 220, 48);

  const psd: Psd = {
    width,
    height,
    canvas: canvas as any,
    children: [
      {
        name: 'Background Solid',
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        canvas: bgCanvas as any,
        solidColor: { r: 30, g: 30, b: 47 },
      },
      {
        name: 'Main Card Box',
        left: 50,
        top: 50,
        right: 750,
        bottom: 550,
        canvas: boxCanvas as any,
        solidColor: { r: 45, g: 45, b: 68 },
      },
      {
        name: 'Accent Pill Shape',
        left: 100,
        top: 230,
        right: 320,
        bottom: 278,
        canvas: pillCanvas as any,
        solidColor: { r: 99, g: 102, b: 241 },
      },
      {
        name: 'Badge Text',
        left: 115,
        top: 240,
        right: 310,
        bottom: 270,
        text: {
          text: 'HIGH FIDELITY PIPELINE',
          transform: [1, 0, 0, 1, 115, 260],
          style: {
            fontSize: 16,
            font: { name: 'Arial' },
            fillColor: { r: 255, g: 255, b: 255 },
          },
        },
      },
      {
        name: 'Headline',
        left: 100,
        top: 100,
        right: 700,
        bottom: 150,
        text: {
          text: 'Photoshop to HTML/CSS POC',
          transform: [1, 0, 0, 1, 100, 140],
          style: {
            fontSize: 36,
            font: { name: 'Arial' },
            fillColor: { r: 255, g: 255, b: 255 },
          },
        },
      },
      {
        name: 'Subtitle',
        left: 100,
        top: 165,
        right: 650,
        bottom: 200,
        text: {
          text: 'Feasibility Test: Text, Shapes, and Raster Fallback',
          transform: [1, 0, 0, 1, 100, 190],
          style: {
            fontSize: 20,
            font: { name: 'Arial' },
            fillColor: { r: 157, g: 157, b: 181 },
          },
        },
      },
      {
        name: 'Raster Graphic Fallback Layer',
        left: 500,
        top: 250,
        right: 680,
        bottom: 430,
        canvas: rasterCanvas as any,
      },
      {
        name: 'Key Points Group',
        left: 100,
        top: 310,
        right: 650,
        bottom: 480,
        opened: true,
        children: [
          {
            name: 'Point 1 Text',
            left: 100,
            top: 315,
            right: 600,
            bottom: 345,
            text: {
              text: '1. Text layers remain editable HTML text.',
              transform: [1, 0, 0, 1, 100, 330],
              style: {
                fontSize: 16,
                font: { name: 'Arial' },
                fillColor: { r: 226, g: 232, b: 240 },
              },
            },
          },
          {
            name: 'Point 2 Text',
            left: 100,
            top: 355,
            right: 600,
            bottom: 385,
            text: {
              text: '2. Basic shapes convert cleanly to CSS rules.',
              transform: [1, 0, 0, 1, 100, 370],
              style: {
                fontSize: 16,
                font: { name: 'Arial' },
                fillColor: { r: 226, g: 232, b: 240 },
              },
            },
          },
          {
            name: 'Point 3 Text',
            left: 100,
            top: 395,
            right: 600,
            bottom: 425,
            text: {
              text: '3. Complex effects automatically fall back to raster assets.',
              transform: [1, 0, 0, 1, 100, 410],
              style: {
                fontSize: 16,
                font: { name: 'Arial' },
                fillColor: { r: 226, g: 232, b: 240 },
              },
            },
          },
          {
            name: 'Point 4 Text',
            left: 100,
            top: 435,
            right: 600,
            bottom: 465,
            text: {
              text: '4. Generated HTML & CSS export to PNG and PDF via Chromium.',
              transform: [1, 0, 0, 1, 100, 450],
              style: {
                fontSize: 16,
                font: { name: 'Arial' },
                fillColor: { r: 226, g: 232, b: 240 },
              },
            },
          },
        ],
      },
    ],
  };

  const buffer = Buffer.from(writePsd(psd));
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, buffer);
  }
  return buffer;
}

export function createSampleSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>
  </defs>

  <rect width="800" height="600" fill="url(#bgGrad)" rx="16" />
  
  <circle cx="650" cy="150" r="90" fill="#3b82f6" opacity="0.2" />
  <circle cx="150" cy="480" r="120" fill="#06b6d4" opacity="0.15" />

  <g transform="translate(80, 100)">
    <rect width="240" height="40" rx="8" fill="url(#badgeGrad)" />
    <text x="20" y="26" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#ffffff">
      VECTOR SVG IMPORT
    </text>

    <text x="0" y="110" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="#f8fafc">
      Scalable Graphic Design
    </text>

    <text x="0" y="160" font-family="Arial, sans-serif" font-size="20" fill="#94a3b8">
      Preserved as an SVG vector layer with sharp fidelity
    </text>

    <rect x="0" y="210" width="640" height="2" fill="#334155" />

    <text x="0" y="260" font-family="Arial, sans-serif" font-size="18" fill="#e2e8f0">
      • Resolution-independent vector rendering
    </text>
    <text x="0" y="300" font-family="Arial, sans-serif" font-size="18" fill="#e2e8f0">
      • Seamless inclusion in the unified HTML/CSS pipeline
    </text>
    <text x="0" y="340" font-family="Arial, sans-serif" font-size="18" fill="#e2e8f0">
      • Pixel-perfect Chromium headless PNG/PDF generation
    </text>
  </g>
</svg>`;
}

export async function createSamplePng(outputPath: string): Promise<Buffer> {
  const width = 800;
  const height = 600;

  const svgBanner = `<svg width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="#0f766e" />
    <circle cx="700" cy="100" r="160" fill="#14b8a6" opacity="0.3" />
    <rect x="80" y="100" width="640" height="400" rx="16" fill="#115e59" />
    <text x="120" y="200" font-family="Arial" font-size="38" font-weight="bold" fill="#ffffff">Bitmap Image Import Test</text>
    <text x="120" y="260" font-family="Arial" font-size="22" fill="#99f6e4">PNG / JPG / WEBP single-layer normalization</text>
    <text x="120" y="340" font-family="Arial" font-size="18" fill="#ccfbf1">Converts normal bitmap images into a standardized</text>
    <text x="120" y="375" font-family="Arial" font-size="18" fill="#ccfbf1">Design Document with asset reference and fit control.</text>
  </svg>`;

  const buffer = await sharp(Buffer.from(svgBanner)).png().toBuffer();
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, buffer);
  }
  return buffer;
}
