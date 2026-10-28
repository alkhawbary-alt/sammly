import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, disconnectDb } from '@sammly/db';
import { storage } from '@sammly/platform';
import { buildApp } from '../src/app';
import { v1Routes } from '../src/routes';
import { adminHeaders } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://sammly:sammly@localhost:5433/sammly';
const dbUp = await db()
  .$queryRaw`select 1`
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbUp)('admin image assets (integration)', () => {
  const app = buildApp({ checkDb: async () => true, routes: v1Routes });
  let headers: Record<string, string>;
  beforeAll(async () => {
    await app.ready();
    headers = await adminHeaders(app);
  });
  afterAll(async () => {
    await app.close();
    await disconnectDb();
  });

  async function upload(body: Buffer) {
    const p = await app.inject({ method: 'POST', url: '/api/v1/admin/uploads/presign', headers, payload: { kind: 'image', mime: 'image/jpeg', bytes: body.length } });
    const { key, url } = p.json();
    await app.inject({ method: 'PUT', url: new URL(url).pathname, payload: body, headers: { 'content-type': 'application/octet-stream' } });
    return key as string;
  }

  it('auto-orients by EXIF and strips metadata', async () => {
    // 200×100 landscape stored with EXIF orientation 6 (rotate 90°) → should come out 100×200.
    const jpeg = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#e11d48' } })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'secret-gps-would-be-here' } } })
      .toBuffer();
    const key = await upload(jpeg);
    const r = await app.inject({ method: 'POST', url: '/api/v1/admin/assets', headers, payload: { sourceKey: key, kind: 'UPLOAD' } });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ width: 100, height: 200, mime: 'image/jpeg' });
    const asset = await db().asset.findUniqueOrThrow({ where: { id: r.json().id } });
    const meta = await sharp(await storage().get(asset.key)).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation ?? 1).toBe(1);
    expect(await storage().exists(key)).toBe(false); // the raw upload is removed
  });

  it('refuses files that are not images', async () => {
    const key = await upload(Buffer.from('%PDF-1.7 not an image'));
    const r = await app.inject({ method: 'POST', url: '/api/v1/admin/assets', headers, payload: { sourceKey: key } });
    expect(r.statusCode).toBe(400);
  });
});
