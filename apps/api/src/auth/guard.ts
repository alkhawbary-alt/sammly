import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError, ErrorCode } from '@sammly/shared';
import { verifyAccess, type AccessClaims, type SubjectType } from './tokens';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AccessClaims;
  }
  interface FastifyContextConfig {
    /** Roles allowed on this route (default: any authenticated role, SUPPORT read-only). */
    roles?: string[];
    /** Skip authentication (login/refresh). */
    public?: boolean;
  }
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

/**
 * Adds authentication + RBAC to every route registered in `scope`.
 * Admin: SUPER_ADMIN may do anything; SUPPORT is read-only unless a route lists it;
 * routes can narrow access with `config: { roles: [...] }`.
 */
export function guard(scope: FastifyInstance, typ: SubjectType): void {
  scope.addHook('onRequest', async (req) => {
    if (req.routeOptions.config?.public) return;
    const token = bearer(req);
    const claims = token ? await verifyAccess(token, typ) : null;
    if (!claims) throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
    req.auth = claims;

    if (typ !== 'admin') return;
    const roles = req.routeOptions.config?.roles;
    if (claims.role === 'SUPER_ADMIN') return;
    if (roles) {
      if (!roles.includes(claims.role)) throw new AppError(ErrorCode.FORBIDDEN, 'Not allowed for your role', 403);
      return;
    }
    if (claims.role === 'SUPPORT' && req.method !== 'GET') throw new AppError(ErrorCode.FORBIDDEN, 'Read-only role', 403);
  });
}

export function requireAuth(req: FastifyRequest): AccessClaims {
  if (!req.auth) throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', 401);
  return req.auth;
}
