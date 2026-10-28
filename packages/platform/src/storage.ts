import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';

export interface PresignedPut {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

/** Private object storage. Clients only ever see short-lived signed URLs. */
export interface Storage {
  put(key: string, body: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  presignPut(key: string, opts: { mime: string; maxBytes: number; expiresInSec?: number }): Promise<PresignedPut>;
  presignGet(key: string, opts?: { expiresInSec?: number; downloadName?: string }): Promise<string>;
}

const KEY_RE = /^[a-zA-Z0-9/_.-]+$/;
function checkKey(key: string): string {
  if (!KEY_RE.test(key) || key.includes('..') || key.startsWith('/')) throw new Error(`Invalid storage key: ${key}`);
  return key;
}

// ─── Local driver (dev, no Docker) ─────────────────────────────────────

export interface LocalToken {
  k: string;
  m: 'GET' | 'PUT';
  e: number;
  mime?: string;
  max?: number;
  dn?: string;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signToken(t: LocalToken): string {
  const body = b64url(JSON.stringify(t));
  const sig = crypto.createHmac('sha256', config().STORAGE_SIGNING_KEY).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** Returns the token when signature and expiry are valid, else null. */
export function verifyToken(token: string): LocalToken | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', config().STORAGE_SIGNING_KEY).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const t = JSON.parse(Buffer.from(body, 'base64url').toString()) as LocalToken;
  return t.e > Date.now() ? t : null;
}

class LocalStorage implements Storage {
  constructor(private readonly root: string, private readonly publicBase: string) {}
  private file(key: string) {
    return path.join(this.root, checkKey(key));
  }
  async put(key: string, body: Buffer) {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, body);
  }
  async get(key: string) {
    return fs.readFile(this.file(key));
  }
  async exists(key: string) {
    return fs.stat(this.file(key)).then(() => true, () => false);
  }
  async delete(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
  async presignPut(key: string, opts: { mime: string; maxBytes: number; expiresInSec?: number }): Promise<PresignedPut> {
    const e = Date.now() + (opts.expiresInSec ?? 900) * 1000;
    const token = signToken({ k: checkKey(key), m: 'PUT', e, mime: opts.mime, max: opts.maxBytes });
    return { url: `${this.publicBase}/api/v1/storage/${token}`, method: 'PUT', headers: { 'content-type': opts.mime }, expiresAt: new Date(e).toISOString() };
  }
  async presignGet(key: string, opts: { expiresInSec?: number; downloadName?: string } = {}) {
    const token = signToken({ k: checkKey(key), m: 'GET', e: Date.now() + (opts.expiresInSec ?? 3600) * 1000, dn: opts.downloadName });
    return `${this.publicBase}/api/v1/storage/${token}`;
  }
}

// ─── S3 driver (MinIO / Cloudflare R2) ─────────────────────────────────

class S3Storage implements Storage {
  private readonly s3: S3Client;
  constructor(private readonly bucket: string) {
    const c = config();
    this.s3 = new S3Client({
      region: c.S3_REGION,
      endpoint: c.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: c.S3_ACCESS_KEY_ID ? { accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY ?? '' } : undefined,
    });
  }
  async put(key: string, body: Buffer, mime: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: checkKey(key), Body: body, ContentType: mime }));
  }
  async get(key: string) {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: checkKey(key) }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async exists(key: string) {
    return this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: checkKey(key) })).then(() => true, () => false);
  }
  async delete(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: checkKey(key) }));
  }
  async presignPut(key: string, opts: { mime: string; maxBytes: number; expiresInSec?: number }): Promise<PresignedPut> {
    const expiresIn = opts.expiresInSec ?? 900;
    const url = await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: checkKey(key), ContentType: opts.mime }), { expiresIn });
    return { url, method: 'PUT', headers: { 'content-type': opts.mime }, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }
  async presignGet(key: string, opts: { expiresInSec?: number; downloadName?: string } = {}) {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: checkKey(key),
        ResponseContentDisposition: opts.downloadName ? `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}` : undefined,
      }),
      { expiresIn: opts.expiresInSec ?? 3600 },
    );
  }
}

let instance: Storage | undefined;
export function storage(): Storage {
  if (!instance) {
    const c = config();
    instance = c.STORAGE_DRIVER === 's3' ? new S3Storage(c.S3_BUCKET) : new LocalStorage(c.STORAGE_LOCAL_DIR, c.API_PUBLIC_URL);
  }
  return instance;
}
