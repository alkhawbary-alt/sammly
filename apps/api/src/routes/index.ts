import type { FastifyInstance } from 'fastify';
import { guard } from '../auth/guard';
import { adminAssetRoutes } from './admin-assets';
import { adminAuthRoutes } from './admin-auth';
import { adminCategoryRoutes } from './admin-categories';
import { adminDashboardRoutes } from './admin-dashboard';
import { adminFontRoutes } from './admin-fonts';
import { adminImportRoutes } from './admin-imports';
import { adminTemplateRoutes } from './admin-templates';
import { storageRoutes } from './storage';

/** All /api/v1 routes. Everything under /admin requires an admin JWT (RBAC in `guard`). */
export async function v1Routes(v1: FastifyInstance) {
  await v1.register(storageRoutes);
  await v1.register(async (admin) => {
    guard(admin, 'admin');
    await admin.register(adminAuthRoutes);
    await admin.register(adminDashboardRoutes);
    await admin.register(adminImportRoutes);
    await admin.register(adminFontRoutes);
    await admin.register(adminCategoryRoutes);
    await admin.register(adminTemplateRoutes);
    await admin.register(adminAssetRoutes);
  });
}
