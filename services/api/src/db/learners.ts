import {
  classRosterKey,
  classRosterPartition,
  ENTITY,
  GSI_CLASS_ROSTER,
  learnerKey,
  tenantPk,
  type Learner,
  type LearnerCreateInput,
  type LearnerUpdateInput,
} from '@dzidzo/core';
import { DataIntegrityError, type SingleTableRepository, type TableItem } from './repository';

export function learnerName(learner: Pick<Learner, 'firstName' | 'lastName'>): string {
  return `${learner.firstName} ${learner.lastName}`.trim();
}

export function learnerToItem(learner: Learner): TableItem {
  const key = learnerKey(learner.tenantId, learner.learnerId);
  const item: TableItem = {
    entityType: ENTITY.LEARNER,
    pk: key.pk,
    sk: key.sk,
    tenantId: learner.tenantId,
    learnerId: learner.learnerId,
    firstName: learner.firstName,
    lastName: learner.lastName,
    createdAt: learner.createdAt,
    updatedAt: learner.updatedAt,
  };
  if (learner.gender !== undefined) {
    item.gender = learner.gender;
  }
  if (learner.avatarKey !== undefined) {
    item.avatarKey = learner.avatarKey;
  }
  if (learner.dateOfBirth !== undefined) {
    item.dateOfBirth = learner.dateOfBirth;
  }
  if (learner.enrolmentDate !== undefined) {
    item.enrolmentDate = learner.enrolmentDate;
  }
  if (learner.classId !== undefined && learner.classId !== '') {
    item.classId = learner.classId;
    const gsi = classRosterKey(learner.tenantId, learner.classId, learnerName(learner));
    item.gsi1pk = gsi.gsi1pk;
    item.gsi1sk = gsi.gsi1sk;
  }
  return item;
}

function asString(item: TableItem, field: string): string {
  const value = item[field];
  if (typeof value !== 'string') {
    throw new DataIntegrityError(`learner item missing string field "${field}"`);
  }
  return value;
}

export function learnerFromItem(item: TableItem): Learner {
  if (item.entityType !== ENTITY.LEARNER) {
    throw new DataIntegrityError('item is not a learner');
  }
  const learner: Learner = {
    tenantId: asString(item, 'tenantId'),
    learnerId: asString(item, 'learnerId'),
    firstName: asString(item, 'firstName'),
    lastName: asString(item, 'lastName'),
    createdAt: asString(item, 'createdAt'),
    updatedAt: asString(item, 'updatedAt'),
  };
  if (typeof item.dateOfBirth === 'string') {
    learner.dateOfBirth = item.dateOfBirth;
  }
  if (item.gender === 'F' || item.gender === 'M' || item.gender === 'other') {
    learner.gender = item.gender;
  }
  if (typeof item.avatarKey === 'string' && item.avatarKey !== '') {
    learner.avatarKey = item.avatarKey;
  }
  if (typeof item.enrolmentDate === 'string') {
    learner.enrolmentDate = item.enrolmentDate;
  }
  if (typeof item.classId === 'string' && item.classId !== '') {
    learner.classId = item.classId;
  }
  return learner;
}

export class LearnerRepository {
  constructor(private readonly repo: SingleTableRepository) {}

  async create(tenantId: string, input: LearnerCreateInput): Promise<Learner> {
    const now = new Date().toISOString();
    const learner: Learner = {
      learnerId: crypto.randomUUID(),
      tenantId,
      firstName: input.firstName,
      lastName: input.lastName,
      createdAt: now,
      updatedAt: now,
    };
    if (input.dateOfBirth !== undefined) {
      learner.dateOfBirth = input.dateOfBirth;
    }
    if (input.gender !== undefined) {
      learner.gender = input.gender;
    }
    if (input.avatarKey !== undefined) {
      learner.avatarKey = input.avatarKey;
    }
    if (input.enrolmentDate !== undefined) {
      learner.enrolmentDate = input.enrolmentDate;
    }
    if (input.classId !== undefined) {
      learner.classId = input.classId;
    }
    await this.repo.put(learnerToItem(learner));
    return learner;
  }

  async get(tenantId: string, learnerId: string): Promise<Learner | undefined> {
    const item = await this.repo.get(learnerKey(tenantId, learnerId));
    return item ? learnerFromItem(item) : undefined;
  }

  /** Last-write-wins merge — the same semantics the offline sync protocol uses. */
  async update(tenantId: string, learnerId: string, patch: LearnerUpdateInput): Promise<Learner | undefined> {
    const existing = await this.get(tenantId, learnerId);
    if (!existing) {
      return undefined;
    }
    const updated: Learner = { ...existing, updatedAt: new Date().toISOString() };
    if (patch.firstName !== undefined) {
      updated.firstName = patch.firstName;
    }
    if (patch.lastName !== undefined) {
      updated.lastName = patch.lastName;
    }
    if (patch.dateOfBirth !== undefined) {
      updated.dateOfBirth = patch.dateOfBirth;
    }
    if (patch.gender !== undefined) {
      updated.gender = patch.gender;
    }
    if (patch.avatarKey !== undefined) {
      updated.avatarKey = patch.avatarKey;
    }
    if (patch.enrolmentDate !== undefined) {
      updated.enrolmentDate = patch.enrolmentDate;
    }
    if (patch.classId !== undefined) {
      updated.classId = patch.classId;
    }
    await this.repo.put(learnerToItem(updated));
    return updated;
  }

  async remove(tenantId: string, learnerId: string): Promise<void> {
    await this.repo.delete(learnerKey(tenantId, learnerId));
  }

  /**
   * Sync-path upsert: the learner id comes from the client (its outbox
   * entityId) and last-write-wins decides whether the snapshot lands.
   */
  async syncUpsert(
    tenantId: string,
    learnerId: string,
    input: LearnerCreateInput,
    clientUpdatedAt: string,
  ): Promise<'applied' | 'skipped'> {
    const existing = await this.get(tenantId, learnerId);
    if (existing && existing.updatedAt >= clientUpdatedAt) {
      return 'skipped';
    }
    const learner: Learner = {
      learnerId,
      tenantId,
      firstName: input.firstName,
      lastName: input.lastName,
      createdAt: existing?.createdAt ?? clientUpdatedAt,
      updatedAt: clientUpdatedAt,
    };
    if (input.dateOfBirth !== undefined) {
      learner.dateOfBirth = input.dateOfBirth;
    }
    if (input.gender !== undefined) {
      learner.gender = input.gender;
    }
    if (input.avatarKey !== undefined) {
      learner.avatarKey = input.avatarKey;
    }
    if (input.enrolmentDate !== undefined) {
      learner.enrolmentDate = input.enrolmentDate;
    }
    if (input.classId !== undefined) {
      learner.classId = input.classId;
    }
    await this.repo.put(learnerToItem(learner));
    return 'applied';
  }

  async listByClass(tenantId: string, classId: string): Promise<Learner[]> {
    const items = await this.repo.query(classRosterPartition(tenantId, classId), {
      indexName: GSI_CLASS_ROSTER,
    });
    return items.map(learnerFromItem);
  }

  /** Every learner in the tenant — tenant-partition query, same pattern as the guardians lookup. */
  async listAll(tenantId: string): Promise<Learner[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: `${ENTITY.LEARNER}#`,
    });
    return items.map(learnerFromItem);
  }
}
