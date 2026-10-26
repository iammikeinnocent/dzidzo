/**
 * Single-table schema — the single source of truth, shared by the CDK stack
 * (infra/src/stacks/data.ts) and the data-access layer (services/api/src/db).
 *
 * PK  TENANT#<tenantId>            every entity in a tenant shares this partition
 * SK  <ENTITY>#<id>[#<sub>]        entity type prefix + id, e.g. LEARNER#l-1
 *
 * GSI1 (class roster):   gsi1pk = TENANT#<t>#CLASS#<classId>, gsi1sk = learner name
 * GSI2 (guardian phone): gsi2pk = TENANT#<t>#PHONE#<phone>
 */

export const ATTR = {
  pk: 'pk',
  sk: 'sk',
  gsi1pk: 'gsi1pk',
  gsi1sk: 'gsi1sk',
  gsi2pk: 'gsi2pk',
} as const;

export const GSI_CLASS_ROSTER = 'gsi1-class-roster';
export const GSI_GUARDIAN_PHONE = 'gsi2-guardian-phone';

export const ENTITY = {
  USER: 'USER',
  CLASS: 'CLASS',
  LEARNER: 'LEARNER',
  GUARDIAN: 'GUARDIAN',
  ATTENDANCE: 'ATTENDANCE',
  ASSESSMENT: 'ASSESSMENT',
  STAFF: 'STAFF',
  PAYROLL: 'PAYROLL',
  EXPENSE: 'EXPENSE',
  PAYMENT: 'PAYMENT',
  NOTE: 'NOTE',
  CURRICULUM: 'CURRICULUM',
  CERTIFICATE: 'CERTIFICATE',
  MATERIAL: 'MATERIAL',
  SYNC: 'SYNC',
  META: 'META',
} as const;

/** Global partition key listing every registered tenant (school). */
export const TENANTS_PARTITION = 'TENANTS';

export type EntityName = (typeof ENTITY)[keyof typeof ENTITY];

export interface PrimaryKey {
  pk: string;
  sk: string;
}

export interface ClassRosterGsiKey {
  gsi1pk: string;
  gsi1sk: string;
}

export interface GuardianPhoneGsiKey {
  gsi2pk: string;
}

function required(field: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function yyyymmdd(field: string, value: string): string {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`${field} must be formatted as yyyymmdd`);
  }
  return value;
}

function yyyymm(field: string, value: string): string {
  if (!/^\d{6}$/.test(value)) {
    throw new Error(`${field} must be formatted as yyyymm`);
  }
  return value;
}

export function tenantPk(tenantId: string): string {
  return `TENANT#${required('tenantId', tenantId)}`;
}

export function tenantRegistryKey(tenantId: string): PrimaryKey {
  return { pk: TENANTS_PARTITION, sk: `${ENTITY.META}#TENANT#${required('tenantId', tenantId)}` };
}

export function tableNameFor(stage: string): string {
  return `dzidzo-${required('stage', stage)}-main`;
}

export function userKey(tenantId: string, userId: string): PrimaryKey {
  return { pk: tenantPk(tenantId), sk: `${ENTITY.USER}#${required('userId', userId)}` };
}

export function classKey(tenantId: string, classId: string): PrimaryKey {
  return { pk: tenantPk(tenantId), sk: `${ENTITY.CLASS}#${required('classId', classId)}` };
}

export function learnerKey(tenantId: string, learnerId: string): PrimaryKey {
  return { pk: tenantPk(tenantId), sk: `${ENTITY.LEARNER}#${required('learnerId', learnerId)}` };
}

export function guardianKey(tenantId: string, guardianId: string): PrimaryKey {
  return { pk: tenantPk(tenantId), sk: `${ENTITY.GUARDIAN}#${required('guardianId', guardianId)}` };
}

export function materialKey(tenantId: string, materialId: string): PrimaryKey {
  return { pk: tenantPk(tenantId), sk: `${ENTITY.MATERIAL}#${required('materialId', materialId)}` };
}

/**
 * Learner-scoped records (notes, reports/assessments, curriculum items and
 * certificates) nest under the learner so a prefix query returns everything
 * for one child without a new GSI.
 */
export function noteKey(tenantId: string, learnerId: string, noteId: string): PrimaryKey {
  return {
    pk: tenantPk(tenantId),
    sk: `${ENTITY.NOTE}#${required('learnerId', learnerId)}#${required('noteId', noteId)}`,
  };
}

export function learnerAssessmentKey(tenantId: string, learnerId: string, assessmentId: string): PrimaryKey {
  return {
    pk: tenantPk(tenantId),
    sk: `${ENTITY.ASSESSMENT}#${required('learnerId', learnerId)}#${required('assessmentId', assessmentId)}`,
  };
}

export function curriculumKey(tenantId: string, learnerId: string, itemId: string): PrimaryKey {
  return {
    pk: tenantPk(tenantId),
    sk: `${ENTITY.CURRICULUM}#${required('learnerId', learnerId)}#${required('itemId', itemId)}`,
  };
}

export function certificateKey(tenantId: string, learnerId: string, certificateId: string): PrimaryKey {
  return {
    pk: tenantPk(tenantId),
    sk: `${ENTITY.CERTIFICATE}#${required('learnerId', learnerId)}#${required('certificateId', certificateId)}`,
  };
}

/** Learner-scoped prefix for one child's notes/reports/curriculum/certificates. */
export function learnerRecordPrefix(entity: EntityName, learnerId: string): string {
  return `${entity}#${required('learnerId', learnerId)}#`;
}

export function attendanceKey(tenantId: string, day: string, learnerId: string): PrimaryKey {
  return {
    pk: tenantPk(tenantId),
    sk: `${ENTITY.ATTENDANCE}#${yyyymmdd('day', day)}#${required('learnerId', learnerId)}`,
  };
}

export function assessmentKey(tenantId: string, assessmentId: string): PrimaryKey {
  return {
    pk: tenantPk(tenantId),
    sk: `${ENTITY.ASSESSMENT}#${required('assessmentId', assessmentId)}`,
  };
}

export function staffKey(tenantId: string, userId: string): PrimaryKey {
  return { pk: tenantPk(tenantId), sk: `${ENTITY.STAFF}#${required('userId', userId)}` };
}

export function payrollKey(tenantId: string, month: string): PrimaryKey {
  return { pk: tenantPk(tenantId), sk: `${ENTITY.PAYROLL}#${yyyymm('month', month)}` };
}

export function expenseKey(tenantId: string, day: string, expenseId: string): PrimaryKey {
  return {
    pk: tenantPk(tenantId),
    sk: `${ENTITY.EXPENSE}#${yyyymmdd('day', day)}#${required('expenseId', expenseId)}`,
  };
}

export function paymentKey(tenantId: string, month: string, paymentId: string): PrimaryKey {
  return {
    pk: tenantPk(tenantId),
    sk: `${ENTITY.PAYMENT}#${yyyymm('month', month)}#${required('paymentId', paymentId)}`,
  };
}

export function classRosterPartition(tenantId: string, classId: string): string {
  return `${tenantPk(tenantId)}#${ENTITY.CLASS}#${required('classId', classId)}`;
}

export function classRosterKey(
  tenantId: string,
  classId: string,
  learnerName: string,
): ClassRosterGsiKey {
  return {
    gsi1pk: classRosterPartition(tenantId, classId),
    gsi1sk: required('learnerName', learnerName),
  };
}

export function guardianPhonePartition(tenantId: string, phone: string): string {
  return `${tenantPk(tenantId)}#PHONE#${required('phone', phone)}`;
}

export function guardianPhoneKey(tenantId: string, phone: string): GuardianPhoneGsiKey {
  return { gsi2pk: guardianPhonePartition(tenantId, phone) };
}
