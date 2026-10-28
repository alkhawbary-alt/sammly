import type { FastifyInstance } from 'fastify';
import { db } from '@sammly/db';

export async function adminDashboardRoutes(app: FastifyInstance) {
  app.get('/admin/dashboard/stats', { schema: { tags: ['admin'] } }, async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [templates, published, drafts, businesses, designsToday, imports, fonts, creditsSpent] = await Promise.all([
      db().template.count({ where: { deletedAt: null } }),
      db().template.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
      db().template.count({ where: { deletedAt: null, status: 'DRAFT' } }),
      db().business.count({ where: { deletedAt: null } }),
      db().design.count({ where: { createdAt: { gte: startOfDay } } }),
      db().importJob.count(),
      db().font.count({ where: { deletedAt: null } }),
      db().aiCreditLedger.aggregate({ where: { reason: 'SPEND' }, _sum: { delta: true } }),
    ]);
    return { templates, published, drafts, businesses, designsToday, imports, fonts, creditsUsed: -(creditsSpent._sum.delta ?? 0) };
  });
}
