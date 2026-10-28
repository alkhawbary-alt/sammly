import pg from 'pg';
import { buildApp } from './app';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

const app = buildApp(
  {
    checkDb: async () => {
      await pool.query('select 1');
      return true;
    },
  },
  { logger: { level: process.env.LOG_LEVEL ?? 'info' } },
);

const port = Number(process.env.API_PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });

const close = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
