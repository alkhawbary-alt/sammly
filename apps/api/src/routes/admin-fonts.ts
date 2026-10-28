import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '@sammly/db';
import { assetUrl, createFont, storage } from '@sammly/platform';
import { AppError, ErrorCode } from '@sammly/shared';

const FontBody = z.object({
  family: z.string().min(1).max(100),
  weight: z.number().int().min(100).max(900),
  style: z.enum(['normal', 'italic']).default('normal'),
  aliases: z.array(z.string().min(1).max(120)).max(50).default([]),
  scripts: z.array(z.enum(['arabic', 'latin'])).default(['arabic']),
  license: z.string().max(500).optional(),
});

const view = async (f: { id: string; family: string; weight: number; style: string; aliases: string[]; scripts: string[]; license: string | null; assetId: string; createdAt: Date }) => ({
  id: f.id,
  family: f.family,
  weight: f.weight,
  style: f.style,
  aliases: f.aliases,
  scripts: f.scripts,
  license: f.license,
  url: await assetUrl(f.assetId),
  createdAt: f.createdAt,
});

export async function adminFontRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/admin/fonts', { schema: { tags: ['admin'] } }, async () => {
    const fonts = await db().font.findMany({ where: { deletedAt: null }, orderBy: [{ family: 'asc' }, { weight: 'asc' }] });
    return Promise.all(fonts.map(view));
  });

  /** Create from an uploaded file (presign kind=font first). TTF/OTF are converted to WOFF2. */
  r.post('/admin/fonts', { schema: { tags: ['admin'], body: FontBody.extend({ sourceKey: z.string().regex(/^uploads\/font\/[0-9a-f-]+\.font$/) }) } }, async (req, reply) => {
    if (!(await storage().exists(req.body.sourceKey))) throw new AppError(ErrorCode.NOT_FOUND, 'Uploaded file not found', 404);
    const body = await storage().get(req.body.sourceKey);
    const font = await createFont({ ...req.body, body }).catch((e: Error) => {
      throw new AppError(ErrorCode.VALIDATION_ERROR, e.message);
    });
    await storage().delete(req.body.sourceKey);
    return reply.status(201).send(await view(font));
  });

  r.patch('/admin/fonts/:id', { schema: { tags: ['admin'], params: z.object({ id: z.uuid() }), body: FontBody.partial() } }, async (req) => {
    const font = await db().font.update({ where: { id: req.params.id }, data: req.body }).catch(() => {
      throw new AppError(ErrorCode.NOT_FOUND, 'Font not found', 404);
    });
    return view(font);
  });

  r.delete('/admin/fonts/:id', { schema: { tags: ['admin'], params: z.object({ id: z.uuid() }) } }, async (req, reply) => {
    await db().font.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } }).catch(() => {
      throw new AppError(ErrorCode.NOT_FOUND, 'Font not found', 404);
    });
    return reply.status(204).send();
  });
}
