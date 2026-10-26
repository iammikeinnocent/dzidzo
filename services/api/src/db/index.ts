import type {
  AttendanceRecord,
  ClassCreateInput,
  CurriculumItem,
  Expense,
  FeePayment,
  Guardian,
  GuardianCreateInput,
  GuardianUpdateInput,
  Learner,
  LearnerCertificate,
  LearnerCertificateCreateInput,
  LearnerCreateInput,
  LearnerNote,
  LearnerNoteCreateInput,
  LearnerReport,
  LearnerReportCreateInput,
  LearnerUpdateInput,
  PayrollRun,
  SchoolClass,
  StaffMember,
  StudyMaterial,
  StudyMaterialCreateInput,
} from '@dzidzo/core';
import { createDocumentClient, dbConfigFromEnv, type DbConfig } from './client';
import { NoteRepository } from './notes';
import { ProgressRepository } from './progress';
import {
  AttendanceRepository,
  type MarkInput,
} from './attendance';
import { ClassRepository } from './classes';
import {
  ExpenseRepository,
  PaymentRepository,
  PayrollRepository,
  StaffRepository,
} from './finance';
import { GuardianRepository } from './guardians';
import { LearnerRepository } from './learners';
import { MaterialRepository } from './materials';
import { SingleTableRepository } from './repository';

export { DataIntegrityError } from './repository';
export { dbConfigFromEnv, createDocumentClient, type DbConfig } from './client';
export {
  AttendanceRepository,
  attendanceFromItem,
  attendanceToItem,
  type MarkInput,
} from './attendance';
export {
  classFromItem,
  ClassRepository,
  classToItem,
} from './classes';
export {
  guardianFromItem,
  GuardianRepository,
  guardianToItem,
} from './guardians';
export {
  learnerFromItem,
  LearnerRepository,
  learnerName,
  learnerToItem,
} from './learners';
export { UnknownLearnerError } from './guardians';
export {
  ExpenseRepository,
  expenseFromItem,
  PaymentRepository,
  paymentFromItem,
  PayrollRepository,
  StaffRepository,
  staffFromItem,
} from './finance';
export {
  SingleTableRepository,
  type QueryFilter,
  type QueryOptions,
  type TableItem,
} from './repository';

export interface MaterialsData {
  create(tenantId: string, input: StudyMaterialCreateInput, authorId: string): Promise<StudyMaterial>;
  list(tenantId: string): Promise<StudyMaterial[]>;
  remove(tenantId: string, materialId: string): Promise<void>;
}

export interface NotesData {
  create(
    tenantId: string,
    learnerId: string,
    input: LearnerNoteCreateInput,
    authorId: string,
  ): Promise<LearnerNote>;
  listByLearner(tenantId: string, learnerId: string): Promise<LearnerNote[]>;
  remove(tenantId: string, learnerId: string, noteId: string): Promise<void>;
}

export interface ProgressData {
  createReport(
    tenantId: string,
    learnerId: string,
    input: LearnerReportCreateInput,
    authorId: string,
  ): Promise<LearnerReport>;
  listReports(tenantId: string, learnerId: string): Promise<LearnerReport[]>;
  addCurriculumItem(
    tenantId: string,
    learnerId: string,
    input: { subject: string; term?: string; done: boolean },
  ): Promise<CurriculumItem>;
  listCurriculum(tenantId: string, learnerId: string): Promise<CurriculumItem[]>;
  createCertificate(
    tenantId: string,
    learnerId: string,
    input: LearnerCertificateCreateInput,
  ): Promise<LearnerCertificate>;
  listCertificates(tenantId: string, learnerId: string): Promise<LearnerCertificate[]>;
}

/** Director-editable staff fields (user:manage); salary included. */
export type StaffMemberPatch = Partial<{
  fullName: string;
  role: string;
  monthlySalary: number;
  idNumber: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  address: string;
  avatarKey: string;
  certificates: string[];
}>;

export interface FinanceData {
  staff: {
    create(
      tenantId: string,
      input: {
        fullName: string;
        role: string;
        monthlySalary: number;
        idNumber: string;
        phone: string;
        email: string;
        dateOfBirth: string;
        address?: string;
        avatarKey?: string;
        certificates?: string[];
      },
    ): Promise<StaffMember>;
    update(tenantId: string, staffId: string, patch: StaffMemberPatch): Promise<StaffMember | undefined>;
    list(tenantId: string): Promise<StaffMember[]>;
  };
  payroll: {
    run(tenantId: string, month: string): Promise<PayrollRun>;
    get(tenantId: string, month: string): Promise<PayrollRun | undefined>;
  };
  expenses: {
    create(tenantId: string, input: { day: string; category: string; amount: number; note?: string }): Promise<Expense>;
    listForMonth(tenantId: string, month: string): Promise<Expense[]>;
  };
  payments: {
    create(tenantId: string, input: { learnerId: string; month: string; amount: number; method?: string }): Promise<FeePayment>;
    listForMonth(tenantId: string, month: string): Promise<FeePayment[]>;
    listForLearner(tenantId: string, learnerId: string): Promise<FeePayment[]>;
  };
}

/** What the routes need — satisfied by the repositories and by test fakes alike. */
export interface LearnersData {
  create(tenantId: string, input: LearnerCreateInput): Promise<Learner>;
  get(tenantId: string, learnerId: string): Promise<Learner | undefined>;
  update(tenantId: string, learnerId: string, patch: LearnerUpdateInput): Promise<Learner | undefined>;
  remove(tenantId: string, learnerId: string): Promise<void>;
  listByClass(tenantId: string, classId: string): Promise<Learner[]>;
  listAll(tenantId: string): Promise<Learner[]>;
  syncUpsert(tenantId: string, learnerId: string, input: LearnerCreateInput, clientUpdatedAt: string): Promise<'applied' | 'skipped'>;
}

export interface GuardiansData {
  create(tenantId: string, input: GuardianCreateInput): Promise<Guardian>;
  get(tenantId: string, guardianId: string): Promise<Guardian | undefined>;
  update(tenantId: string, guardianId: string, patch: GuardianUpdateInput): Promise<Guardian | undefined>;
  findByPhone(tenantId: string, phone: string): Promise<Guardian[]>;
  listByLearner(tenantId: string, learnerId: string): Promise<Guardian[]>;
}

export interface ClassesData {
  create(tenantId: string, input: ClassCreateInput): Promise<SchoolClass>;
  get(tenantId: string, classId: string): Promise<SchoolClass | undefined>;
  list(tenantId: string): Promise<SchoolClass[]>;
}

export interface AttendanceData {
  mark(tenantId: string, input: MarkInput): Promise<AttendanceRecord>;
  getForDay(tenantId: string, day: string): Promise<AttendanceRecord[]>;
}

export interface SyncAckData {
  ackIfNew(tenantId: string, syncId: string): Promise<boolean>;
}

export interface ApiData {
  learners: LearnersData;
  materials: MaterialsData;
  notes: NotesData;
  progress: ProgressData;
  guardians: GuardiansData;
  classes: ClassesData;
  attendance: AttendanceData;
  syncAck: SyncAckData;
  finance: FinanceData;
}

export function createDb(config: DbConfig = dbConfigFromEnv()): ApiData {
  const repo = new SingleTableRepository(createDocumentClient(config), config.tableName);
  return {
    learners: new LearnerRepository(repo),
    guardians: new GuardianRepository(repo),
    classes: new ClassRepository(repo),
    attendance: new AttendanceRepository(repo),
    materials: new MaterialRepository(repo),
    notes: new NoteRepository(repo),
    progress: new ProgressRepository(repo),
    syncAck: repo,
    finance: {
      staff: new StaffRepository(repo),
      payroll: new PayrollRepository(repo),
      expenses: new ExpenseRepository(repo),
      payments: new PaymentRepository(repo),
    },
  };
}
