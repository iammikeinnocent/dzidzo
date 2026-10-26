import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import {
  AccountRecovery,
  LambdaVersion,
  OAuthScope,
  StringAttribute,
  UserPool,
  UserPoolClient,
  UserPoolGroup,
  UserPoolOperation,
} from 'aws-cdk-lib/aws-cognito';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { USER_ROLES } from '@dzidzo/core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Construct } from 'constructs';
import type { DzidzoStackProps } from './data';

/**
 * Full auth: email sign-in, admin-provisioned staff accounts, one Cognito
 * group per role, a pre-token-generation Lambda that stamps tenant + role
 * claims (failing closed on provisioning errors), and a hosted-UI domain for
 * the PWA's authorization-code + PKCE flow.
 *
 * TODO: per-role MFA (directors first) and refresh-token rotation tuning.
 */
export class AuthStack extends Stack {
  public readonly userPool: UserPool;
  public readonly webClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: DzidzoStackProps) {
    super(scope, id, props);

    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: `dzidzo-${props.stage}-users`,
      selfSignUpEnabled: false, // staff accounts are provisioned by directors, never open sign-up
      signInAliases: { email: true },
      customAttributes: {
        tenant_id: new StringAttribute({ mutable: true, minLen: 1, maxLen: 64 }),
        /** Comma-separated list of schools this user can act in. */
        tenant_ids: new StringAttribute({ mutable: true, minLen: 1, maxLen: 1024 }),
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
    });

    for (const role of USER_ROLES) {
      new UserPoolGroup(this, `RoleGroup-${role}`, {
        userPool: this.userPool,
        groupName: role,
        description: `Dzidzo ${role} role — drives token claims and API permissions`,
      });
    }

    const claimsFunction = new NodejsFunction(this, 'PreTokenClaims', {
      entry: join(dirname(fileURLToPath(import.meta.url)), '../../../services/auth-lambda/src/pre-token.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(5),
      memorySize: 256,
      bundling: { minify: true, sourceMap: true },
    });
    // PRE_TOKEN_GENERATION_CONFIG (not the legacy PRE_TOKEN_GENERATION): the
    // legacy field combined with PreTokenGenerationConfig on the same pool
    // produces "Invalid version in Lambda response" at token issuance.
    this.userPool.addTrigger(
      UserPoolOperation.PRE_TOKEN_GENERATION_CONFIG,
      claimsFunction,
      LambdaVersion.V2_0,
    );

    // Hosted UI domain — the prefix must be globally unique per region; the
    // account id is a token at synth time (no credentials needed for synth),
    // so the prefix is context-configurable with a deterministic default.
    // Override with: cdk deploy -c domainPrefix=dzidzo-dev-yourname
    const domainPrefix = this.node.tryGetContext('domainPrefix') ?? `dzidzo-${props.stage}`;
    const domain = this.userPool.addDomain('HostedUiDomain', {
      cognitoDomain: { domainPrefix },
    });

    this.webClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `dzidzo-${props.stage}-web`,
      generateSecret: false, // public SPA client using authorization code + PKCE
      authFlows: {
        userSrp: true, // SRP for direct API logins (tests, CLI tooling)
        adminUserPassword: true, // admin seeding of demo accounts
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [
          'http://localhost:5173/auth/callback',
          'http://localhost:5174/auth/callback',
          'http://localhost:5175/auth/callback',
          ...(props.siteOrigin ? [`${props.siteOrigin}/auth/callback`] : []),
        ],
        logoutUrls: [
          'http://localhost:5173',
          'http://localhost:5174',
          'http://localhost:5175',
          ...(props.siteOrigin ? [props.siteOrigin] : []),
        ],
      },
      preventUserExistenceErrors: true,
    });

    new CfnOutput(this, 'UserPoolIdOutput', {
      value: this.userPool.userPoolId,
      exportName: `dzidzo-${props.stage}-user-pool-id`,
    });
    new CfnOutput(this, 'WebClientIdOutput', {
      value: this.webClient.userPoolClientId,
      exportName: `dzidzo-${props.stage}-web-client-id`,
    });
    new CfnOutput(this, 'HostedUiBaseUrlOutput', {
      value: domain.baseUrl(),
      exportName: `dzidzo-${props.stage}-hosted-ui`,
    });
  }
}
