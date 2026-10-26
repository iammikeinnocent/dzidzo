import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  Table,
} from 'aws-cdk-lib/aws-dynamodb';
import { ATTR, GSI_CLASS_ROSTER, GSI_GUARDIAN_PHONE, tableNameFor } from '@dzidzo/core';
import type { Construct } from 'constructs';

export interface DzidzoStackProps extends StackProps {
  stage: 'dev' | 'prod';
}

/**
 * Single-table DynamoDB design.
 *
 * PK: TENANT#<tenantId>  — every entity in a tenant hangs off the same partition key.
 * SK carries the entity type + id, e.g. USER#, LEARNER#, GUARDIAN#,
 * CLASS#, ATTENDANCE#<yyyymmdd>#<learnerId>, ASSESSMENT#,
 * STAFF#, PAYROLL#<yyyymm>, EXPENSE#<yyyymmdd>#<id>, PAYMENT#.
 */
export class DataStack extends Stack {
  public readonly mainTable: Table;

  constructor(scope: Construct, id: string, props: DzidzoStackProps) {
    super(scope, id, props);

    const isDev = props.stage === 'dev';

    this.mainTable = new Table(this, 'MainTable', {
      tableName: tableNameFor(props.stage),
      partitionKey: { name: ATTR.pk, type: AttributeType.STRING },
      sortKey: { name: ATTR.sk, type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    // Class roster by learner name.
    this.mainTable.addGlobalSecondaryIndex({
      indexName: GSI_CLASS_ROSTER,
      partitionKey: { name: ATTR.gsi1pk, type: AttributeType.STRING },
      sortKey: { name: ATTR.gsi1sk, type: AttributeType.STRING },
    });

    // Guardian lookup by phone number (SMS targeting).
    this.mainTable.addGlobalSecondaryIndex({
      indexName: GSI_GUARDIAN_PHONE,
      partitionKey: { name: ATTR.gsi2pk, type: AttributeType.STRING },
    });
  }
}
