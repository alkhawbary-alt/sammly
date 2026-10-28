import { db, disconnectDb } from '@sammly/db';
import { config } from '@sammly/platform';
import { buildApp } from './app';
import { adminFontRoutes } from './routes/admin-fonts';
import { adminImportRoutes } from './routes/admin-imports';
import { storageRoutes } from './routes/storage';

const c = config();
const app = buildApp(
  {
    checkDb: async () => {
      await db().$queryRaw`select 1`;
      return true;
    },
    routes: async (v1) => {
      await v1.register(storageRoutes);
      await v1.register(adminImportRoutes);
      await v1.register(adminFontRoutes);
    },
  },
  { logger: { level: c.LOG_LEVEL } },
);

await app.listen({ port: c.API_PORT, host: '0.0.0.0' });

const close = async () => {
  await app.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
