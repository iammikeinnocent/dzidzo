import type { OutboxItem, OutboxStore } from '@dzidzo/sync';
import type { DzidzoLocalDb } from './db';

/** OutboxStore backed by the IndexedDB outbox table (oldest-first drain). */
export class DexieOutboxStore implements OutboxStore {
  constructor(private readonly db: DzidzoLocalDb) {}

  async enqueue(item: OutboxItem): Promise<void> {
    await this.db.outbox.add(item);
  }

  async pending(limit: number): Promise<OutboxItem[]> {
    return this.db.outbox.orderBy('clientUpdatedAt').limit(limit).toArray();
  }

  async ack(ids: string[]): Promise<void> {
    await this.db.outbox.bulkDelete(ids);
  }

  async count(): Promise<number> {
    return this.db.outbox.count();
  }
}
