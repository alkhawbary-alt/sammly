import argon2 from 'argon2';
import { db } from '@sammly/db';
import type { App } from '../src/app';

/** Test admins (created on demand; the seed creates the SUPER_ADMIN). */
export async function ensureAdmin(email: string, role: 'SUPER_ADMIN' | 'TEMPLATE_EDITOR' | 'SUPPORT', password = 'test-password-123') {
  // Test files run in parallel: upsert, and tolerate the other file winning the insert race.
  const passwordHash = await argon2.hash(password);
  try {
    return await db().adminUser.upsert({ where: { email }, update: {}, create: { email, name: `Test ${role}`, role, passwordHash } });
  } catch {
    return db().adminUser.findUniqueOrThrow({ where: { email } });
  }
}

export async function login(app: App, email: string, password = 'test-password-123') {
  const r = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email, password } });
  if (r.statusCode !== 200) throw new Error(`login failed ${r.statusCode} ${r.body}`);
  const cookie = r.cookies.find((c) => c.name === 'sammly_admin_rt')!;
  return { accessToken: r.json().accessToken as string, refresh: cookie.value };
}

export async function adminHeaders(app: App, role: 'SUPER_ADMIN' | 'TEMPLATE_EDITOR' | 'SUPPORT' = 'SUPER_ADMIN') {
  const email = `test-${role.toLowerCase()}@sammly.test`;
  await ensureAdmin(email, role);
  const { accessToken } = await login(app, email);
  return { authorization: `Bearer ${accessToken}` };
}
