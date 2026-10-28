/**
 * Worker process: will host the import, render and ai queues (M2, M4, M6).
 * For now it only exposes /health and /ready for orchestration.
 */
import Fastify from 'fastify';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const health = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

health.get('/health', async () => ({ status: 'ok', role: 'worker' }));
health.get('/ready', async (_req, reply) => {
  const db = await pool
    .query('select 1')
    .then(() => true)
    .catch(() => false);
  return reply.status(db ? 200 : 503).send({ status: db ? 'ready' : 'not_ready', checks: { db } });
});

const port = Number(process.env.WORKER_HEALTH_PORT ?? 4001);
await health.listen({ port, host: '0.0.0.0' });
health.log.info({ concurrency: Number(process.env.RENDER_CONCURRENCY ?? 2) }, 'worker started (no queues yet)');

const close = async () => {
  await health.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
