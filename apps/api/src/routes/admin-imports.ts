import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '@sammly/db';
import { assetUrl, enqueue, registerUploaded, storage } from '@sammly/platform';
import { AppError, ErrorCode } from '@sammly/shared';
import { walkLayers, type TemplateDocument } from '@sammly/template-schema';

const UPLOAD_KINDS = {
  psd: { maxBytes: 200 * 1024 * 1024, mimes: ['image/vnd.adobe.photoshop', 'application/octet-stream', 'image/x-photoshop'], ext: 'psd' },
  font: { maxBytes: 10 * 1024 * 1024, mimes: ['font/ttf', 'font/otf', 'font/woff2', 'application/octet-stream', 'application/x-font-ttf'], ext: 'font' },
  image: { maxBytes: 20 * 1024 * 1024, mimes: ['image/png', 'image/jpeg', 'image/webp'], ext: 'img' },
} as const;

/** QA below this score shows a warning badge in the admin. */
const QA_THRESHOLD = 95;

export async function adminImportRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/admin/uploads/presign',
    {
      schema: {
        tags: ['admin'],
        body: z.object({ kind: z.enum(['psd', 'font', 'image']), mime: z.string(), bytes: z.number().int().positive(), fileName: z.string().max(255).optional() }),
      },
    },
    async (req) => {
      const k = UPLOAD_KINDS[req.body.kind];
      if (req.body.bytes > k.maxBytes) throw new AppError(ErrorCode.VALIDATION_ERROR, `File too large (max ${k.maxBytes / 1024 / 1024} MB)`, 413);
      const mime = (k.mimes as readonly string[]).includes(req.body.mime) ? req.body.mime : 'application/octet-stream';
      const key = `uploads/${req.body.kind}/${crypto.randomUUID()}.${k.ext}`;
      const put = await storage().presignPut(key, { mime, maxBytes: k.maxBytes });
      return { key, ...put };
    },
  );

  r.post(
    '/admin/imports',
    {
      schema: {
        tags: ['admin'],
        body: z.object({ sourceKey: z.string().regex(/^uploads\/psd\/[0-9a-f-]+\.psd$/), fileName: z.string().min(1).max(255), templateId: z.uuid().optional() }),
      },
    },
    async (req, reply) => {
      if (!(await storage().exists(req.body.sourceKey))) throw new AppError(ErrorCode.NOT_FOUND, 'Uploaded file not found', 404);
      const source = await registerUploaded(req.body.sourceKey, 'PSD', ['image/vnd.adobe.photoshop']).catch((e: Error) => {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `Not a PSD file: ${e.message}`);
      });
      const imp = await db().importJob.create({ data: { sourceAssetId: source.id, fileName: req.body.fileName, templateId: req.body.templateId } });
      await db().asset.update({ where: { id: source.id }, data: { ownerType: 'ImportJob', ownerId: imp.id } });
      const job = await enqueue('import:psd', { importId: imp.id });
      await db().importJob.update({ where: { id: imp.id }, data: { jobId: job.id } });
      return reply.status(202).send({ importId: imp.id, jobId: job.id });
    },
  );

  r.get('/admin/imports', { schema: { tags: ['admin'] } }, async () => {
    const rows = await db().importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((i) => ({ id: i.id, fileName: i.fileName, status: i.status, qaScore: i.qaScore, error: i.error, createdAt: i.createdAt }));
  });

  r.get('/admin/imports/:id', { schema: { tags: ['admin'], params: z.object({ id: z.uuid() }) } }, async (req) => {
    const imp = await db().importJob.findUnique({ where: { id: req.params.id } });
    if (!imp) throw new AppError(ErrorCode.NOT_FOUND, 'Import not found', 404);
    const doc = imp.document as TemplateDocument | null;
    // Short-lived URLs for every asset the draft references (preview in the admin).
    const ids = new Set<string>();
    if (doc) {
      for (const l of walkLayers(doc.layers)) {
        if ('assetId' in l && l.assetId) ids.add(l.assetId);
        if (l.type === 'imageSlot' && l.placeholderAssetId) ids.add(l.placeholderAssetId);
      }
      if (doc.meta.compositeAssetId) ids.add(doc.meta.compositeAssetId);
    }
    const assets: Record<string, string> = {};
    for (const id of ids) {
      const url = await assetUrl(id);
      if (url) assets[id] = url;
    }
    return {
      id: imp.id,
      status: imp.status,
      fileName: imp.fileName,
      error: imp.error,
      qa: imp.qaScore === null ? null : { score: imp.qaScore, warning: imp.qaScore < QA_THRESHOLD, threshold: QA_THRESHOLD, diffUrl: imp.qaDiffAssetId ? await assetUrl(imp.qaDiffAssetId) : null, renderUrl: imp.qaRenderAssetId ? await assetUrl(imp.qaRenderAssetId) : null },
      report: imp.report,
      document: imp.document,
      assets,
      createdAt: imp.createdAt,
    };
  });

  r.get('/admin/jobs/:id', { schema: { tags: ['admin'], params: z.object({ id: z.uuid() }) } }, async (req) => {
    const job = await db().job.findUnique({ where: { id: req.params.id } });
    if (!job) throw new AppError(ErrorCode.NOT_FOUND, 'Job not found', 404);
    const result = job.result as { assetId?: string } | null;
    const url = result?.assetId ? await assetUrl(result.assetId) : null;
    return { id: job.id, type: job.type, status: job.status, attempts: job.attempts, result: job.result, url, error: job.error, durationMs: job.durationMs, createdAt: job.createdAt };
  });
}
