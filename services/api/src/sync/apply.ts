import {
  attendanceMarkSchema,
  hasPermission,
  learnerCreateSchema,
  toLearnerCreateInput,
  zodIssues,
  type OutboxItem,
  type SyncItemResult,
  type UserRole,
} from '@dzidzo/core';
import type { MarkInput } from '../db/attendance';

/** Per-item validation/authorisation failure — the batch continues. */
export class SyncItemRejection extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'SyncItemRejection';
  }
}

export interface SyncLearnersData {
  get(tenantId: string, learnerId: string): Promise<{ updatedAt: string } | undefined>;
  syncUpsert(
    tenantId: string,
    learnerId: string,
    input: Parameters<typeof toLearnerCreateInput>[0],
    clientUpdatedAt: string,
  ): Promise<'applied' | 'skipped'>;
}

export interface SyncAttendanceData {
  mark(tenantId: string, input: MarkInput): Promise<unknown>;
}

export interface SyncAckData {
  ackIfNew(tenantId: string, syncId: string): Promise<boolean>;
}

export interface SyncDeps {
  learners: SyncLearnersData;
  attendance: SyncAttendanceData;
  syncAck: SyncAckData;
}

/**
 * Applies one outbox item inside the caller's tenant.
 *
 * Order of operations:
 *  1. Conditional sync-ack put — replays short-circuit as `duplicate`.
 *  2. Authorise against the permission matrix (per entity type).
 *  3. Validate the payload and apply with last-write-wins.
 *  4. Write the ack AFTER a successful apply: a crash between apply and ack
 *     replays harmlessly because the LWW guard turns the second apply into a
 *     no-op. Validation rejections are reported per item so the client can
 *     drop the poison message; infrastructure failures abort the whole batch
 *     (HTTP 500) and the client retries.
 */
export async function applySyncItem(args: {
  tenantId: string;
  role: UserRole;
  item: OutboxItem;
  deps: SyncDeps;
}): Promise<SyncItemResult> {
  const { tenantId, role, item, deps } = args;

  if (!(await deps.syncAck.ackIfNew(tenantId, item.id))) {
    return { id: item.id, status: 'duplicate' };
  }

  try {
    if (item.entityType === 'ATTENDANCE') {
      if (!hasPermission(role, 'attendance:write')) {
        throw new SyncItemRejection('forbidden: attendance:write required');
      }
      const parsed = attendanceMarkSchema.safeParse(item.payload);
      if (!parsed.success) {
        throw new SyncItemRejection(`invalid attendance payload — ${zodIssues(parsed.error).join('; ')}`);
      }
      const learner = await deps.learners.get(tenantId, parsed.data.learnerId);
      if (!learner) {
        throw new SyncItemRejection(`unknown learner "${parsed.data.learnerId}"`);
      }
      const mark: MarkInput = {
        day: parsed.data.day,
        learnerId: parsed.data.learnerId,
        present: parsed.data.present,
        updatedAt: item.clientUpdatedAt,
      };
      if (parsed.data.markedBy !== undefined) {
        mark.markedBy = parsed.data.markedBy;
      }
      await deps.attendance.mark(tenantId, mark);
      return { id: item.id, status: 'applied' };
    }

    if (item.entityType === 'LEARNER') {
      if (!hasPermission(role, 'learner:write')) {
        throw new SyncItemRejection('forbidden: learner:write required');
      }
      // Sync payloads are full snapshots regardless of operation; the server
      // upserts the client-generated id with last-write-wins.
      const parsed = learnerCreateSchema.safeParse(item.payload);
      if (!parsed.success) {
        throw new SyncItemRejection(`invalid learner payload — ${zodIssues(parsed.error).join('; ')}`);
      }
      await deps.learners.syncUpsert(tenantId, item.entityId, toLearnerCreateInput(parsed.data), item.clientUpdatedAt);
      return { id: item.id, status: 'applied' };
    }

    throw new SyncItemRejection(`entity type "${String(item.entityType)}" is not syncable`);
  } catch (error) {
    if (error instanceof SyncItemRejection) {
      return { id: item.id, status: 'rejected', reason: error.reason };
    }
    throw error;
  }
}
