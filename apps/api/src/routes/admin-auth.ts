import argon2 from 'argon2';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '@sammly/db';
import { config } from '@sammly/platform';
import { AppError, ErrorCode } from '@sammly/shared';
import { requireAuth } from '../auth/guard';
import { issueRefresh, REFRESH_TTL_DAYS, revokeRefresh, rotateRefresh, signAccess } from '../auth/tokens';

export const ADMIN_REFRESH_COOKIE = 'sammly_admin_rt';
const COOKIE_PATH = '/api/v1/admin/auth';

// Same work factor on unknown emails so response time doesn't reveal which emails exist.
const DUMMY_HASH = await argon2.hash('not-a-real-password');

function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie(ADMIN_REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config().NODE_ENV === 'production',
    path: COOKIE_PATH,
    maxAge: REFRESH_TTL_DAYS * 86_400,
  });
}

const me = (u: { id: string; email: string; name: string; role: string }) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

export async function adminAuthRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const limited = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  r.post(
    '/admin/auth/login',
    { config: { public: true, ...limited }, schema: { tags: ['auth'], body: z.object({ email: z.email(), password: z.string().min(1).max(200) }) } },
    async (req, reply) => {
      const user = await db().adminUser.findUnique({ where: { email: req.body.email.toLowerCase() } });
      const ok = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, req.body.password).catch(() => false);
      if (!user || !ok || !user.isActive) throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid email or password', 401);
      const access = await signAccess({ sub: user.id, typ: 'admin', role: user.role });
      const refresh = await issueRefresh('admin', user.id);
      setRefreshCookie(reply, refresh.token);
      await db().auditLog.create({ data: { actorType: 'admin', actorId: user.id, action: 'auth.login', entityType: 'AdminUser', entityId: user.id } });
      return { accessToken: access.token, expiresIn: access.expiresIn, user: me(user) };
    },
  );

  r.post('/admin/auth/refresh', { config: { public: true, ...limited }, schema: { tags: ['auth'] } }, async (req, reply) => {
    const token = req.cookies[ADMIN_REFRESH_COOKIE];
    const rotated = token ? await rotateRefresh(token, 'admin') : null;
    const user = rotated && (await db().adminUser.findUnique({ where: { id: rotated.subjectId } }));
    if (!rotated || !user || !user.isActive) {
      reply.clearCookie(ADMIN_REFRESH_COOKIE, { path: COOKIE_PATH });
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Session expired', 401);
    }
    setRefreshCookie(reply, rotated.token);
    const access = await signAccess({ sub: user.id, typ: 'admin', role: user.role });
    return { accessToken: access.token, expiresIn: access.expiresIn, user: me(user) };
  });

  r.post('/admin/auth/logout', { config: { public: true }, schema: { tags: ['auth'] } }, async (req, reply) => {
    const token = req.cookies[ADMIN_REFRESH_COOKIE];
    if (token) await revokeRefresh(token);
    reply.clearCookie(ADMIN_REFRESH_COOKIE, { path: COOKIE_PATH });
    return { ok: true };
  });

  r.get('/admin/auth/me', { schema: { tags: ['auth'] } }, async (req) => {
    const user = await db().adminUser.findUnique({ where: { id: requireAuth(req).sub } });
    if (!user) throw new AppError(ErrorCode.UNAUTHORIZED, 'Unknown user', 401);
    return me(user);
  });
}
