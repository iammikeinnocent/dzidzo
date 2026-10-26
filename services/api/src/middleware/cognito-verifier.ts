import { parseRoleFromGroups, parseTenantList, type AuthContext, type UserRole } from '@dzidzo/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { TokenVerifier } from './auth';

export interface CognitoVerifierConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

export function cognitoIssuerFor(config: CognitoVerifierConfig): string {
  return `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

export function cognitoJwksUrlFor(config: CognitoVerifierConfig): string {
  return `${cognitoIssuerFor(config)}/.well-known/jwks.json`;
}

function toAuthContext(payload: JWTPayload): AuthContext {
  const tenantId = payload['custom:tenant_id'];
  const sub = payload.sub;
  const explicitRole = payload['custom:role'];
  const role: UserRole | undefined =
    typeof explicitRole === 'string' && isUserRoleValue(explicitRole)
      ? explicitRole
      : parseRoleFromGroups(payload['cognito:groups']);
  if (typeof tenantId !== 'string' || typeof sub !== 'string' || !role) {
    throw new Error('token missing tenant or role claims');
  }
  return {
    tenantId,
    tenantIds: parseTenantList(payload['custom:tenant_ids'], tenantId),
    userId: sub,
    role,
  };
}

const VALID_ROLES: readonly string[] = ['director', 'manager', 'teacher'];

function isUserRoleValue(value: string): value is UserRole {
  return VALID_ROLES.includes(value);
}

/**
 * Production verifier: validates the RS256 signature against the user pool's
 * JWKS, pins the issuer, and enforces the audience/client contract per token
 * kind (ID tokens carry `aud`, access tokens carry `client_id`).
 * Claims are mapped through the same role/tenant logic as everywhere else.
 */
export function createCognitoVerifier(
  config: CognitoVerifierConfig,
  jwksUrlOverride?: string,
): TokenVerifier {
  const jwks = createRemoteJWKSet(new URL(jwksUrlOverride ?? cognitoJwksUrlFor(config)));
  const issuer = cognitoIssuerFor(config);

  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, { issuer });

    if (payload.token_use === 'id') {
      if (payload.aud !== config.clientId) {
        throw new Error('id token issued for a different app client');
      }
    } else if (payload.token_use === 'access') {
      if (payload.client_id !== config.clientId) {
        throw new Error('access token issued for a different app client');
      }
    } else {
      throw new Error('token is neither an id nor an access token');
    }

    return toAuthContext(payload);
  };
}

export function cognitoVerifierFromEnv(env: NodeJS.ProcessEnv = process.env): TokenVerifier {
  const region = env.COGNITO_REGION ?? env.AWS_REGION;
  const userPoolId = env.COGNITO_USER_POOL_ID;
  const clientId = env.COGNITO_WEB_CLIENT_ID;
  if (!region || !userPoolId || !clientId) {
    throw new Error(
      'COGNITO_REGION/AWS_REGION, COGNITO_USER_POOL_ID and COGNITO_WEB_CLIENT_ID are required',
    );
  }
  return createCognitoVerifier({ region, userPoolId, clientId });
}
