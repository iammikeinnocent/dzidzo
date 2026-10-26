import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { tableNameFor } from '@dzidzo/core';

export interface DbConfig {
  region: string;
  /** Set for DynamoDB Local; absent when talking to real AWS. */
  endpoint?: string;
  tableName: string;
}

export function dbConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const stage = env.STAGE ?? 'dev';
  const tableName = env.TABLE_NAME ?? tableNameFor(stage);
  const region = env.AWS_REGION ?? 'us-east-1';
  const endpoint = env.DYNAMODB_ENDPOINT;
  return endpoint ? { region, endpoint, tableName } : { region, tableName };
}

export function createDocumentClient(config: DbConfig): DynamoDBDocumentClient {
  const base = new DynamoDBClient({
    region: config.region,
    // DynamoDB Local accepts any credentials; providing explicit dummies stops
    // the SDK from walking the ambient credential chain (shared ~/.aws state).
    ...(config.endpoint
      ? {
          endpoint: config.endpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  });
  return DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });
}
