import {
  ENTITY,
  guardianKey,
  guardianPhoneKey,
  guardianPhonePartition,
  GSI_GUARDIAN_PHONE,
  learnerKey,
  tenantPk,
  type Guardian,
  type GuardianCreateInput,
  type GuardianUpdateInput,
} from '@dzidzo/core';
import { DataIntegrityError, type SingleTableRepository, type TableItem } from './repository';

export class UnknownLearnerError extends Error {
  constructor(public readonly learnerId: string) {
    super(`learner "${learnerId}" does not exist in this school`);
    this.name = 'UnknownLearnerError';
  }
}

export function guardianToItem(guardian: Guardian): TableItem {
  const key = guardianKey(guardian.tenantId, guardian.guardianId);
  const item: TableItem = {
    entityType: ENTITY.GUARDIAN,
    pk: key.pk,
    sk: key.sk,
    gsi2pk: guardianPhoneKey(guardian.tenantId, guardian.phone).gsi2pk,
    tenantId: guardian.tenantId,
    guardianId: guardian.guardianId,
    fullName: guardian.fullName,
    phone: guardian.phone,
    learnerIds: guardian.learnerIds,
    createdAt: guardian.createdAt,
    updatedAt: guardian.updatedAt,
  };
  if (guardian.idNumber !== undefined) {
    item.idNumber = guardian.idNumber;
  }
  if (guardian.address !== undefined) {
    item.address = guardian.address;
  }
  if (guardian.relationship !== undefined) {
    item.relationship = guardian.relationship;
  }
  return item;
}

function asString(item: TableItem, field: string): string {
  const value = item[field];
  if (typeof value !== 'string') {
    throw new DataIntegrityError(`guardian item missing string field "${field}"`);
  }
  return value;
}

export function guardianFromItem(item: TableItem): Guardian {
  if (item.entityType !== ENTITY.GUARDIAN) {
    throw new DataIntegrityError('item is not a guardian');
  }
  const learnerIds = item.learnerIds;
  const guardian: Guardian = {
    tenantId: asString(item, 'tenantId'),
    guardianId: asString(item, 'guardianId'),
    fullName: asString(item, 'fullName'),
    phone: asString(item, 'phone'),
    learnerIds: Array.isArray(learnerIds) ? (learnerIds as string[]) : [],
    createdAt: asString(item, 'createdAt'),
    updatedAt: asString(item, 'updatedAt'),
  };
  if (typeof item.idNumber === 'string' && item.idNumber !== '') {
    guardian.idNumber = item.idNumber;
  }
  if (typeof item.address === 'string' && item.address !== '') {
    guardian.address = item.address;
  }
  if (typeof item.relationship === 'string' && item.relationship !== '') {
    guardian.relationship = item.relationship;
  }
  return guardian;
}

export class GuardianRepository {
  constructor(private readonly repo: SingleTableRepository) {}

  /** Validates that every referenced learner exists in the same tenant. */
  async create(tenantId: string, input: GuardianCreateInput): Promise<Guardian> {
    await this.assertLearnersExist(tenantId, input.learnerIds);
    const now = new Date().toISOString();
    const guardian: Guardian = {
      guardianId: crypto.randomUUID(),
      tenantId,
      fullName: input.fullName,
      phone: input.phone,
      learnerIds: input.learnerIds,
      createdAt: now,
      updatedAt: now,
    };
    if (input.idNumber !== undefined) {
      guardian.idNumber = input.idNumber;
    }
    if (input.address !== undefined) {
      guardian.address = input.address;
    }
    if (input.relationship !== undefined) {
      guardian.relationship = input.relationship;
    }
    await this.repo.put(guardianToItem(guardian));
    return guardian;
  }

  async get(tenantId: string, guardianId: string): Promise<Guardian | undefined> {
    const item = await this.repo.get(guardianKey(tenantId, guardianId));
    return item ? guardianFromItem(item) : undefined;
  }

  async update(tenantId: string, guardianId: string, patch: GuardianUpdateInput): Promise<Guardian | undefined> {
    const existing = await this.get(tenantId, guardianId);
    if (!existing) {
      return undefined;
    }
    if (patch.learnerIds !== undefined) {
      await this.assertLearnersExist(tenantId, patch.learnerIds);
    }
    const updated: Guardian = { ...existing, updatedAt: new Date().toISOString() };
    if (patch.fullName !== undefined) {
      updated.fullName = patch.fullName;
    }
    if (patch.idNumber !== undefined) {
      updated.idNumber = patch.idNumber;
    }
    if (patch.address !== undefined) {
      updated.address = patch.address;
    }
    if (patch.relationship !== undefined) {
      updated.relationship = patch.relationship;
    }
    if (patch.phone !== undefined) {
      updated.phone = patch.phone;
    }
    if (patch.learnerIds !== undefined) {
      updated.learnerIds = patch.learnerIds;
    }
    await this.repo.put(guardianToItem(updated));
    return updated;
  }

  async remove(tenantId: string, guardianId: string): Promise<void> {
    await this.repo.delete(guardianKey(tenantId, guardianId));
  }

  /** Phone lookup for SMS targeting (absenteeism alerts). */
  async findByPhone(tenantId: string, phone: string): Promise<Guardian[]> {
    const items = await this.repo.query(guardianPhonePartition(tenantId, phone), {
      indexName: GSI_GUARDIAN_PHONE,
    });
    return items.map(guardianFromItem);
  }

  /**
   * Guardians linked to a learner. Scans the tenant partition filtered by the
   * learnerIds list — correct and cheap at ECD scale (tens of guardians per
   * school); a GSI becomes worthwhile only if this becomes a hot path.
   */
  async listByLearner(tenantId: string, learnerId: string): Promise<Guardian[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: `${ENTITY.GUARDIAN}#`,
      filter: {
        expression: 'contains(learnerIds, :learnerId)',
        values: { ':learnerId': learnerId },
      },
    });
    return items.map(guardianFromItem);
  }

  private async assertLearnersExist(tenantId: string, learnerIds: string[]): Promise<void> {
    for (const learnerId of learnerIds) {
      const item = await this.repo.get(learnerKey(tenantId, learnerId));
      if (!item) {
        throw new UnknownLearnerError(learnerId);
      }
    }
  }
}
