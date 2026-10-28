import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '@sammly/db';
import { config } from '@sammly/platform';

export type SubjectType = 'admin' | 'business';

export interface AccessClaims {
  sub: string;
  typ: SubjectType;
  /** AdminRole or BusinessUserRole */
  role: string;
  /** Business users: tenant id. Every app query is scoped by it. */
  bid?: string;
  /** Set when an admin impersonates a business user (simulator). */
  imp?: string;
}

const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_DAYS = 30;

const key = () => new TextEncoder().encode(config().JWT_ACCESS_SECRET);
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export async function signAccess(claims: AccessClaims, ttlSec = ACCESS_TTL_SEC): Promise<{ token: string; expiresIn: number }> {
  const token = await new SignJWT({ typ: claims.typ, role: claims.role, bid: claims.bid, imp: claims.imp })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('sammly')
    .setAudience(claims.typ)
    .setExpirationTime(`${ttlSec}s`)
    .sign(key());
  return { token, expiresIn: ttlSec };
}

export async function verifyAccess(token: string, typ: SubjectType): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: 'sammly', audience: typ, algorithms: ['HS256'] });
    if (payload.typ !== typ || !payload.sub) return null;
    return { sub: payload.sub, typ, role: String(payload.role), bid: payload.bid as string | undefined, imp: payload.imp as string | undefined };
  } catch {
    return null;
  }
}

/** New refresh token (optionally continuing a rotation family). Returns the raw token once. */
export async function issueRefresh(subjectType: SubjectType, subjectId: string, familyId: string = crypto.randomUUID()): Promise<{ token: string; id: string }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const row = await db().refreshToken.create({
    data: { subjectType, subjectId, tokenHash: sha256(token), familyId, expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000) },
  });
  return { token, id: row.id };
}

/**
 * Rotate a refresh token. A token that was already rotated or revoked means it leaked:
 * the whole family is revoked and the caller must log in again.
 */
export async function rotateRefresh(token: string, subjectType: SubjectType): Promise<{ subjectId: string; token: string } | null> {
  const row = await db().refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.subjectType !== subjectType) return null;
  if (row.revokedAt || row.replacedById) {
    await db().refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    return null;
  }
  if (row.expiresAt < new Date()) return null;
  const next = await issueRefresh(subjectType, row.subjectId, row.familyId);
  await db().refreshToken.update({ where: { id: row.id }, data: { replacedById: next.id, revokedAt: new Date() } });
  return { subjectId: row.subjectId, token: next.token };
}

export async function revokeRefresh(token: string): Promise<void> {
  const row = await db().refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (row) await db().refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}
