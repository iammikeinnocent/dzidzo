import {
  classKey,
  ENTITY,
  tenantPk,
  tenantRegistryKey,
  type SchoolClass,
  type ClassCreateInput,
} from '@dzidzo/core';
import { DataIntegrityError, type SingleTableRepository, type TableItem } from './repository';

const SK_PREFIX = `${ENTITY.CLASS}#`;

export function classToItem(schoolClass: SchoolClass): TableItem {
  const key = classKey(schoolClass.tenantId, schoolClass.classId);
  const item: TableItem = {
    entityType: ENTITY.CLASS,
    pk: key.pk,
    sk: key.sk,
    tenantId: schoolClass.tenantId,
    classId: schoolClass.classId,
    name: schoolClass.name,
    createdAt: schoolClass.createdAt,
    updatedAt: schoolClass.updatedAt,
  };
  if (schoolClass.ageGroup !== undefined) {
    item.ageGroup = schoolClass.ageGroup;
  }
  return item;
}

function asString(item: TableItem, field: string): string {
  const value = item[field];
  if (typeof value !== 'string') {
    throw new DataIntegrityError(`class item missing string field "${field}"`);
  }
  return value;
}

export function classFromItem(item: TableItem): SchoolClass {
  if (item.entityType !== ENTITY.CLASS) {
    throw new DataIntegrityError('item is not a class');
  }
  const schoolClass: SchoolClass = {
    tenantId: asString(item, 'tenantId'),
    classId: asString(item, 'classId'),
    name: asString(item, 'name'),
    createdAt: asString(item, 'createdAt'),
    updatedAt: asString(item, 'updatedAt'),
  };
  if (typeof item.ageGroup === 'string') {
    schoolClass.ageGroup = item.ageGroup;
  }
  return schoolClass;
}

export class ClassRepository {
  constructor(private readonly repo: SingleTableRepository) {}

  async create(tenantId: string, input: ClassCreateInput): Promise<SchoolClass> {
    const now = new Date().toISOString();
    const schoolClass: SchoolClass = {
      classId: crypto.randomUUID(),
      tenantId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    if (input.ageGroup !== undefined) {
      schoolClass.ageGroup = input.ageGroup;
    }
    await this.repo.put(classToItem(schoolClass));
    // Register the tenant in the global TENANTS partition so scheduled jobs
    // (absenteeism SMS) can discover schools without a scan. Idempotent.
    const registryKey = tenantRegistryKey(tenantId);
    await this.repo.put({
      pk: registryKey.pk,
      sk: registryKey.sk,
      entityType: ENTITY.META,
      tenantId,
    });
    return schoolClass;
  }

  async get(tenantId: string, classId: string): Promise<SchoolClass | undefined> {
    const item = await this.repo.get(classKey(tenantId, classId));
    return item ? classFromItem(item) : undefined;
  }

  async list(tenantId: string): Promise<SchoolClass[]> {
    const items = await this.repo.query(tenantPk(tenantId), { skBeginsWith: SK_PREFIX });
    return items.map(classFromItem);
  }
}
