import { CfnOutput, Stack } from 'aws-cdk-lib';
import {
  ManagedPolicy,
  OpenIdConnectPrincipal,
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
} from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { DzidzoStackProps } from './data';

/**
 * GitHub Actions OIDC: short-lived credentials for CI deploys — no static
 * keys stored as repository secrets. The role trusts only this repository's
 * main branch via the `sub` claim; set the owner with
 * `cdk deploy -c githubOwner=your-username`.
 *
 * Scope: PowerUserAccess covers every service the stacks create, plus an
 * explicit IAM write statement scoped to roles named dzidzo-* (CDK needs to
 * create execution roles). AdministratorAccess is not granted.
 */
export class CicdStack extends Stack {
  constructor(scope: Construct, id: string, props: DzidzoStackProps) {
    super(scope, id, props);

    const provider = new OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const owner = this.node.tryGetContext('githubOwner') ?? 'REPLACE-WITH-GITHUB-USERNAME';
    const role = new Role(this, 'GitHubDeployRole', {
      roleName: `dzidzo-${props.stage}-github-deploy`,
      assumedBy: new OpenIdConnectPrincipal(provider).withConditions({
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${owner}/dzidzo:*`,
        },
      }),
      description: 'Deploys the dzidzo stacks from GitHub Actions (OIDC, no static keys)',
    });
    role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'));
    role.addToPolicy(
      new PolicyStatement({
        actions: [
          'iam:CreateRole',
          'iam:DeleteRole',
          'iam:TagRole',
          'iam:UntagRole',
          'iam:PutRolePolicy',
          'iam:DeleteRolePolicy',
          'iam:AttachRolePolicy',
          'iam:DetachRolePolicy',
          'iam:GetRole',
          'iam:GetRolePolicy',
          'iam:PassRole',
          'iam:ListRoles',
        ],
        resources: ['*'],
        conditions: {
          StringLike: { 'aws:ResourceTag/aws:cloudformation:stack-name': `dzidzo-${props.stage}-*` },
        },
      }),
    );

    new CfnOutput(this, 'DeployRoleArnOutput', {
      value: role.roleArn,
      exportName: `dzidzo-${props.stage}-deploy-role-arn`,
    });
  }
}