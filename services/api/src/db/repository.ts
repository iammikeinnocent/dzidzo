import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ATTR, ENTITY, GSI_CLASS_ROSTER, GSI_GUARDIAN_PHONE, tenantPk, type PrimaryKey } from '@dzidzo/core';

export type TableItem = Record<string, unknown>;

/** Thrown when a stored item does not match its expected shape. */
export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataIntegrityError';
  }
}

export interface QueryFilter {
  expression: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

export interface QueryOptions {
  skBeginsWith?: string;
  indexName?: typeof GSI_CLASS_ROSTER | typeof GSI_GUARDIAN_PHONE;
  filter?: QueryFilter;
  /**
   * Single-page reads on purpose: rosters and phone lookups are small.
   * Pagination (LastEvaluatedKey) arrives when a real use case needs it.
   */
  limit?: number;
}

interface KeyAttrs {
  pk: string;
  sk?: string;
}

function keyAttrsFor(indexName: QueryOptions['indexName']): KeyAttrs {
  if (indexName === GSI_CLASS_ROSTER) {
    return { pk: ATTR.gsi1pk, sk: ATTR.gsi1sk };
  }
  if (indexName === GSI_GUARDIAN_PHONE) {
    return { pk: ATTR.gsi2pk };
  }
  return { pk: ATTR.pk, sk: ATTR.sk };
}

/**
 * Thin, typed wrapper over DynamoDB for the single-table layout.
 * Every higher-level repository scopes reads and writes by tenant —
 * the pk is always derived from the caller's tenant id, never from input.
 */
export class SingleTableRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    readonly tableName: string,
  ) {}

  async put(item: TableItem): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: item }));
  }

  async get(key: PrimaryKey): Promise<TableItem | undefined> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: key.pk, sk: key.sk } }),
    );
    return (res.Item ?? undefined) as TableItem | undefined;
  }

  async delete(key: PrimaryKey): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: this.tableName, Key: { pk: key.pk, sk: key.sk } }));
  }

  /**
   * Idempotency guard for the sync protocol: records SYNC#<id> once and only
   * once per tenant. Returns false when the item was already processed.
   */
  async ackIfNew(tenantId: string, syncId: string): Promise<boolean> {
    const key = tenantPk(tenantId);
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: key,
            sk: `${ENTITY.SYNC}#${syncId}`,
            entityType: ENTITY.SYNC,
            receivedAt: new Date().toISOString(),
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw error;
    }
  }

  async query(pkValue: string, options: QueryOptions = {}): Promise<TableItem[]> {
    const attrs = keyAttrsFor(options.indexName);
    const skBeginsWith = options.skBeginsWith;
    if (skBeginsWith !== undefined && attrs.sk === undefined) {
      throw new Error(`index ${String(options.indexName)} has no sort key`);
    }
    const hasSk = skBeginsWith !== undefined && attrs.sk !== undefined;

    const names: Record<string, string> = {
      '#pk': attrs.pk,
      ...(hasSk && attrs.sk !== undefined ? { '#sk': attrs.sk } : {}),
      ...(options.filter?.names ?? {}),
    };
    const values: Record<string, unknown> = {
      ':pk': pkValue,
      ...(skBeginsWith !== undefined ? { ':sk': skBeginsWith } : {}),
      ...(options.filter?.values ?? {}),
    };

    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        ...(options.indexName ? { IndexName: options.indexName } : {}),
        KeyConditionExpression: hasSk ? '#pk = :pk AND begins_with(#sk, :sk)' : '#pk = :pk',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ...(options.filter ? { FilterExpression: options.filter.expression } : {}),
        ...(options.limit ? { Limit: options.limit } : {}),
      }),
    );
    return (res.Items ?? []) as TableItem[];
  }
}
