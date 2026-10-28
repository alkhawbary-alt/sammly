/**
 * Worker process: runs queued jobs (import now; render and ai in M4/M6) and exposes
 * /health and /ready for orchestration.
 */
import Fastify from 'fastify';
import { db, disconnectDb } from '@sammly/db';
import { config, startWorker } from '@sammly/platform';
import { importPsdJob } from './jobs/import-psd';
import { closeBrowser } from './render';

const c = config();
const health = Fastify({ logger: { level: c.LOG_LEVEL } });

health.get('/health', async () => ({ status: 'ok', role: 'worker' }));
health.get('/ready', async (_req, reply) => {
  const ok = await db()
    .$queryRaw`select 1`
    .then(() => true)
    .catch(() => false);
  return reply.status(ok ? 200 : 503).send({ status: ok ? 'ready' : 'not_ready', checks: { db: ok } });
});

await health.listen({ port: c.WORKER_HEALTH_PORT, host: '0.0.0.0' });

const worker = startWorker({
  handlers: {
    'import:psd': { handler: importPsdJob, concurrency: 1 },
  },
  log: (msg, extra) => health.log.info(extra ?? {}, msg),
});
health.log.info({ queue: c.QUEUE_DRIVER, renderConcurrency: c.RENDER_CONCURRENCY }, 'worker started');

const close = async () => {
  await worker.stop();
  await closeBrowser();
  await health.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
