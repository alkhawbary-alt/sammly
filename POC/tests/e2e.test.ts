import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, Browser } from 'playwright';
import { createServer } from '../src/server/server.js';
import { closeBrowser } from '../src/rendering/playwrightRenderer.js';
import type { FastifyInstance } from 'fastify';

describe('E2E Browser Pipeline Verification', () => {
  let browser: Browser;
  let server: FastifyInstance | null = null;

  before(async () => {
    try {
      const res = await fetch('http://localhost:3001/api/health');
      if (!res.ok) throw new Error('Not running');
    } catch {
      server = await createServer();
      await server.listen({ port: 3001, host: '0.0.0.0' });
    }
  });

  after(async () => {
    if (browser) await browser.close();
    await closeBrowser();
    if (server) {
      (server.server as any).closeAllConnections?.();
      await server.close();
    }
  });

  test('Complete User Journey: Canvas Preview, Text Sidebar Editor, JSON Converter & GitHub Lab', async () => {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });

    // 1. Navigate to Web Application
    await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' });

    // Check title
    const title = await page.textContent('h1');
    assert.ok(title?.includes('Design Conversion POC'), `Title should match, got: ${title}`);

    // 2. Verify Modern Studio & Canvas Preview loads by default
    await page.waitForSelector('iframe[title="Design Canvas Preview"]', { timeout: 10000 });
    assert.ok(await page.locator('iframe[title="Design Canvas Preview"]').isVisible(), 'Canvas preview iframe must be visible');

    // 3. Verify Text Sidebar (Sidebar to edit the text only)
    await page.waitForSelector('.text-sidebar', { timeout: 10000 });
    const textLayerCards = page.locator('.text-layer-card');
    await textLayerCards.first().waitFor({ state: 'visible', timeout: 5000 });
    const cardCount = await textLayerCards.count();
    assert.ok(cardCount > 0, `Should extract text layers, found ${cardCount}`);

    // 4. Edit text in the sidebar live and verify instant canvas update
    const firstTextInput = page.locator('.layer-text-input').first();
    await firstTextInput.fill('Antigravity Live Canvas Text Verified!');

    // Wait for the iframe to reflect the updated text
    const frame = page.frameLocator('iframe[title="Design Canvas Preview"]');
    const updatedHeading = frame.locator('text=Antigravity Live Canvas Text Verified!');
    await updatedHeading.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await updatedHeading.isVisible(), 'Canvas preview must live-update when text is typed in the sidebar');

    // Take screenshot of Text Sidebar & Live Canvas Preview
    await page.screenshot({ path: 'data/renders/e2e_text_sidebar_verified.png' });
    console.log('    [E2E Screenshot saved to data/renders/e2e_text_sidebar_verified.png]');

    // 5. Check Converted JSON Tab
    const jsonTabBtn = page.locator('.tab-btn:has-text("JSON")');
    await jsonTabBtn.click();
    const jsonEditor = page.locator('textarea.code-editor');
    await jsonEditor.waitFor({ state: 'visible', timeout: 5000 });
    const jsonVal = await jsonEditor.inputValue();
    assert.ok(jsonVal.includes('Antigravity Live Canvas Text Verified!'), 'JSON must reflect the sidebar text edits');

    // 6. Test manual JSON edit & Apply JSON button
    const modifiedJson = jsonVal.replace(
      'Antigravity Live Canvas Text Verified!',
      'Antigravity Pipeline Verified Live!'
    );
    await jsonEditor.fill(modifiedJson);
    const applyBtn = page.getByRole('button', { name: /Apply JSON/i }).first();
    await applyBtn.click();

    await page.waitForSelector('text=JSON applied & HTML/CSS regenerated!', { timeout: 5000 });
    const reUpdatedHeading = frame.locator('text=Antigravity Pipeline Verified Live!');
    await reUpdatedHeading.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await reUpdatedHeading.isVisible(), 'Canvas preview must update when JSON is applied');

    // 7. Test Render PNG
    const renderPngBtn = page.getByRole('button', { name: /Render PNG/i });
    await renderPngBtn.click();
    await page.waitForSelector('text=Download PNG', { timeout: 10000 });
    const pngLink = page.getByRole('link', { name: /Download PNG/i });
    assert.ok(await pngLink.isVisible(), 'Download PNG link must appear after rendering');

    // 8. Test Render PDF
    const renderPdfBtn = page.getByRole('button', { name: /Render PDF/i });
    await renderPdfBtn.click();
    await page.waitForSelector('text=Download PDF', { timeout: 10000 });
    const pdfLink = page.getByRole('link', { name: /Download PDF/i });
    assert.ok(await pdfLink.isVisible(), 'Download PDF link must appear after rendering');

    // 9. Test Visual Diff
    const diffBtn = page.getByRole('button', { name: /Visual Diff/i }).first();
    await diffBtn.click();
    await page.waitForSelector('text=Visual diff complete', { timeout: 10000 });
    const mismatchStat = page.locator('.stat-title:has-text("Mismatch Percentage") + .stat-value');
    await mismatchStat.waitFor({ state: 'visible' });
    const mismatchText = await mismatchStat.textContent();
    assert.ok(mismatchText?.includes('%'), 'Visual diff mismatch % must be rendered');
    console.log(`\n    [E2E Verification Success] Visual Diff in UI: ${mismatchText}`);

    // Take screenshot of Studio UI
    await page.screenshot({ path: 'data/renders/e2e_poc_ui_verified.png' });
    console.log('    [E2E Screenshot saved to data/renders/e2e_poc_ui_verified.png]');

    // 10. Switch to GitHub Engines Lab & Arena
    const labModeBtn = page.getByRole('button', { name: /GitHub Engines Lab/i }).first();
    await labModeBtn.click();

    await page.waitForSelector('text=GitHub Projects Lab & Arena', { timeout: 10000 });
    await page.waitForSelector('text=All 4 GitHub engines executed successfully!', { timeout: 10000 });

    // Check all 4 engines are represented on screen
    const modernCard = page.locator('text=Modern Pipeline');
    const fabricCard = page.locator('text=psd2fabric');
    const nodePsdCard = page.locator('text=node-psd-to-html');
    const psdJsCard = page.locator('text=psd.js');

    assert.ok(await modernCard.first().isVisible(), 'Modern Pipeline card must be visible');
    assert.ok(await fabricCard.first().isVisible(), 'psd2fabric card must be visible');
    assert.ok(await nodePsdCard.first().isVisible(), 'node-psd-to-html card must be visible');
    assert.ok(await psdJsCard.first().isVisible(), 'psd.js card must be visible');

    // Test Tab 2: psd2fabric (Fabric.js Interactive Canvas)
    const fabricTabBtn = page.getByRole('button', { name: /psd2fabric/i }).first();
    await fabricTabBtn.click();
    await page.waitForSelector('canvas', { timeout: 5000 });
    assert.ok(await page.locator('.canvas-wrapper-box').isVisible(), 'Fabric canvas must be rendered');

    // Take screenshot of GitHub Lab
    await page.screenshot({ path: 'data/renders/e2e_github_lab_verified.png' });
    console.log('    [E2E Screenshot saved to data/renders/e2e_github_lab_verified.png]');
  });
});
