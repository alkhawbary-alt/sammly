import { describe, expect, it } from 'vitest';
import { TemplateDocument } from '@sammly/template-schema';
import { applyValues, buildRenderHtml, formatDate, toArabicDigits } from '../src';
import { exportOpts, friday, offer, wedding } from './fixtures';

const html = (doc: TemplateDocument, values = {}, opts = exportOpts) => buildRenderHtml(doc, values, opts).html;

describe('buildRenderHtml', () => {
  it('is deterministic', () => {
    expect(html(wedding, { names: 'أحمد و نورة' })).toBe(html(wedding, { names: 'أحمد و نورة' }));
  });

  it('emits RTL text with plaintext bidi and physical alignment from the layer direction', () => {
    const out = html(offer, { headline: 'عرض خاص' });
    const head = out.match(/data-layer-id="headline"[^>]*>/)![0];
    expect(head).toContain('dir="rtl"');
    expect(out).toMatch(/unicode-bidi:plaintext/);
    // align "start" in an RTL layer is pinned to the right edge
    expect(out).toMatch(/data-layer-id="headline"[\s\S]*?text-align:right/);
  });

  it('embeds library fonts with @font-face under a private family name', () => {
    const out = html(wedding);
    expect(out).toContain('@font-face{font-family:"sf-plex-700";src:url("https://assets.local/font%3Aplex-700");font-weight:700');
    expect(out).toContain('font-family:&quot;sf-plex-400&quot;,&quot;IBMPlexSansArabic&quot;,sans-serif');
  });

  it('never applies letter-spacing to Arabic', () => {
    const doc = TemplateDocument.parse({
      ...wedding,
      layers: [
        { id: 'a', name: 'a', type: 'text', text: 'مرحبا', x: 0, y: 0, width: 100, height: 50, direction: 'rtl', style: { fontSize: 20, letterSpacing: 4 } },
        { id: 'b', name: 'b', type: 'text', text: 'Hello', x: 0, y: 0, width: 100, height: 50, direction: 'ltr', style: { fontSize: 20, letterSpacing: 4 } },
      ],
      fields: [],
    });
    const out = html(doc);
    expect(out.match(/letter-spacing/g)).toHaveLength(1);
    expect(out).toMatch(/data-layer-id="b"[\s\S]*letter-spacing:0.2em/);
  });

  it('escapes user text and refuses unsafe colors', () => {
    const out = html(friday, { body: '</div><script>alert(1)</script>', accent: 'red;background:url(x)' });
    expect(out).not.toContain('<script>alert');
    expect(out).toContain('&lt;/div&gt;&lt;script&gt;');
    expect(out).not.toContain('red;background');
  });

  it('uses a strict CSP in export mode and a nonce for the only script', () => {
    const out = html(wedding);
    expect(out).toContain("img-src https://assets.local data:");
    expect(out).toContain('script-src &#39;nonce-sammly-fit&#39;');
    expect(out).toContain('<script nonce="sammly-fit">');
    expect(out.match(/<script/g)).toHaveLength(1);
    expect(html(wedding, {}, { ...exportOpts, mode: 'preview' })).toContain('img-src https: http: data: blob:');
  });

  it('draws image slot values with crop, masks and placeholders', () => {
    const out = html(wedding, { photo: { assetId: 'photo', crop: { x: 0.25, y: 0.75, scale: 1.5 } } });
    expect(out).toContain('object-position:25% 75%;transform:scale(1.5);transform-origin:25% 75%');
    expect(out).toMatch(/data-layer-id="photo"[^>]*border-radius:50%/);
    expect(html(wedding)).toMatch(/data-layer-id="photo"[^>]*background:#e8dcc4/);
    expect(html(friday)).toContain('mask-image:url(&quot;https://assets.local/mask-star&quot;)');
    expect(html(offer)).toContain('clip-path:path(&quot;M260 0 L520 260 L260 520 L0 260 Z&quot;)');
  });

  it('marks fit boxes with their config and bound field keys', () => {
    const out = html(wedding, { names: 'x' });
    expect(out).toMatch(/data-layer-id="names"[^>]*data-fit="\{&quot;mode&quot;:&quot;shrink&quot;,&quot;size&quot;:72,&quot;min&quot;:30\}" data-fields="names"/);
  });
});

describe('applyValues', () => {
  it('fills brand fields, honours user overrides and hides visible-bound layers when empty', () => {
    const brand = { 'brand.phone': '0551234567', 'brand.instagram': '@sammly_shop' };
    const a = applyValues(offer, { headline: 'x' }, brand);
    const byId = (id: string) => [...a.layers].find((l) => l.id === id)!;
    expect(byId('phone')).toMatchObject({ text: '0551234567' });
    expect(byId('handle')).toMatchObject({ text: '@sammly_shop' });
    expect(byId('phone-badge').visible).toBe(true);

    const b = applyValues(offer, { headline: 'x', phone: '' }, brand);
    expect(b.layers.find((l) => l.id === 'phone-badge')!.visible).toBe(false);
    expect(b.layers.find((l) => l.id === 'phone')).toMatchObject({ text: '' });
  });

  it('locks brand values when the template says so', () => {
    const locked = TemplateDocument.parse({ ...offer, rules: { ...offer.rules, lockBrandFields: true } });
    const a = applyValues(locked, { headline: 'x', phone: '0000000' }, { 'brand.phone': '0551234567' });
    expect(a.layers.find((l) => l.id === 'phone')).toMatchObject({ text: '0551234567' });
  });

  it('keeps designed content when no value is given and never mutates the document', () => {
    const before = JSON.stringify(wedding);
    const a = applyValues(wedding, { names: 'أحمد' });
    expect(a.layers.find((l) => l.id === 'title')).toMatchObject({ text: 'ألف ألف مبروك' });
    expect(JSON.stringify(wedding)).toBe(before);
  });
});

describe('formatting', () => {
  it('converts digits and formats hijri/gregorian dates', () => {
    expect(toArabicDigits('خصم 50%')).toBe('خصم ٥٠%');
    expect(formatDate('2026-11-20', 'gregorian', 'western')).toMatch(/20.*2026/);
    expect(formatDate('2026-11-20', 'hijri', 'arabic')).toMatch(/[٠-٩]+.*١٤٤٨/);
    expect(formatDate('2026-11-20', 'both', 'western')).toContain('—');
  });
});
