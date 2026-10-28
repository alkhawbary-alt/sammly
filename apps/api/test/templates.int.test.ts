import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, disconnectDb } from '@sammly/db';
import type { TemplateDraft } from '@sammly/template-schema';
import { buildApp } from '../src/app';
import { v1Routes } from '../src/routes';
import { adminHeaders } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://sammly:sammly@localhost:5433/sammly';
const dbUp = await db()
  .$queryRaw`select 1`
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbUp)('templates lifecycle (integration)', () => {
  const app = buildApp({ checkDb: async () => true, routes: v1Routes });
  let headers: Record<string, string>;
  let categoryId: string;
  beforeAll(async () => {
    await app.ready();
    headers = await adminHeaders(app);
    categoryId = (await db().category.findFirstOrThrow({ where: { slug: 'wedding' } })).id;
  });
  afterAll(async () => {
    await app.close();
    await disconnectDb();
  });

  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url: `/api/v1/admin${url}`, headers, payload });

  it('create (manual) → edit draft → validate → publish → duplicate → add size', async () => {
    const created = await call('POST', '/templates', { title: { ar: 'اختبار' }, manual: { width: 1080, height: 1080 } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    let t = (await call('GET', `/templates/${id}`)).json();
    expect(t.draft.variants[0]).toMatchObject({ id: 'square', width: 1080 });

    // Nothing to fill in + no category → publish is blocked with clear problems.
    const v1 = (await call('POST', `/templates/${id}/validate`)).json();
    expect(v1.problems.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['CATEGORY_MISSING', 'NO_FIELDS']));
    expect((await call('POST', `/templates/${id}/publish`)).statusCode).toBe(400);

    // Add a text layer + field, set category.
    const draft = t.draft as TemplateDraft;
    const doc = draft.variants[0]!.document;
    doc.layers.push({
      id: 'names', name: 'Names', type: 'text', text: 'محمد و سارة', x: 100, y: 500, width: 880, height: 120, rotation: 0, opacity: 1, visible: true, blendMode: 'normal', locked: false,
      direction: 'rtl', textBox: 'box', verticalAlign: 'middle', fit: { mode: 'shrink', minFontSize: 30 },
      style: { fontFamily: 'sans-serif', fontSize: 64, fontWeight: 700, fontStyle: 'normal', color: '#222222', align: 'center', textDecoration: 'none', fontId: undefined as never },
    } as never);
    doc.fields.push({ key: 'names', label: { ar: 'الأسماء' }, type: 'text', required: true, bindings: [{ layerId: 'names', prop: 'text' }], source: 'user', digits: 'western' });
    // Library font on the text layer so publishing doesn't flag an unmapped font.
    const font = await db().font.findFirstOrThrow({ where: { aliases: { has: 'IBMPlexSansArabic-Bold' } } });
    (doc.layers[0] as { style: { fontId?: string } }).style.fontId = font.id;

    const saved = await call('PUT', `/templates/${id}/draft`, { revision: t.revision, draft });
    expect(saved.statusCode).toBe(200);
    // Same revision again = someone else saved in between.
    expect((await call('PUT', `/templates/${id}/draft`, { revision: t.revision, draft })).statusCode).toBe(409);
    expect((await call('PATCH', `/templates/${id}`, { categoryId })).statusCode).toBe(200);

    expect((await call('POST', `/templates/${id}/validate`)).json()).toEqual({ ok: true, problems: [] });
    const pub = await call('POST', `/templates/${id}/publish`);
    expect(pub.statusCode).toBe(200);
    expect(pub.json().version).toBe(1);

    t = (await call('GET', `/templates/${id}`)).json();
    expect(t.status).toBe('PUBLISHED');
    expect(t.currentVersionId).toBe(pub.json().versionId);

    // Duplicate as new size: scaled + centred, same field keys and bindings.
    const added = await call('POST', `/templates/${id}/variants`, { revision: t.revision, duplicateOf: 'square', width: 1080, height: 1920 });
    expect(added.statusCode).toBe(200);
    const story = (added.json().draft as TemplateDraft).variants.find((v) => v.id === 'story')!;
    expect(story.document.fields.map((f) => f.key)).toEqual(['names']);
    expect(story.document.layers[0]).toMatchObject({ x: 100, y: 920 });

    // The published version is immutable: editing the draft doesn't change it.
    const versions = (await call('GET', `/templates/${id}/versions`)).json();
    expect(versions).toHaveLength(1);
    expect(versions[0].variants).toEqual([{ id: 'square', name: 'Square' }]);

    const dup = await call('POST', `/templates/${id}/duplicate`);
    expect(dup.statusCode).toBe(201);
    const copy = (await call('GET', `/templates/${dup.json().id}`)).json();
    expect(copy).toMatchObject({ status: 'DRAFT', title: { ar: 'اختبار (نسخة)' } });
    expect(copy.draft.variants).toHaveLength(2);

    await call('DELETE', `/templates/${dup.json().id}`);
    await call('DELETE', `/templates/${id}`);
  });
});
