import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  AccessLogFormat,
  AuthorizationType,
  Cors,
  LambdaIntegration,
  LogGroupLogDestination,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import type { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { HttpMethods } from 'aws-cdk-lib/aws-s3';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Construct } from 'constructs';
import type { DzidzoStackProps } from './data';

export interface ApiStackProps extends DzidzoStackProps {
  mainTable: Table;
  userPool: IUserPool;
  webClientId: string;
}

/**
 * One REST API per stage. A single catch-all resource delegates every route
 * to the Hono Lambda, where the permission matrix applies per route and the
 * RS256 token verifier is the auth gate (unauthenticated requests get 401
 * from the handler). The only unauthenticated endpoint is /health (uptime
 * checks).
 *
 * No gateway-level Cognito authorizer: API Gateway's COGNITO_USER_POOLS
 * authorizer accepts ID tokens but rejects OAuth access tokens, which is the
 * token type the PWA correctly sends. Authorization is enforced by the
 * Lambda's own verifier instead.
 *
 * Throttling: 50 rps sustained, 100 burst — sized for small schools and
 * well under the account-level 10k default.
 */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);


    /**
     * Private assets bucket for avatars, certificates and study materials.
     * Objects are uploaded by the browser via presigned PUTs issued by the
     * API and read back through short-lived signed URLs — never public.
     */
    const assets = new Bucket(this, 'Assets', {
      bucketName: `dzidzo-${props.stage}-assets`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET],
          allowedOrigins: ['http://localhost:5173'],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const handler = new NodejsFunction(this, 'ApiHandler', {
      entry: join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../services/api/src/lambda.ts',
      ),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(10),
      memorySize: 512,
      bundling: { minify: true, sourceMap: true },
      environment: {
        TABLE_NAME: props.mainTable.tableName,
        STAGE: props.stage,
        COGNITO_REGION: this.region,
        COGNITO_USER_POOL_ID: props.userPool.userPoolId,
        COGNITO_WEB_CLIENT_ID: props.webClientId,
        CORS_ORIGINS: 'http://localhost:5173',
        ASSETS_BUCKET_NAME: assets.bucketName,
      },
    });
    props.mainTable.grantReadWriteData(handler);
    assets.grantReadWrite(handler);


    const accessLogs = new LogGroup(this, 'AccessLogs', {
      logGroupName: `/aws/apigateway/dzidzo-${props.stage}-api`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const api = new RestApi(this, 'Api', {
      restApiName: `dzidzo-${props.stage}-api`,
      deployOptions: {
        stageName: props.stage,
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
        accessLogDestination: new LogGroupLogDestination(accessLogs),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields({
          caller: false,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: false,
        }),
      },
      // Localhost for local development; extend with the deployed site
      // origin when it exists (Lambda responses also honor CORS_ORIGINS).
      defaultCorsPreflightOptions: {
        allowOrigins: ['http://localhost:5173'],
        allowMethods: Cors.ALL_METHODS,
        allowHeaders: ['Authorization', 'Content-Type'],
        statusCode: 204,
      },
    });

    const integration = new LambdaIntegration(handler);

    api.root.addResource('health').addMethod('GET', integration, {
      authorizationType: AuthorizationType.NONE,
    });

    api.root.addResource('{proxy+}').addMethod('ANY', integration);

    new CfnOutput(this, 'ApiUrlOutput', {
      value: api.url,
      exportName: `dzidzo-${props.stage}-api-url`,
    });
  }
}
