import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Construct } from 'constructs';
import type { DzidzoStackProps } from './data';

export interface JobsStackProps extends DzidzoStackProps {
  mainTable: Table;
}

/**
 * Scheduled jobs. The absenteeism alert runs at 05:00 UTC (07:00 SAST),
 * before the school day: only learners explicitly marked ABSENT trigger an
 * SMS; an unmarked register is treated as "not taken yet". SMS_PROVIDER
 * stays 'mock' until Africa's Talking credentials are configured.
 */
export class JobsStack extends Stack {
  constructor(scope: Construct, id: string, props: JobsStackProps) {
    super(scope, id, props);

    const absenteeism = new NodejsFunction(this, 'AbsenteeismJob', {
      entry: join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../services/jobs/src/absenteeism.ts',
      ),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(2),
      memorySize: 512,
      bundling: { minify: true, sourceMap: true },
      environment: {
        TABLE_NAME: props.mainTable.tableName,
        STAGE: props.stage,
        SMS_PROVIDER: 'mock',
      },
    });
    props.mainTable.grantReadData(absenteeism);

    const rule = new Rule(this, 'AbsenteeismDaily', {
      ruleName: `dzidzo-${props.stage}-absenteeism-daily`,
      schedule: Schedule.cron({ minute: '0', hour: '5' }),
      description: 'Daily absenteeism SMS alerts for Dzidzo schools',
    });
    rule.addTarget(new LambdaFunction(absenteeism));

    new CfnOutput(this, 'AbsenteeismRuleOutput', {
      value: rule.ruleArn,
      exportName: `dzidzo-${props.stage}-absenteeism-rule`,
    });
  }
}
