import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import sharp from 'sharp';
import { z } from 'zod';
import { assetUrl, saveAsset, sniffMime, storage } from '@sammly/platform';
import { AppError, ErrorCode } from '@sammly/shared';

/**
 * Turn an uploaded image into an Asset: sniffed by magic bytes, EXIF auto-oriented,
 * metadata stripped, downscaled to at most 4096px. PNG keeps transparency (backgrounds,
 * foregrounds, masks); JPEG/WebP photos are re-encoded.
 */
export async function ingestImage(key: string, kind: 'LAYER' | 'UPLOAD' | 'BRAND', owner?: { type: string; id: string }) {
  if (!(await storage().exists(key))) throw new AppError(ErrorCode.NOT_FOUND, 'Uploaded file not found', 404);
  const raw = await storage().get(key);
  const mime = sniffMime(raw);
  if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp') throw new AppError(ErrorCode.VALIDATION_ERROR, 'Only PNG, JPEG or WebP images are accepted');
  const img = sharp(raw, { failOn: 'error' }).rotate().resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true });
  const out = mime === 'image/png' ? await img.png().toBuffer({ resolveWithObject: true }) : await img.jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
  const asset = await saveAsset({
    body: out.data,
    mime: mime === 'image/png' ? 'image/png' : 'image/jpeg',
    kind,
    width: out.info.width,
    height: out.info.height,
    ownerType: owner?.type,
    ownerId: owner?.id,
  });
  await storage().delete(key);
  return { id: asset.id, url: (await assetUrl(asset.id))!, width: out.info.width, height: out.info.height, mime: asset.mime };
}

export async function adminAssetRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/admin/assets',
    { schema: { tags: ['admin'], body: z.object({ sourceKey: z.string().regex(/^uploads\/image\/[0-9a-f-]+\.img$/), kind: z.enum(['LAYER', 'UPLOAD']).default('LAYER') }) } },
    async (req, reply) => reply.status(201).send(await ingestImage(req.body.sourceKey, req.body.kind)),
  );

  r.post('/admin/assets/urls', { schema: { tags: ['admin'], body: z.object({ ids: z.array(z.uuid()).max(200) }) } }, async (req) => {
    const out: Record<string, string> = {};
    for (const id of req.body.ids) {
      const url = await assetUrl(id);
      if (url) out[id] = url;
    }
    return out;
  });
}
