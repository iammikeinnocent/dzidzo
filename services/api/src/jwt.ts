/**
 * Decodes a JWT payload WITHOUT verifying the signature.
 *
 * Only safe for local development and tests — the production verifier
 * validates the signature against the Cognito JWKS before any claim is
 * trusted.
 */
export function decodeUnverifiedJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('malformed token');
  }
  const json = Buffer.from(parts[1] ?? '', 'base64url').toString('utf8');
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('malformed token payload');
  }
  return parsed as Record<string, unknown>;
}
