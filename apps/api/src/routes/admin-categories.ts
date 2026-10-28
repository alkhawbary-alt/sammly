import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '@sammly/db';
import { AppError, ErrorCode } from '@sammly/shared';
import { LocalizedText } from '@sammly/template-schema';

const CategoryBody = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(60),
  name: LocalizedText,
  parentId: z.uuid().nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function adminCategoryRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/admin/categories', { schema: { tags: ['admin'] } }, async () => {
    const rows = await db().category.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { templates: true } } } });
    return rows.map((c) => ({ id: c.id, parentId: c.parentId, slug: c.slug, name: c.name, icon: c.icon, sortOrder: c.sortOrder, isActive: c.isActive, templateCount: c._count.templates }));
  });

  r.post('/admin/categories', { schema: { tags: ['admin'], body: CategoryBody } }, async (req, reply) => {
    if (await db().category.findUnique({ where: { slug: req.body.slug } })) throw new AppError(ErrorCode.CONFLICT, 'Slug already used', 409);
    const last = await db().category.aggregate({ where: { parentId: req.body.parentId ?? null }, _max: { sortOrder: true } });
    const c = await db().category.create({ data: { ...req.body, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    return reply.status(201).send(c);
  });

  r.patch('/admin/categories/:id', { schema: { tags: ['admin'], params: z.object({ id: z.uuid() }), body: CategoryBody.partial() } }, async (req) => {
    if (req.body.parentId === req.params.id) throw new AppError(ErrorCode.VALIDATION_ERROR, 'A category cannot be its own parent');
    return db().category.update({ where: { id: req.params.id }, data: req.body }).catch(() => {
      throw new AppError(ErrorCode.NOT_FOUND, 'Category not found', 404);
    });
  });

  r.delete('/admin/categories/:id', { schema: { tags: ['admin'], params: z.object({ id: z.uuid() }) } }, async (req, reply) => {
    const c = await db().category.findUnique({ where: { id: req.params.id }, include: { _count: { select: { templates: true, children: true } } } });
    if (!c) throw new AppError(ErrorCode.NOT_FOUND, 'Category not found', 404);
    if (c._count.templates || c._count.children) throw new AppError(ErrorCode.CONFLICT, 'Category still has templates or sub-categories', 409);
    await db().category.delete({ where: { id: c.id } });
    return reply.status(204).send();
  });

  /** Set the order of siblings: ids in the new order. */
  r.post('/admin/categories/reorder', { schema: { tags: ['admin'], body: z.object({ ids: z.array(z.uuid()).min(1) }) } }, async (req) => {
    await db().$transaction(req.body.ids.map((id, i) => db().category.update({ where: { id }, data: { sortOrder: i } })));
    return { ok: true };
  });
}
