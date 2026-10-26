import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb';
import {
  ATTR,
  GSI_CLASS_ROSTER,
  GSI_GUARDIAN_PHONE,
  tableNameFor,
} from '@dzidzo/core';
import net from 'node:net';

export const LOCAL_ENDPOINT = 'http://127.0.0.1:8000';
export const LOCAL_TABLE = tableNameFor('local');

/** Cheap TCP probe — avoids AWS SDK retries just to learn the container is down. */
export function isDynamoDbLocalUp(timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(8000, '127.0.0.1');
    const finish = (up: boolean) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/**
 * Recreates the local table with exactly the schema the CDK data stack deploys:
 * both sources import the same constants from @dzidzo/core, so they cannot drift.
 */
export async function recreateLocalTable(): Promise<void> {
  const client = new DynamoDBClient({
    region: 'us-east-1',
    endpoint: LOCAL_ENDPOINT,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });

  try {
    await client.send(new DeleteTableCommand({ TableName: LOCAL_TABLE }));
    await waitUntilTableNotExists(
      { client, minDelay: 0.1, maxWaitTime: 5 },
      { TableName: LOCAL_TABLE },
    );
  } catch {
    // table did not exist — nothing to clean up
  }

  await client.send(
    new CreateTableCommand({
      TableName: LOCAL_TABLE,
      AttributeDefinitions: [
        { AttributeName: ATTR.pk, AttributeType: 'S' },
        { AttributeName: ATTR.sk, AttributeType: 'S' },
        { AttributeName: ATTR.gsi1pk, AttributeType: 'S' },
        { AttributeName: ATTR.gsi1sk, AttributeType: 'S' },
        { AttributeName: ATTR.gsi2pk, AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: ATTR.pk, KeyType: 'HASH' },
        { AttributeName: ATTR.sk, KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: GSI_CLASS_ROSTER,
          KeySchema: [
            { AttributeName: ATTR.gsi1pk, KeyType: 'HASH' },
            { AttributeName: ATTR.gsi1sk, KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: GSI_GUARDIAN_PHONE,
          KeySchema: [{ AttributeName: ATTR.gsi2pk, KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );

  await waitUntilTableExists({ client, minDelay: 0.1, maxWaitTime: 5 }, { TableName: LOCAL_TABLE });
}
