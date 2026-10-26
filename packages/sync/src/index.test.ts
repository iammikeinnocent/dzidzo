import { beforeEach, describe, expect, it } from 'vitest';
import type { OutboxItem, SyncItemResult } from './index';
import { InMemoryOutboxStore, SyncEngine } from './index';

function item(id: string, overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id,
    entityType: 'ATTENDANCE',
    entityId: 'l1#20260101',
    operation: 'create',
    payload: { day: '20260101', learnerId: 'l1', present: true },
    clientUpdatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function transport(
  results: SyncItemResult[],
  calls: unknown[][] = [],
) {
  return {
    post: async (_path: string, body: { items: OutboxItem[] }) => {
      calls.push([_path, body]);
      return { results };
    },
  };
}

describe('SyncEngine', () => {
  let outbox: InMemoryOutboxStore;

  beforeEach(() => {
    outbox = new InMemoryOutboxStore();
  });

  it('drains nothing when the outbox is empty', async () => {
    const engine = new SyncEngine(outbox, transport([]));
    expect(await engine.drain()).toEqual({
      attempted: 0, applied: 0, duplicate: 0, rejected: 0, remaining: 0,
    });
  });

  it('posts batches oldest-first and acks applied items', async () => {
    await outbox.enqueue(item('a'));
    await outbox.enqueue(item('b'));
    const calls: unknown[][] = [];
    const engine = new SyncEngine(outbox, transport([
      { id: "a", status: "applied" },
      { id: 'b', status: 'applied' },
    ], calls));

    const result = await engine.drain();
    expect(result).toEqual({ attempted: 2, applied: 2, duplicate: 0, rejected: 0, remaining: 0 });
    expect((calls[0]?.[1] as { items: OutboxItem[] }).items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(await outbox.count()).toBe(0);
  });

  it('drops rejected poison items and keeps only unseen ones', async () => {
    await outbox.enqueue(item('good-1'));
    await outbox.enqueue(item('poison'));
    await outbox.enqueue(item('good-2'));
    const engine = new SyncEngine(outbox, transport([
      { id: 'good-1', status: 'applied' },
      { id: 'poison', status: 'rejected', reason: 'invalid' },
      { id: 'good-2', status: 'applied' },
    ]));

    const result = await engine.drain();
    expect(result.rejected).toBe(1);
    expect(await outbox.count()).toBe(0);
  });

  it('respects the batch size and keeps the remainder queued', async () => {
    for (const id of ['1', '2', '3']) {
      await outbox.enqueue(item(id));
    }
    const engine = new SyncEngine(outbox, transport([
      { id: '1', status: 'applied' },
      { id: '2', status: 'applied' },
    ]), 2);

    const first = await engine.drain();
    expect(first.attempted).toBe(2);
    expect(first.remaining).toBe(1);
    expect(await outbox.pending(10)).toHaveLength(1);
  });

  it('propagates transport failures without acking anything', async () => {
    await outbox.enqueue(item('a'));
    const engine = new SyncEngine(outbox, {
      post: async () => {
        throw new Error('network down');
      },
    });

    await expect(engine.drain()).rejects.toThrow('network down');
    expect(await outbox.count()).toBe(1); // nothing lost
  });
});
