import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Distribution, ViewerProtocolPolicy, CachePolicy, OriginAccessIdentity, SecurityPolicyProtocol } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Construct } from 'constructs';
import type { DzidzoStackProps } from './data';

/**
 * Static hosting for the React PWA: private S3 behind CloudFront (OAI),
 * HTTPS-only, SPA history-mode routing via 404/403→/index.html rewrites,
 * and a deployment step that uploads apps/web/dist on every deploy.
 */
export class SiteStack extends Stack {
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: DzidzoStackProps) {
    super(scope, id, props);
    const isDev = props.stage === 'dev';

    const siteBucket = new Bucket(this, 'SiteBucket', {
      bucketName: `dzidzo-${props.stage}-site`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: isDev,
    });

    const originAccessIdentity = new OriginAccessIdentity(this, 'OAI', {
      comment: `dzidzo-${props.stage}-site-oai`,
    });
    siteBucket.addToResourcePolicy(
      new PolicyStatement({
        principals: [originAccessIdentity.grantPrincipal],
        actions: ['s3:GetObject'],
        resources: [siteBucket.arnForObjects('*')],
      }),
    );

    this.distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new S3Origin(siteBucket, { originAccessIdentity }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      },
      errorResponses: [
        { httpStatus: 404, responsePagePath: '/index.html', responseHttpStatus: 200, ttl: Duration.minutes(5) },
        { httpStatus: 403, responsePagePath: '/index.html', responseHttpStatus: 200, ttl: Duration.minutes(5) },
      ],
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    // Upload the built PWA (apps/web/dist is produced by pnpm build).
    new BucketDeployment(this, 'DeploySite', {
      sources: [Source.asset(join(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/dist'))],
      destinationBucket: siteBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'SiteUrlOutput', {
      value: `https://${this.distribution.distributionDomainName}`,
      exportName: `dzidzo-${props.stage}-site-url`,
    });
    new CfnOutput(this, 'SiteBucketOutput', {
      value: siteBucket.bucketName,
      exportName: `dzidzo-${props.stage}-site-bucket`,
    });
  }
}