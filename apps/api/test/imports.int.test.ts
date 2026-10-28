/**
 * Integration tests against the dev database + local storage. Skipped when Postgres is not
 * reachable (run `pnpm infra` first). The worker is not needed: we only check what the API does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, disconnectDb } from '@sammly/db';
import { buildApp } from '../src/app';
import { adminFontRoutes } from '../src/routes/admin-fonts';
import { adminImportRoutes } from '../src/routes/admin-imports';
import { storageRoutes } from '../src/routes/storage';

process.env.DATABASE_URL ??= 'postgresql://sammly:sammly@localhost:5433/sammly';
const dbUp = await db()
  .$queryRaw`select 1`
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbUp)('admin imports & fonts (integration)', () => {
  const app = buildApp({
    checkDb: async () => true,
    routes: async (v1) => {
      await v1.register(storageRoutes);
      await v1.register(adminImportRoutes);
      await v1.register(adminFontRoutes);
    },
  });
  beforeAll(() => app.ready());
  afterAll(async () => {
    await app.close();
    await disconnectDb();
  });

  async function upload(kind: 'psd' | 'font', body: Buffer) {
    const p = await app.inject({ method: 'POST', url: '/api/v1/admin/uploads/presign', payload: { kind, mime: 'application/octet-stream', bytes: body.length } });
    expect(p.statusCode).toBe(200);
    const { key, url } = p.json();
    const path = new URL(url).pathname;
    const put = await app.inject({ method: 'PUT', url: path, payload: body, headers: { 'content-type': 'application/octet-stream' } });
    expect(put.statusCode).toBe(200);
    return { key, path };
  }

  it('rejects oversized presign requests', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/admin/uploads/presign', payload: { kind: 'psd', mime: 'image/vnd.adobe.photoshop', bytes: 300 * 1024 * 1024 } });
    expect(r.statusCode).toBe(413);
  });

  it('rejects tampered or wrong-method storage tokens', async () => {
    const { path } = await upload('psd', Buffer.from('8BPS fake'));
    const tampered = path.slice(0, -3) + 'abc';
    expect((await app.inject({ method: 'PUT', url: tampered, payload: Buffer.from('x'), headers: { 'content-type': 'application/octet-stream' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(403); // a PUT token can't read
  });

  it('refuses a non-PSD file by magic bytes, whatever its name', async () => {
    const { key } = await upload('psd', Buffer.from('<html>not a psd</html>'));
    const r = await app.inject({ method: 'POST', url: '/api/v1/admin/imports', payload: { sourceKey: key, fileName: 'evil.psd' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('validates import keys and ids', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/admin/imports', payload: { sourceKey: '../../etc/passwd', fileName: 'x.psd' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/imports/not-a-uuid' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/imports/00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
  });

  it('queues a PSD import (202) with an ImportJob and a Job row', async () => {
    const psd = Buffer.concat([Buffer.from('8BPS'), Buffer.alloc(64)]);
    const { key } = await upload('psd', psd);
    const r = await app.inject({ method: 'POST', url: '/api/v1/admin/imports', payload: { sourceKey: key, fileName: 'test.psd' } });
    expect(r.statusCode).toBe(202);
    const { importId, jobId } = r.json();
    const job = await db().job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({ type: 'import:psd', payload: { importId } });
    // Don't let a running dev worker chew on the fake file.
    await db().job.update({ where: { id: jobId }, data: { status: 'FAILED', error: 'test' } });
    await db().importJob.update({ where: { id: importId }, data: { status: 'FAILED', error: 'test' } });
  });

  it('lists the seeded font library with aliases and signed URLs', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/admin/fonts' });
    expect(r.statusCode).toBe(200);
    const fonts = r.json() as { family: string; aliases: string[]; url: string }[];
    if (fonts.length) {
      expect(fonts.some((f) => f.aliases.includes('IBMPlexSansArabic-Bold'))).toBe(true);
      expect(fonts[0]!.url).toMatch(/\/api\/v1\/storage\//);
    }
  });

  it('rejects a font upload that is not a font', async () => {
    const { key } = await upload('font', Buffer.from('definitely not a font file'));
    const r = await app.inject({ method: 'POST', url: '/api/v1/admin/fonts', payload: { sourceKey: key, family: 'X', weight: 400 } });
    expect(r.statusCode).toBe(400);
  });
});
