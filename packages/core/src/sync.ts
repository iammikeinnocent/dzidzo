import type { EntityName } from './table';

/** Wire format for the offline sync protocol (client ⇄ POST /sync). */
export const SYNC_PROTOCOL_VERSION = 1;

export type OutboxOperation = 'create' | 'update';

/** Only these entity types are syncable; finance is not synced. */
export const SYNCABLE_ENTITIES = ['LEARNER', 'ATTENDANCE'] as const;

export type SyncableEntity = (typeof SYNCABLE_ENTITIES)[number];

export interface OutboxItem<TPayload = unknown> {
  /** Client-generated idempotency key (UUID). Survives app restarts. */
  id: string;
  entityType: EntityName;
  entityId: string;
  operation: OutboxOperation;
  payload: TPayload;
  /** ISO-8601 timestamp from the client clock; drives last-write-wins. */
  clientUpdatedAt: string;
}

export type SyncItemStatus = 'applied' | 'duplicate' | 'rejected';

export interface SyncItemResult {
  id: string;
  status: SyncItemStatus;
  reason?: string;
}

export interface SyncRequest {
  items: OutboxItem[];
}

export interface SyncResponse {
  results: SyncItemResult[];
}

export interface AttendanceMark {
  /** yyyymmdd */
  day: string;
  learnerId: string;
  present: boolean;
  markedBy?: string;
}
