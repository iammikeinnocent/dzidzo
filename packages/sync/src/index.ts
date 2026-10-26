/**
 * Dzidzo offline sync engine (client side).
 *
 * Flow:
 *  - Every offline mutation appends an OutboxItem (client-generated UUID =
 *    idempotency key) to an OutboxStore.
 *  - SyncEngine.drain() posts bounded batches to POST /sync whenever the app
 *    is foregrounded and connectivity returns.
 *  - The server applies each item idempotently (SYNC#<id> ack per tenant),
 *    merges attendance by last-write-wins, and reports per-item results.
 *  - Applied and duplicate items are acknowledged and dropped locally;
 *    rejected items are reported so callers can surface or drop them.
 */

export {
  SYNC_PROTOCOL_VERSION,
  SYNCABLE_ENTITIES,
} from '@dzidzo/core';
import type {
  OutboxItem,
  OutboxOperation,
  SyncItemResult,
  SyncRequest,
  SyncResponse,
} from '@dzidzo/core';
export type {
  AttendanceMark,
  OutboxItem,
  OutboxOperation,
  SyncItemResult,
  SyncItemStatus,
  SyncRequest,
  SyncResponse,
  SyncableEntity,
} from '@dzidzo/core';

export interface OutboxItemInput<TPayload> {
  entityType: OutboxItem['entityType'];
  entityId: string;
  operation: OutboxOperation;
  payload: TPayload;
  clientUpdatedAt?: string;
}

export function createOutboxItem<TPayload>(input: OutboxItemInput<TPayload>): OutboxItem<TPayload> {
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
    id: crypto.randomUUID(),
    clientUpdatedAt: input.clientUpdatedAt ?? new Date().toISOString(),
  };
}

export interface OutboxStore {
  enqueue(item: OutboxItem): Promise<void>;
  /** Oldest-first snapshot of up to `limit` pending items (not removed). */
  pending(limit: number): Promise<OutboxItem[]>;
  /** Removes acknowledged items by id. */
  ack(ids: string[]): Promise<void>;
  count(): Promise<number>;
}

export class InMemoryOutboxStore implements OutboxStore {
  private items: OutboxItem[] = [];

  async enqueue(item: OutboxItem): Promise<void> {
    this.items.push(item);
  }

  async pending(limit: number): Promise<OutboxItem[]> {
    return this.items.slice(0, limit);
  }

  async ack(ids: string[]): Promise<void> {
    const acked = new Set(ids);
    this.items = this.items.filter((item) => !acked.has(item.id));
  }

  async count(): Promise<number> {
    return this.items.length;
  }
}

/** Minimal transport seam — ApiClient.post satisfies this structurally. */
export interface SyncTransport {
  post(path: string, body: SyncRequest): Promise<SyncResponse>;
}

export interface DrainResult {
  attempted: number;
  applied: number;
  duplicate: number;
  rejected: number;
  /** Items left queued after this drain (only those the server never saw). */
  remaining: number;
}

export class SyncEngine {
  constructor(
    private readonly outbox: OutboxStore,
    private readonly transport: SyncTransport,
    private readonly maxBatchSize = 50,
  ) {}

  async drain(): Promise<DrainResult> {
    const items = await this.outbox.pending(this.maxBatchSize);
    if (items.length === 0) {
      return { attempted: 0, applied: 0, duplicate: 0, rejected: 0, remaining: 0 };
    }

    const response = await this.transport.post('/sync', { items });
    const applied = response.results.filter((r: SyncItemResult) => r.status === 'applied');
    const duplicate = response.results.filter((r: SyncItemResult) => r.status === 'duplicate');
    const rejected = response.results.filter((r: SyncItemResult) => r.status === 'rejected');

    // Applied + duplicate are durably handled server-side, and rejected items
    // are poison messages — all three are dropped locally. Only items the
    // server never saw remain queued.
    const seen = [...applied, ...duplicate, ...rejected].map((r: SyncItemResult) => r.id);
    await this.outbox.ack(seen);

    return {
      attempted: items.length,
      applied: applied.length,
      duplicate: duplicate.length,
      rejected: rejected.length,
      remaining: await this.outbox.count(),
    };
  }
}
