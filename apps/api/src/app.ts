import Fastify, { type FastifyInstance } from 'fastify';
import { API_PREFIX, AppError, ErrorCode } from '@sammly/shared';

export interface AppDeps {
  /** Returns true when the database answers. Injected so tests don't need Postgres. */
  checkDb: () => Promise<boolean>;
}

export function buildApp(deps: AppDeps, opts: { logger?: boolean | object } = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger ?? false,
    genReqId: () => crypto.randomUUID(),
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send(err.toBody());
    }
    req.log.error({ err }, 'unhandled error');
    return reply
      .status(500)
      .send({ error: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' } });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ error: { code: ErrorCode.NOT_FOUND, message: 'Not found' } }),
  );

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (_req, reply) => {
    const db = await deps.checkDb().catch(() => false);
    return reply.status(db ? 200 : 503).send({ status: db ? 'ready' : 'not_ready', checks: { db } });
  });

  app.register(
    async (v1) => {
      v1.get('/', async () => ({ name: 'sammly-api', version: 1 }));
    },
    { prefix: API_PREFIX },
  );

  return app;
}
