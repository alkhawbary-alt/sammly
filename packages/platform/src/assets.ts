import crypto from 'node:crypto';
import { db, type Asset, type AssetKind } from '@sammly/db';
import { storage } from './storage';

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'font/woff2': 'woff2',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'image/vnd.adobe.photoshop': 'psd',
};

/** Detect the real type from magic bytes — never trust extensions or client MIME. */
export function sniffMime(buf: Buffer): string | null {
  const h = buf.subarray(0, 16);
  if (h.length < 4) return null;
  if (h[0] === 0x89 && h.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image/jpeg';
  if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (h.toString('ascii', 0, 4) === '8BPS') return 'image/vnd.adobe.photoshop';
  if (h.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  if (h.toString('ascii', 0, 4) === 'wOF2') return 'font/woff2';
  if (h.toString('ascii', 0, 4) === 'OTTO') return 'font/otf';
  if (h.readUInt32BE(0) === 0x00010000 || h.toString('ascii', 0, 4) === 'true') return 'font/ttf';
  const head = buf.subarray(0, 512).toString('utf8').trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
}

export interface SaveAssetInput {
  /** Pre-chosen id (e.g. ids the importer already wrote into a document). */
  id?: string;
  body: Buffer;
  mime: string;
  kind: AssetKind;
  width?: number;
  height?: number;
  ownerType?: string;
  ownerId?: string;
}

/** Upload bytes and create the Asset row. Keys: `assets/<kind>/<uuid>.<ext>`. */
export async function saveAsset(input: SaveAssetInput): Promise<Asset> {
  const id = input.id ?? crypto.randomUUID();
  const key = `assets/${input.kind.toLowerCase()}/${id}.${EXT[input.mime] ?? 'bin'}`;
  await storage().put(key, input.body, input.mime);
  return db().asset.create({
    data: {
      id,
      key,
      mime: input.mime,
      bytes: input.body.length,
      width: input.width,
      height: input.height,
      sha256: crypto.createHash('sha256').update(input.body).digest('hex'),
      kind: input.kind,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
    },
  });
}

/** Register an object that a client already uploaded with a presigned PUT. */
export async function registerUploaded(key: string, kind: AssetKind, expectedMime: string[], owner?: { type: string; id: string }): Promise<Asset> {
  const body = await storage().get(key);
  const mime = sniffMime(body);
  if (!mime || !expectedMime.includes(mime)) throw new Error(`Unexpected file type ${mime ?? 'unknown'}`);
  return db().asset.create({
    data: {
      key,
      mime,
      bytes: body.length,
      sha256: crypto.createHash('sha256').update(body).digest('hex'),
      kind,
      ownerType: owner?.type,
      ownerId: owner?.id,
    },
  });
}

export async function assetBody(assetId: string): Promise<{ body: Buffer; mime: string } | null> {
  const a = await db().asset.findUnique({ where: { id: assetId } });
  if (!a) return null;
  return { body: await storage().get(a.key), mime: a.mime };
}

export async function assetUrl(assetId: string, expiresInSec = 3600): Promise<string | null> {
  const a = await db().asset.findUnique({ where: { id: assetId } });
  return a ? storage().presignGet(a.key, { expiresInSec }) : null;
}
