import type { AttendanceMark, Learner, LearnerCreateInput, OutboxItem } from '@dzidzo/core';
import { createOutboxItem, type OutboxStore } from '@dzidzo/sync';
import { attendanceKeyFor, type DzidzoLocalDb, type LocalAttendance } from './db';

/**
 * Offline-first school store: every write lands in IndexedDB immediately and
 * appends an outbox item for the idempotent batch sync. Reads fall back to
 * the local snapshot when the API is unreachable.
 */
export class OfflineSchoolStore {
  constructor(
    private readonly db: DzidzoLocalDb,
    private readonly outbox: OutboxStore,
  ) {}

  async enrolLearner(input: LearnerCreateInput): Promise<Learner> {
    const now = new Date().toISOString();
    const learner: Learner = {
      learnerId: crypto.randomUUID(),
      tenantId: 'local',
      firstName: input.firstName,
      lastName: input.lastName,
      createdAt: now,
      updatedAt: now,
    };
    if (input.dateOfBirth !== undefined) learner.dateOfBirth = input.dateOfBirth;
    if (input.enrolmentDate !== undefined) learner.enrolmentDate = input.enrolmentDate;
    if (input.classId !== undefined) learner.classId = input.classId;

    await this.db.learners.put(learner);
    await this.enqueue('LEARNER', learner.learnerId, 'create', input, now);
    return learner;
  }

  async updateLearner(learnerId: string, patch: Partial<LearnerCreateInput>): Promise<Learner | undefined> {
    const existing = await this.db.learners.get(learnerId);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    const updated: Learner = { ...existing, updatedAt: now };
    if (patch.firstName !== undefined) updated.firstName = patch.firstName;
    if (patch.lastName !== undefined) updated.lastName = patch.lastName;
    if (patch.dateOfBirth !== undefined) updated.dateOfBirth = patch.dateOfBirth;
    if (patch.enrolmentDate !== undefined) updated.enrolmentDate = patch.enrolmentDate;
    if (patch.classId !== undefined) updated.classId = patch.classId;

    await this.db.learners.put(updated);
    await this.enqueue('LEARNER', learnerId, 'update', patch, now);
    return updated;
  }

  async markAttendance(mark: AttendanceMark & { markedBy: string }): Promise<LocalAttendance> {
    const now = new Date().toISOString();
    const local: LocalAttendance = {
      key: attendanceKeyFor(mark.day, mark.learnerId),
      day: mark.day,
      learnerId: mark.learnerId,
      present: mark.present,
      updatedAt: now,
      syncedAt: null,
    };
    if (mark.markedBy !== undefined) local.markedBy = mark.markedBy;

    await this.db.attendance.put(local);
    await this.enqueue(
      'ATTENDANCE',
      `${mark.learnerId}#${mark.day}`,
      'create',
      { day: mark.day, learnerId: mark.learnerId, present: mark.present, markedBy: mark.markedBy },
      now,
    );
    return local;
  }

  /** Local snapshot of a day's register — the offline read path. */
  async attendanceForDay(day: string): Promise<LocalAttendance[]> {
    return this.db.attendance.where('day').equals(day).toArray();
  }

  /** Local roster snapshot for a class (offline read path). */
  async learnersForClass(classId: string): Promise<Learner[]> {
    return this.db.learners.where('classId').equals(classId).toArray();
  }

  async learnerCount(): Promise<number> {
    return this.db.learners.count();
  }

  private async enqueue(
    entityType: OutboxItem['entityType'],
    entityId: string,
    operation: 'create' | 'update',
    payload: unknown,
    clientUpdatedAt: string,
  ): Promise<void> {
    await this.outbox.enqueue(createOutboxItem({ entityType, entityId, operation, payload, clientUpdatedAt }));
  }
}
