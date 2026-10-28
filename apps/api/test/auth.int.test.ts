import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, disconnectDb } from '@sammly/db';
import { buildApp } from '../src/app';
import { v1Routes } from '../src/routes';
import { adminHeaders, ensureAdmin, login } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://sammly:sammly@localhost:5433/sammly';
const dbUp = await db()
  .$queryRaw`select 1`
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbUp)('admin auth (integration)', () => {
  const app = buildApp({ checkDb: async () => true, routes: v1Routes });
  const email = 'test-auth@sammly.test';
  beforeAll(async () => {
    await app.ready();
    await ensureAdmin(email, 'TEMPLATE_EDITOR');
  });
  afterAll(async () => {
    await app.close();
    await disconnectDb();
  });

  it('rejects wrong passwords and unknown users with the same 401', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email, password: 'nope' } });
    const b = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email: 'ghost@sammly.test', password: 'nope' } });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
  });

  it('protects admin routes', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/templates' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/templates', headers: { authorization: 'Bearer forged.token.here' } })).statusCode).toBe(401);
  });

  it('logs in, reads /me, sets an httpOnly refresh cookie scoped to the auth path', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email, password: 'test-password-123' } });
    expect(r.statusCode).toBe(200);
    const cookie = r.cookies.find((c) => c.name === 'sammly_admin_rt')!;
    expect(cookie).toMatchObject({ httpOnly: true, path: '/api/v1/admin/auth', sameSite: 'Lax' });
    const me = await app.inject({ method: 'GET', url: '/api/v1/admin/auth/me', headers: { authorization: `Bearer ${r.json().accessToken}` } });
    expect(me.json()).toMatchObject({ email, role: 'TEMPLATE_EDITOR' });
  });

  it('rotates refresh tokens and revokes the family when an old one is reused', async () => {
    const { refresh } = await login(app, email);
    const r1 = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/refresh', cookies: { sammly_admin_rt: refresh } });
    expect(r1.statusCode).toBe(200);
    const next = r1.cookies.find((c) => c.name === 'sammly_admin_rt')!.value;
    expect(next).not.toBe(refresh);

    // Replay of the first token = theft → everything in the family dies, including `next`.
    expect((await app.inject({ method: 'POST', url: '/api/v1/admin/auth/refresh', cookies: { sammly_admin_rt: refresh } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/admin/auth/refresh', cookies: { sammly_admin_rt: next } })).statusCode).toBe(401);
  });

  it('logout revokes the session', async () => {
    const { refresh } = await login(app, email);
    await app.inject({ method: 'POST', url: '/api/v1/admin/auth/logout', cookies: { sammly_admin_rt: refresh } });
    expect((await app.inject({ method: 'POST', url: '/api/v1/admin/auth/refresh', cookies: { sammly_admin_rt: refresh } })).statusCode).toBe(401);
  });

  it('SUPPORT is read-only', async () => {
    const headers = await adminHeaders(app, 'SUPPORT');
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/categories', headers })).statusCode).toBe(200);
    const w = await app.inject({ method: 'POST', url: '/api/v1/admin/categories', headers, payload: { slug: 'x-support', name: { ar: 'س' } } });
    expect(w.statusCode).toBe(403);
  });
});
