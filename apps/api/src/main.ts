import { db, disconnectDb } from '@sammly/db';
import { config } from '@sammly/platform';
import { buildApp } from './app';
import { v1Routes } from './routes';

const c = config();
const app = buildApp(
  {
    checkDb: async () => {
      await db().$queryRaw`select 1`;
      return true;
    },
    routes: v1Routes,
  },
  { logger: { level: c.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] } },
);

await app.listen({ port: c.API_PORT, host: '0.0.0.0' });

const close = async () => {
  await app.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
