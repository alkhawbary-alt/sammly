import path from 'node:path';
import fs from 'node:fs/promises';
// @ts-ignore
import PSD from 'psd';

export interface NodePsdToHtmlResult {
  fullHtml: string;
  bodyHtml: string;
  layerCount: number;
  textCount: number;
  imageCount: number;
  generatedAssets: string[];
  executionTimeMs: number;
}

export async function convertWithNodePsdToHtml(
  psdFilePathOrBuffer: string | Buffer,
  outputDir: string,
  assetServerBaseUrl: string = 'http://localhost:3001'
): Promise<NodePsdToHtmlResult> {
  const t0 = performance.now();
  await fs.mkdir(outputDir, { recursive: true });

  let psdInstance: any;
  if (Buffer.isBuffer(psdFilePathOrBuffer)) {
    psdInstance = new PSD(psdFilePathOrBuffer);
  } else {
    psdInstance = PSD.fromFile(psdFilePathOrBuffer);
  }

  if (!psdInstance.parse()) {
    throw new Error('Failed to parse PSD using psd.js (node-psd-to-html engine)');
  }

  const psdRoot = psdInstance.tree();
  const header = psdInstance.header;
  const canvasWidth = header?.width || 800;
  const canvasHeight = header?.height || 600;

  const generatedAssets: string[] = [];
  let zIndex = 10000;
  let textCount = 0;
  let imageCount = 0;
  let layerCount = 0;

  const runId = Math.random().toString(36).substring(2, 9);

  // Recursively process nodes following Clarence-pan/node-psd-to-html algorithm
  async function processNode(node: any, nodeId: string): Promise<string> {
    if (!node.isRoot() && node.layer && !node.layer.visible) {
      return '';
    }

    layerCount++;
    const coords = node.coords || { left: 0, top: 0, right: canvasWidth, bottom: canvasHeight };
    const width = Math.max(0, coords.right - coords.left);
    const height = Math.max(0, coords.bottom - coords.top);
    const left = coords.left;
    const top = coords.top;
    const currentZ = zIndex--;

    const isLink = /\|link$/.test(node.name || '');
    const tagName = isLink ? 'a' : 'div';
    const exported = node.export?.();

    let style = `position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; z-index: ${currentZ}; box-sizing: border-box; overflow: hidden;`;
    let innerContent = '';

    if (node.type === 'layer' && node.layer) {
      if (exported && exported.text) {
        // Text layer handling in node-psd-to-html
        textCount++;
        const textObj = exported.text;
        const textValue = (textObj.value || '').replace(/\r\n/g, '<br/>').replace(/\r/g, '<br/>').replace(/\n/g, '<br/>');
        const textLines = (textObj.value || '').split(/\r\n|\r|\n/).length || 1;
        const lineHeight = Math.round(height / textLines) + 1;

        let fontSize = 16;
        let color = 'rgb(0, 0, 0)';
        let textAlign = 'left';

        if (textObj.font) {
          if (textObj.font.sizes && textObj.font.sizes[0]) {
            fontSize = Math.round(textObj.font.sizes[0]);
          }
          if (textObj.font.colors && textObj.font.colors[0]) {
            const c = textObj.font.colors[0];
            color = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
          }
          if (textObj.font.alignment && textObj.font.alignment[0]) {
            textAlign = textObj.font.alignment[0];
          }
        }

        style += ` font-size: ${fontSize}px; color: ${color}; text-align: ${textAlign}; line-height: ${lineHeight}px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; white-space: pre-wrap; word-break: break-word;`;
        innerContent = textValue;
      } else if (node.layer.image && typeof node.layer.image.saveAsPng === 'function') {
        // Image slice export in node-psd-to-html
        imageCount++;
        const sliceFileName = `node_psd_${runId}_${nodeId}.png`;
        const sliceFilePath = path.join(outputDir, sliceFileName);

        try {
          await node.layer.image.saveAsPng(sliceFilePath);
          generatedAssets.push(sliceFileName);
          style += ` background-image: url('${assetServerBaseUrl}/assets/${sliceFileName}'); background-size: contain; background-repeat: no-repeat; background-position: center;`;
        } catch (err) {
          console.warn(`[node-psd-to-html] Could not save slice ${sliceFileName}:`, err);
        }
      }
    }

    // Process children
    const children = node.children ? node.children() : [];
    let childrenHtml = '';
    for (let i = 0; i < children.length; i++) {
      childrenHtml += await processNode(children[i], `${nodeId}_${i}`);
    }

    return `<${tagName} class="${node.type || 'layer'} node-psd-layer" id="p${nodeId}" data-layer-name="${escapeHtml(node.name || '')}" style="${style}">${innerContent}${childrenHtml}</${tagName}>\n`;
  }

  const rootChildren = psdRoot.children ? psdRoot.children() : [];
  let bodyContent = '';
  for (let i = 0; i < rootChildren.length; i++) {
    bodyContent += await processNode(rootChildren[i], `${i}`);
  }

  const bodyHtml = `
<div id="node-psd-root" style="position: relative; width: ${canvasWidth}px; height: ${canvasHeight}px; background-color: #ffffff; margin: 0 auto; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
${bodyContent}
</div>`;

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Converted via node-psd-to-html</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #181920;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .node-psd-layer {
      user-select: none;
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  const t1 = performance.now();
  return {
    fullHtml,
    bodyHtml,
    layerCount,
    textCount,
    imageCount,
    generatedAssets,
    executionTimeMs: Math.round(t1 - t0),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
