import Dexie, { type EntityTable } from 'dexie';
import type { Learner, OutboxItem } from '@dzidzo/core';

/** Locally cached attendance mark; `syncedAt === null` means queued. */
export interface LocalAttendance {
  /** `${day}#${learnerId}` */
  key: string;
  day: string;
  learnerId: string;
  present: boolean;
  markedBy?: string;
  updatedAt: string;
  syncedAt: string | null;
}

export interface SyncMeta {
  key: string;
  value: unknown;
}

export class DzidzoLocalDb extends Dexie {
  learners!: EntityTable<Learner, 'learnerId'>;
  attendance!: EntityTable<LocalAttendance, 'key'>;
  outbox!: EntityTable<OutboxItem, 'id'>;
  meta!: EntityTable<SyncMeta, 'key'>;

  constructor(name = 'dzidzo') {
    super(name);
    this.version(1).stores({
      learners: 'learnerId, classId',
      attendance: 'key, day',
      outbox: 'id, clientUpdatedAt',
      meta: 'key',
    });
  }
}

export function attendanceKeyFor(day: string, learnerId: string): string {
  return `${day}#${learnerId}`;
}
