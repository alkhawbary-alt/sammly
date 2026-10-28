import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, PlanCode, TemplateStatus, TemplateVisibility, type Prisma } from '@sammly/db';
import { assetUrl, enqueue } from '@sammly/platform';
import { AppError, ErrorCode } from '@sammly/shared';
import {
  LocalizedText,
  SCHEMA_VERSION,
  TemplateDocument,
  TemplateDraft,
  migrate,
  resizeDocument,
  variantIdFor,
  variantNameFor,
  type TemplateVariant,
} from '@sammly/template-schema';
import { requireAuth } from '../auth/guard';
import { assetUrlMap, draftFontIds, fieldsHash, fontMap, publishProblems, readDraft } from '../lib/templates';

const Id = z.object({ id: z.uuid() });

const Meta = z.object({
  title: LocalizedText,
  categoryId: z.uuid().nullable(),
  tags: z.array(z.string().max(40)).max(30),
  minPlan: z.enum(PlanCode),
  visibility: z.enum(TemplateVisibility),
  activityTypes: z.array(z.string().max(60)).max(30),
});

async function loadTemplate(id: string) {
  const t = await db().template.findFirst({ where: { id, deletedAt: null } });
  if (!t) throw new AppError(ErrorCode.NOT_FOUND, 'Template not found', 404);
  return t;
}

async function variantFromImport(importId: string, taken: string[]): Promise<TemplateVariant> {
  const imp = await db().importJob.findUnique({ where: { id: importId } });
  if (!imp || imp.status !== 'SUCCEEDED' || !imp.document) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Import is not finished');
  const document = migrate(imp.document);
  const { width, height } = document.canvas;
  return { id: variantIdFor(width, height, taken), name: variantNameFor(width, height), width, height, document };
}

function emptyDocument(width: number, height: number, background: string): TemplateDocument {
  return TemplateDocument.parse({ schemaVersion: SCHEMA_VERSION, canvas: { width, height, background }, layers: [], fields: [], meta: { source: 'manual' } });
}

async function audit(actorId: string, action: string, entityId: string, diff?: Prisma.InputJsonValue) {
  await db().auditLog.create({ data: { actorType: 'admin', actorId, action, entityType: 'Template', entityId, diff } });
}

export async function adminTemplateRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/admin/templates',
    {
      schema: {
        tags: ['templates'],
        querystring: z.object({ status: z.enum(TemplateStatus).optional(), categoryId: z.uuid().optional(), visibility: z.enum(TemplateVisibility).optional(), minPlan: z.enum(PlanCode).optional(), q: z.string().max(100).optional() }),
      },
    },
    async (req) => {
      const { q, ...filters } = req.query;
      const rows = await db().template.findMany({
        where: {
          deletedAt: null,
          ...filters,
          ...(q ? { OR: [{ slug: { contains: q } }, { tags: { has: q } }, { title: { path: ['ar'], string_contains: q } }, { title: { path: ['en'], string_contains: q } }] } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      });
      return Promise.all(
        rows.map(async (t) => {
          const draft = readDraft(t);
          const primary = draft.variants[0]!;
          const thumbId = primary.document.meta.compositeAssetId;
          return {
            id: t.id,
            title: t.title,
            slug: t.slug,
            status: t.status,
            visibility: t.visibility,
            minPlan: t.minPlan,
            categoryId: t.categoryId,
            variants: draft.variants.map((v) => ({ id: v.id, name: v.name, width: v.width, height: v.height })),
            fieldCount: primary.document.fields.length,
            currentVersionId: t.currentVersionId,
            thumbUrl: thumbId ? await assetUrl(thumbId) : null,
            updatedAt: t.updatedAt,
          };
        }),
      );
    },
  );

  /** Create from a finished PSD import, or an empty manual canvas. */
  r.post(
    '/admin/templates',
    {
      schema: {
        tags: ['templates'],
        body: z.object({
          title: LocalizedText,
          categoryId: z.uuid().nullable().optional(),
          fromImportId: z.uuid().optional(),
          manual: z.object({ width: z.number().int().min(100).max(5000), height: z.number().int().min(100).max(5000), background: z.string().default('#ffffff') }).optional(),
        }),
      },
    },
    async (req, reply) => {
      const auth = requireAuth(req);
      const { fromImportId, manual, title, categoryId } = req.body;
      if (!fromImportId === !manual) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Give either fromImportId or manual');
      let variant: TemplateVariant;
      if (fromImportId) variant = await variantFromImport(fromImportId, []);
      else {
        const doc = emptyDocument(manual!.width, manual!.height, manual!.background);
        variant = { id: variantIdFor(manual!.width, manual!.height), name: variantNameFor(manual!.width, manual!.height), width: manual!.width, height: manual!.height, document: doc };
      }
      const draft = TemplateDraft.parse({ variants: [variant] });
      const t = await db().template.create({
        data: { title, categoryId: categoryId ?? null, slug: `t-${nanoid(10).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`, draftData: draft as object, createdBy: auth.sub },
      });
      if (fromImportId) await db().importJob.update({ where: { id: fromImportId }, data: { templateId: t.id } });
      await audit(auth.sub, 'template.create', t.id, { source: fromImportId ? 'psd' : 'manual' });
      return reply.status(201).send({ id: t.id });
    },
  );

  r.get('/admin/templates/:id', { schema: { tags: ['templates'], params: Id } }, async (req) => {
    const t = await loadTemplate(req.params.id);
    const draft = readDraft(t);
    const imports = await db().importJob.findMany({ where: { templateId: t.id }, orderBy: { createdAt: 'desc' } });
    return {
      id: t.id,
      title: t.title,
      slug: t.slug,
      status: t.status,
      visibility: t.visibility,
      minPlan: t.minPlan,
      categoryId: t.categoryId,
      tags: t.tags,
      activityTypes: t.activityTypes,
      currentVersionId: t.currentVersionId,
      revision: t.draftRevision,
      draft,
      assets: await assetUrlMap(draft),
      fonts: await fontMap(draftFontIds(draft)),
      access: (await db().templateAccess.findMany({ where: { templateId: t.id } })).map((a) => a.businessId),
      imports: await Promise.all(
        imports.map(async (i) => ({
          id: i.id,
          fileName: i.fileName,
          status: i.status,
          qaScore: i.qaScore,
          diffUrl: i.qaDiffAssetId ? await assetUrl(i.qaDiffAssetId) : null,
          report: i.report,
          createdAt: i.createdAt,
        })),
      ),
    };
  });

  r.patch('/admin/templates/:id', { schema: { tags: ['templates'], params: Id, body: Meta.partial() } }, async (req) => {
    await loadTemplate(req.params.id);
    const t = await db().template.update({ where: { id: req.params.id }, data: req.body });
    await audit(requireAuth(req).sub, 'template.meta', t.id, req.body as Prisma.InputJsonValue);
    return { ok: true, updatedAt: t.updatedAt };
  });

  /** Save the whole draft. Optimistic lock: `revision` must match; the new revision is returned. */
  r.put('/admin/templates/:id/draft', { schema: { tags: ['templates'], params: Id, body: z.object({ revision: z.number().int(), draft: TemplateDraft }) } }, async (req) => {
    const t = await loadTemplate(req.params.id);
    const updated = await db().template.updateMany({
      where: { id: t.id, draftRevision: req.body.revision },
      data: { draftData: req.body.draft as object, draftRevision: { increment: 1 } },
    });
    if (updated.count === 0) throw new AppError(ErrorCode.CONFLICT, 'The draft was changed elsewhere — reload to continue', 409, { revision: t.draftRevision });
    return { revision: req.body.revision + 1, assets: await assetUrlMap(req.body.draft), fonts: await fontMap(draftFontIds(req.body.draft)) };
  });

  r.post(
    '/admin/templates/:id/variants',
    {
      schema: {
        tags: ['templates'],
        params: Id,
        body: z.object({
          revision: z.number().int(),
          fromImportId: z.uuid().optional(),
          duplicateOf: z.string().optional(),
          width: z.number().int().min(100).max(5000).optional(),
          height: z.number().int().min(100).max(5000).optional(),
          name: z.string().max(60).optional(),
        }),
      },
    },
    async (req) => {
      const t = await loadTemplate(req.params.id);
      if (t.draftRevision !== req.body.revision) throw new AppError(ErrorCode.CONFLICT, 'Reload the draft first', 409);
      const draft = readDraft(t);
      const taken = draft.variants.map((v) => v.id);
      let variant: TemplateVariant;
      if (req.body.fromImportId) {
        variant = await variantFromImport(req.body.fromImportId, taken);
        // Same field keys everywhere: carry definitions over without bindings for the admin to re-bind.
        await db().importJob.update({ where: { id: req.body.fromImportId }, data: { templateId: t.id } });
      } else {
        const src = draft.variants.find((v) => v.id === req.body.duplicateOf);
        if (!src || !req.body.width || !req.body.height) throw new AppError(ErrorCode.VALIDATION_ERROR, 'duplicateOf, width and height are required');
        const document = resizeDocument(src.document, req.body.width, req.body.height);
        variant = { id: variantIdFor(req.body.width, req.body.height, taken), name: req.body.name ?? variantNameFor(req.body.width, req.body.height), width: req.body.width, height: req.body.height, document };
      }
      if (req.body.name) variant.name = req.body.name;
      const next = TemplateDraft.parse({ variants: [...draft.variants, variant] });
      await db().template.update({ where: { id: t.id }, data: { draftData: next as object, draftRevision: { increment: 1 } } });
      return { revision: t.draftRevision + 1, variantId: variant.id, draft: next, assets: await assetUrlMap(next), fonts: await fontMap(draftFontIds(next)) };
    },
  );

  r.post('/admin/templates/:id/validate', { schema: { tags: ['templates'], params: Id } }, async (req) => {
    const t = await loadTemplate(req.params.id);
    const problems = await publishProblems(t, readDraft(t));
    return { ok: problems.length === 0, problems };
  });

  r.post('/admin/templates/:id/publish', { schema: { tags: ['templates'], params: Id } }, async (req) => {
    const auth = requireAuth(req);
    const t = await loadTemplate(req.params.id);
    const draft = readDraft(t);
    const problems = await publishProblems(t, draft);
    if (problems.length) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Fix these problems before publishing', 400, problems);
    const version = await db().$transaction(async (tx) => {
      const last = await tx.templateVersion.aggregate({ where: { templateId: t.id }, _max: { version: true } });
      const v = await tx.templateVersion.create({
        data: { templateId: t.id, version: (last._max.version ?? 0) + 1, variants: draft.variants as object[], fieldsHash: fieldsHash(draft), publishedBy: auth.sub },
      });
      await tx.template.update({ where: { id: t.id }, data: { status: 'PUBLISHED', currentVersionId: v.id } });
      return v;
    });
    await audit(auth.sub, 'template.publish', t.id, { version: version.version });
    return { versionId: version.id, version: version.version };
  });

  r.post('/admin/templates/:id/unpublish', { schema: { tags: ['templates'], params: Id } }, async (req) => {
    const t = await loadTemplate(req.params.id);
    await db().template.update({ where: { id: t.id }, data: { status: 'ARCHIVED' } });
    await audit(requireAuth(req).sub, 'template.archive', t.id);
    return { ok: true };
  });

  r.post('/admin/templates/:id/duplicate', { schema: { tags: ['templates'], params: Id } }, async (req, reply) => {
    const auth = requireAuth(req);
    const t = await loadTemplate(req.params.id);
    const draft = readDraft(t);
    for (const v of draft.variants) v.document.meta = { ...v.document.meta, source: 'duplicate' };
    const title = t.title as { ar: string; en?: string };
    const copy = await db().template.create({
      data: {
        title: { ar: `${title.ar} (نسخة)`, en: title.en ? `${title.en} (copy)` : undefined },
        slug: `t-${nanoid(10).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`,
        categoryId: t.categoryId,
        tags: t.tags,
        minPlan: t.minPlan,
        visibility: t.visibility,
        activityTypes: t.activityTypes,
        draftData: draft as object, // assets are shared by reference
        duplicatedFromId: t.id,
        createdBy: auth.sub,
      },
    });
    await audit(auth.sub, 'template.duplicate', copy.id, { from: t.id });
    return reply.status(201).send({ id: copy.id });
  });

  r.get('/admin/templates/:id/versions', { schema: { tags: ['templates'], params: Id } }, async (req) => {
    await loadTemplate(req.params.id);
    const rows = await db().templateVersion.findMany({ where: { templateId: req.params.id }, orderBy: { version: 'desc' } });
    return rows.map((v) => ({ id: v.id, version: v.version, fieldsHash: v.fieldsHash, publishedAt: v.publishedAt, publishedBy: v.publishedBy, variants: (v.variants as { id: string; name: string }[]).map((x) => ({ id: x.id, name: x.name })) }));
  });

  r.put('/admin/templates/:id/access', { schema: { tags: ['templates'], params: Id, body: z.object({ businessIds: z.array(z.uuid()).max(500) }) } }, async (req) => {
    const t = await loadTemplate(req.params.id);
    await db().$transaction([
      db().templateAccess.deleteMany({ where: { templateId: t.id } }),
      db().templateAccess.createMany({ data: req.body.businessIds.map((businessId) => ({ templateId: t.id, businessId })) }),
    ]);
    return { ok: true };
  });

  /** Render the current draft through the real worker pipeline. */
  r.post(
    '/admin/templates/:id/test-render',
    { schema: { tags: ['templates'], params: Id, body: z.object({ variantId: z.string(), values: z.record(z.string(), z.unknown()).default({}), quality: z.enum(['standard', 'hd']).default('standard') }) } },
    async (req, reply) => {
      const t = await loadTemplate(req.params.id);
      if (!readDraft(t).variants.some((v) => v.id === req.body.variantId)) throw new AppError(ErrorCode.NOT_FOUND, 'Variant not found', 404);
      const job = await enqueue('render:test', { templateId: t.id, ...req.body } as Prisma.InputJsonObject, { maxAttempts: 1 });
      return reply.status(202).send({ jobId: job.id });
    },
  );

  r.delete('/admin/templates/:id', { schema: { tags: ['templates'], params: Id } }, async (req, reply) => {
    const t = await loadTemplate(req.params.id);
    await db().template.update({ where: { id: t.id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
    await audit(requireAuth(req).sub, 'template.delete', t.id);
    return reply.status(204).send();
  });
}
