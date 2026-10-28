import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config, storage, verifyToken } from '@sammly/platform';
import { AppError, ErrorCode } from '@sammly/shared';

/**
 * Signed-URL endpoints of the local storage driver (dev without MinIO). The token is an
 * HMAC-signed {key, method, expiry, mime, max bytes}; nothing else is reachable.
 * With STORAGE_DRIVER=s3 clients talk to S3/R2 directly and these routes are not used.
 */
export async function storageRoutes(app: FastifyInstance) {
  if (config().STORAGE_DRIVER !== 'local') return;

  app.register(async (scoped) => {
    scoped.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 210 * 1024 * 1024 }, (_req, body, done) => done(null, body));

    scoped.put<{ Params: { token: string } }>('/storage/:token', async (req, reply) => {
      const t = verifyToken(req.params.token);
      if (!t || t.m !== 'PUT') throw new AppError(ErrorCode.FORBIDDEN, 'Invalid or expired upload URL', 403);
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Empty upload');
      if (t.max && body.length > t.max) throw new AppError(ErrorCode.VALIDATION_ERROR, `Upload exceeds ${t.max} bytes`, 413);
      await storage().put(t.k, body, t.mime ?? 'application/octet-stream');
      return reply.status(200).send({ ok: true });
    });

    scoped.get<{ Params: { token: string } }>('/storage/:token', async (req, reply) => {
      const t = verifyToken(req.params.token);
      if (!t || t.m !== 'GET') throw new AppError(ErrorCode.FORBIDDEN, 'Invalid or expired URL', 403);
      const file = path.join(config().STORAGE_LOCAL_DIR, t.k);
      if (!fs.existsSync(file)) throw new AppError(ErrorCode.NOT_FOUND, 'Not found', 404);
      const ext = path.extname(t.k).slice(1);
      const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', woff2: 'font/woff2', pdf: 'application/pdf', svg: 'image/svg+xml', psd: 'image/vnd.adobe.photoshop' };
      reply.header('content-type', types[ext] ?? 'application/octet-stream');
      reply.header('cache-control', 'private, max-age=3600');
      reply.header('access-control-allow-origin', '*');
      if (t.dn) reply.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(t.dn)}`);
      return reply.send(fs.createReadStream(file));
    });
  });
}
