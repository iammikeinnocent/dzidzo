import type { AuthContext } from '@dzidzo/core';
import { hasPermission, parseRoleFromGroups, parseTenantList, type Permission } from '@dzidzo/core';
import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono';
import { decodeUnverifiedJwtPayload } from '../jwt';
import type { AppEnv } from '../env';

/**
 * Extracts an AuthContext from a token. The verifier is injected so tests and
 * local development can use the (clearly unsafe) decoder while production
 * wires the Cognito JWKS verifier — same contract, real crypto.
 */
export type TokenVerifier = (token: string) => Promise<AuthContext>;

const UNAUTHORIZED = { error: 'unauthorized' } as const;

/**
 * Development/test verifier: decodes the JWT payload without signature
 * validation and maps Cognito-style claims to an AuthContext.
 * NEVER wire this into a deployed environment.
 */
export const developmentVerifier: TokenVerifier = async (token) => {
  const payload = decodeUnverifiedJwtPayload(token);
  const role = parseRoleFromGroups(payload['cognito:groups']);
  const tenantId = payload['custom:tenant_id'];
  const sub = payload['sub'];
  if (!role || typeof tenantId !== 'string' || typeof sub !== 'string') {
    throw new Error('token missing required claims');
  }
  return {
    tenantId,
    tenantIds: parseTenantList(payload['custom:tenant_ids'], tenantId),
    userId: sub,
    role,
  };
};

export function authMiddleware(verify: TokenVerifier): MiddlewareHandler<AppEnv> {
  return createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      return c.json(UNAUTHORIZED, 401);
    }
    try {
      const auth = await verify(header.slice('Bearer '.length));
      const override = c.req.header('x-tenant-id');
      if (override !== undefined && override !== '') {
        if (!auth.tenantIds.includes(override)) {
          return c.json({ error: 'forbidden', missingTenant: override }, 403);
        }
        c.set('auth', { ...auth, tenantId: override });
      } else {
        c.set('auth', auth);
      }
      await next();
    } catch {
      return c.json(UNAUTHORIZED, 401);
    }
  });
}

export function requirePermission(permission: Permission): MiddlewareHandler<AppEnv> {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!hasPermission(c.get('auth').role, permission)) {
      return c.json({ error: 'forbidden', missingPermission: permission }, 403);
    }
    await next();
  });
}
