import type { EntityName } from './table';

export interface Learner {
  learnerId: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  /** ISO date, e.g. 2021-03-14 — age is always computed from this, never stored. */
  dateOfBirth?: string;
  /** F | M | other */
  gender?: 'F' | 'M' | 'other';
  /** S3 key of the avatar image in the tenant's assets prefix. */
  avatarKey?: string;
  classId?: string;
  /** ISO date */
  enrolmentDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type LearnerCreateInput = Omit<
  Learner,
  'learnerId' | 'tenantId' | 'createdAt' | 'updatedAt'
>;

export type LearnerUpdateInput = Partial<LearnerCreateInput>;

export interface Guardian {
  guardianId: string;
  tenantId: string;
  fullName: string;
  /** E.164, e.g. +263771234567 */
  phone: string;
  /** National ID / passport number */
  idNumber?: string;
  address?: string;
  /** e.g. mother, father, aunt, guardian */
  relationship?: string;
  learnerIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type GuardianCreateInput = Omit<
  Guardian,
  'guardianId' | 'tenantId' | 'createdAt' | 'updatedAt'
>;

export type GuardianUpdateInput = Partial<GuardianCreateInput>;

export interface SchoolClass {
  classId: string;
  tenantId: string;
  name: string;
  ageGroup?: string;
  createdAt: string;
  updatedAt: string;
}

export type ClassCreateInput = Omit<
  SchoolClass,
  'classId' | 'tenantId' | 'createdAt' | 'updatedAt'
>;

export interface LearnerNote {
  noteId: string;
  tenantId: string;
  learnerId: string;
  text: string;
  /** userId of the staff member who wrote it */
  authorId: string;
  createdAt: string;
}

export type LearnerNoteCreateInput = Pick<LearnerNote, 'text'>;

export interface LearnerReport {
  reportId: string;
  tenantId: string;
  learnerId: string;
  subject: string;
  /** e.g. 2026-T2 */
  term: string;
  /** grade, score or observation, e.g. 'A', '85%', 'exceeding' */
  grade: string;
  comment?: string;
  /** userId of the teacher who recorded it */
  authorId: string;
  createdAt: string;
}

export type LearnerReportCreateInput = Pick<
  LearnerReport,
  'subject' | 'term' | 'grade'
> & { comment?: string };

export interface CurriculumItem {
  itemId: string;
  tenantId: string;
  learnerId: string;
  subject: string;
  /** e.g. 2026-T2 — when it was completed */
  term?: string;
  done: boolean;
  createdAt: string;
}

export type CurriculumItemCreateInput = Pick<CurriculumItem, 'subject'> & {
  term?: string;
};

export interface LearnerCertificate {
  certificateId: string;
  tenantId: string;
  learnerId: string;
  title: string;
  /** ISO date it was awarded */
  awardedAt?: string;
  /** S3 key of the certificate file (scanned copy) */
  fileKey?: string;
  createdAt: string;
}

export type LearnerCertificateCreateInput = Pick<LearnerCertificate, 'title'> & {
  awardedAt?: string;
  fileKey?: string;
};

export interface StudyMaterial {
  materialId: string;
  tenantId: string;
  title: string;
  /** e.g. Phonics, Numeracy — free-form subject tag */
  subject?: string;
  description?: string;
  /** S3 key of the uploaded file */
  fileKey: string;
  /** userId of the teacher who uploaded it */
  authorId: string;
  createdAt: string;
}

export type StudyMaterialCreateInput = Pick<StudyMaterial, 'title' | 'fileKey'> & {
  subject?: string;
  description?: string;
};

/** Stored items carry their entity type; domain types stay clean. */
export type StoredEntityType = EntityName;
