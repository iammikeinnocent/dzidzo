import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createCognitoVerifier, cognitoIssuerFor, type CognitoVerifierConfig } from './middleware/cognito-verifier';

type RsaKeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

const config: CognitoVerifierConfig = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_testpool',
  clientId: 'client-123',
};

const nowSecs = () => Math.floor(Date.now() / 1000);

async function signToken(
  key: RsaKeyPair['privateKey'],
  kid: string,
  claims: Record<string, unknown>,
  overrides: { issuedAt?: number; expiresAt?: number } = {},
): Promise<string> {
  const builder = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(cognitoIssuerFor(config))
    .setIssuedAt(overrides.issuedAt ?? nowSecs())
    .setExpirationTime(overrides.expiresAt ?? nowSecs() + 3600);
  return builder.sign(key);
}

describe('cognito verifier (real RS256 signatures against a local JWKS)', () => {
  let server: Server;
  let jwksUrl: string;
  let goodKeys: RsaKeyPair;
  let wrongKeys: RsaKeyPair;

  beforeAll(async () => {
    goodKeys = await generateKeyPair('RS256', { extractable: true });
    wrongKeys = await generateKeyPair('RS256', { extractable: true });

    const goodJwk = await exportJWK(goodKeys.publicKey);
    const jwks = {
      keys: [{ ...goodJwk, kid: 'test-key-a', alg: 'RS256', use: 'sig' }],
    };

    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(jwks));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    jwksUrl = `http://127.0.0.1:${port}/.well-known/jwks.json`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  const verifier = () => createCognitoVerifier(config, jwksUrl);

  const accessClaims = {
    sub: 'user-1',
    token_use: 'access',
    client_id: 'client-123',
    'custom:tenant_id': 'tenant-1',
    'custom:role': 'teacher',
    'cognito:groups': ['teacher'],
  };

  it('accepts a validly signed access token and maps the claims', async () => {
    const token = await signToken(goodKeys.privateKey, 'test-key-a', accessClaims);
    expect(await verifier()(token)).toEqual({
      tenantId: 'tenant-1',
      tenantIds: ['tenant-1'],
      userId: 'user-1',
      role: 'teacher',
    });
  });

  it('parses the comma-separated tenant list claim when present', async () => {
    const token = await signToken(goodKeys.privateKey, 'test-key-a', {
      ...accessClaims,
      'custom:tenant_ids': 'tenant-1,tenant-9',
    });
    const context = await verifier()(token);
    expect(context.tenantIds).toEqual(['tenant-1', 'tenant-9']);
    expect(context.tenantId).toBe('tenant-1');
  });

  it('falls back to cognito:groups when the explicit role claim is absent', async () => {
    const token = await signToken(goodKeys.privateKey, 'test-key-a', {
      ...accessClaims,
      'custom:role': undefined,
      'cognito:groups': ['manager'],
    });
    expect(((await verifier()(token)) as { role: string }).role).toBe('manager');
  });

  it('rejects a token signed with an unknown key', async () => {
    const token = await signToken(wrongKeys.privateKey, 'test-key-a', accessClaims);
    await expect(verifier()(token)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signToken(goodKeys.privateKey, 'test-key-a', accessClaims, {
      issuedAt: nowSecs() - 7200,
      expiresAt: nowSecs() - 3600,
    });
    await expect(verifier()(token)).rejects.toThrow();
  });

  it('rejects a token from a different issuer', async () => {
    const token = await new SignJWT(accessClaims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-a' })
      .setIssuer('https://cognito-idp.us-east-1.amazonaws.com/us-east-1_OTHERPOOL')
      .setIssuedAt()
      .setExpirationTime(nowSecs() + 3600)
      .sign(goodKeys.privateKey);
    await expect(verifier()(token)).rejects.toThrow();
  });

  it('rejects an access token minted for a different client', async () => {
    const token = await signToken(goodKeys.privateKey, 'test-key-a', {
      ...accessClaims,
      client_id: 'other-client',
    });
    await expect(verifier()(token)).rejects.toThrow(/different app client/);
  });

  it('accepts an id token with the right audience and rejects a wrong one', async () => {
    const ok = await signToken(goodKeys.privateKey, 'test-key-a', {
      sub: 'user-1',
      token_use: 'id',
      aud: 'client-123',
      'custom:tenant_id': 'tenant-1',
      'cognito:groups': ['teacher'],
    });
    expect(((await verifier()(ok)) as { role: string }).role).toBe('teacher');

    const wrongAud = await signToken(goodKeys.privateKey, 'test-key-a', {
      sub: 'user-1',
      token_use: 'id',
      aud: 'other-client',
      'custom:tenant_id': 'tenant-1',
      'cognito:groups': ['teacher'],
    });
    await expect(verifier()(wrongAud)).rejects.toThrow(/different app client/);
  });

  it('rejects tokens without tenant or role claims', async () => {
    const noTenant = await signToken(goodKeys.privateKey, 'test-key-a', {
      sub: 'user-1',
      token_use: 'access',
      client_id: 'client-123',
      'cognito:groups': ['teacher'],
    });
    await expect(verifier()(noTenant)).rejects.toThrow(/tenant or role/);

    const noRole = await signToken(goodKeys.privateKey, 'test-key-a', {
      sub: 'user-1',
      token_use: 'access',
      client_id: 'client-123',
      'custom:tenant_id': 'tenant-1',
      'cognito:groups': ['All-Staff'],
    });
    await expect(verifier()(noRole)).rejects.toThrow(/tenant or role/);
  });

  it('rejects tokens with no recognizable token_use', async () => {
    const token = await signToken(goodKeys.privateKey, 'test-key-a', {
      sub: 'user-1',
      client_id: 'client-123',
      'custom:tenant_id': 'tenant-1',
      'cognito:groups': ['teacher'],
    });
    await expect(verifier()(token)).rejects.toThrow(/neither an id nor an access token/);
  });
});
