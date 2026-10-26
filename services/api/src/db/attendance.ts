import { attendanceKey, ENTITY, tenantPk, type AttendanceRecord } from '@dzidzo/core';
import { DataIntegrityError, type SingleTableRepository, type TableItem } from './repository';

export interface MarkInput {
  /** yyyymmdd */
  day: string;
  learnerId: string;
  present: boolean;
  markedBy?: string;
  /** ISO-8601 clock of the marking client — drives last-write-wins. */
  updatedAt: string;
}

export function attendanceToItem(record: AttendanceRecord): TableItem {
  const key = attendanceKey(record.tenantId, record.day, record.learnerId);
  const item: TableItem = {
    entityType: ENTITY.ATTENDANCE,
    pk: key.pk,
    sk: key.sk,
    tenantId: record.tenantId,
    day: record.day,
    learnerId: record.learnerId,
    present: record.present,
    updatedAt: record.updatedAt,
  };
  if (record.markedBy !== undefined) {
    item.markedBy = record.markedBy;
  }
  return item;
}

export function attendanceFromItem(item: TableItem): AttendanceRecord {
  if (item.entityType !== ENTITY.ATTENDANCE) {
    throw new DataIntegrityError('item is not an attendance record');
  }
  const record: AttendanceRecord = {
    tenantId: String(item.tenantId),
    day: String(item.day),
    learnerId: String(item.learnerId),
    present: item.present === true,
    updatedAt: String(item.updatedAt),
  };
  if (typeof item.markedBy === 'string') {
    record.markedBy = item.markedBy;
  }
  return record;
}

export class AttendanceRepository {
  constructor(private readonly repo: SingleTableRepository) {}

  /** Last-write-wins: a stale write returns the stored record unchanged. */
  async mark(tenantId: string, input: MarkInput): Promise<AttendanceRecord> {
    const key = attendanceKey(tenantId, input.day, input.learnerId);
    const existing = await this.repo.get(key);
    const record: AttendanceRecord = {
      tenantId,
      day: input.day,
      learnerId: input.learnerId,
      present: input.present,
      updatedAt: input.updatedAt,
    };
    if (input.markedBy !== undefined) {
      record.markedBy = input.markedBy;
    }
    if (existing) {
      const prior = attendanceFromItem(existing);
      if (prior.updatedAt >= record.updatedAt) {
        return prior;
      }
    }
    await this.repo.put(attendanceToItem(record));
    return record;
  }

  async getForDay(tenantId: string, day: string): Promise<AttendanceRecord[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: `${ENTITY.ATTENDANCE}#${day}#`,
    });
    return items.map(attendanceFromItem);
  }
}
