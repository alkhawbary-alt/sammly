import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { API_PREFIX, AppError, ErrorCode } from '@sammly/shared';

export interface AppDeps {
  /** Returns true when the database answers. Injected so tests don't need Postgres. */
  checkDb: () => Promise<boolean>;
  /** Registers versioned routes (omitted in unit tests). */
  routes?: (v1: FastifyInstance) => Promise<void>;
}

export function buildApp(deps: AppDeps, opts: { logger?: boolean | object } = {}) {
  const app = Fastify({
    logger: opts.logger ?? false,
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 2 * 1024 * 1024,
    // Signed storage tokens travel as a path parameter.
    routerOptions: { maxParamLength: 2048 },
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, { origin: true, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  app.register(cookie);
  app.register(rateLimit, { global: false });
  app.register(swagger, {
    openapi: { info: { title: 'Sammly API', version: '1.0.0' } },
    transform: jsonSchemaTransform,
  });
  app.register(swaggerUi, { routePrefix: `${API_PREFIX}/docs` });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send(err.toBody());
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({ error: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid request', details: err.validation } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.status(status).send({ error: { code: status === 404 ? ErrorCode.NOT_FOUND : ErrorCode.VALIDATION_ERROR, message: (err as Error).message } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' } });
  });

  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: ErrorCode.NOT_FOUND, message: 'Not found' } }));

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_req, reply) => {
    const db = await deps.checkDb().catch(() => false);
    return reply.status(db ? 200 : 503).send({ status: db ? 'ready' : 'not_ready', checks: { db } });
  });

  app.register(
    async (v1) => {
      v1.get('/', async () => ({ name: 'sammly-api', version: 1 }));
      if (deps.routes) await deps.routes(v1);
    },
    { prefix: API_PREFIX },
  );

  return app;
}

export type App = ReturnType<typeof buildApp>;
