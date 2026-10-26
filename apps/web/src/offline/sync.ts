import { useSyncExternalStore } from 'react';
import { SyncEngine, type DrainResult, type OutboxStore } from '@dzidzo/sync';
import type { ApiClient } from '../api/client';
import type { DzidzoLocalDb } from './db';
import { OfflineSchoolStore } from './store';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error' | 'offline';
  pending: number;
  lastDrain: DrainResult | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

/**
 * Owns the sync loop: drains the outbox on load, when connectivity returns,
 * and on a periodic timer. Exposes an external store for React via
 * useSyncExternalStore — no state-library dependency needed.
 */
export class SyncController {
  private status: SyncStatus = { state: 'idle', pending: 0, lastDrain: null, lastSyncedAt: null, lastError: null };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private engine: SyncEngine;
  store: OfflineSchoolStore | null = null;

  constructor(
    private readonly db: DzidzoLocalDb,
    outbox: OutboxStore,
    /** Read fresh on every drain — auth token changes must not strand the queue. */
    private readonly getApi: () => ApiClient,
  ) {
    this.engine = new SyncEngine(outbox, {
      post: (path, body) => this.getApi().post(path, body),
    });
  }

  getSnapshot = (): SyncStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };


  attach(store: OfflineSchoolStore): void {
    this.store = store;
  }

  private update(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }

  async refreshPending(): Promise<void> {
    this.update({ pending: await this.db.outbox.count() });
  }

  async drain(): Promise<DrainResult | null> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.update({ state: 'offline' });
      return null;
    }
    this.update({ state: 'syncing', lastError: null });
    try {
      const result = await this.engine.drain();
      const lastSyncedAt = result.attempted > 0 ? new Date().toISOString() : this.status.lastSyncedAt;
      this.update({ state: 'idle', lastDrain: result, lastSyncedAt });
      await this.refreshPending();
      return result;
    } catch (error) {
      this.update({ state: 'error', lastError: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  start(): void {
    if (this.timer !== null) {
      return;
    }
    void this.refreshPending();
    void this.drain();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.drain());
    }
    this.timer = setInterval(() => void this.drain(), 60_000);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

let controller: SyncController | null = null;

export function startOfflineSync(
  db: DzidzoLocalDb,
  outbox: OutboxStore,
  getApi: () => ApiClient,
): SyncController {
  if (controller !== null) {
    return controller;
  }
  controller = new SyncController(db, outbox, getApi);
  controller.attach(new OfflineSchoolStore(db, outbox));
  controller.start();
  return controller;
}

export function offlineSync(): SyncController | null {
  return controller;
}

export function useSyncStatus(): SyncStatus {
  const active = controller;
  if (!active) {
    return { state: 'idle', pending: 0, lastDrain: null, lastSyncedAt: null, lastError: null };
  }
  return useSyncExternalStore(active.subscribe, active.getSnapshot);
}

export function offlineStore(): OfflineSchoolStore | null {
  return controller?.store ?? null;
}

export function drainNow(): Promise<DrainResult | null> {
  return controller ? controller.drain() : Promise.resolve(null);
}
