import { z } from 'zod';
import type {
  ClassCreateInput,
  GuardianCreateInput,
  GuardianUpdateInput,
  LearnerCreateInput,
  LearnerUpdateInput,
} from './entities';
import type { ExpenseCreateInput, PaymentCreateInput } from './finance';
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

export const learnerCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  dateOfBirth: isoDate.optional(),
  gender: z.enum(['F', 'M', 'other']).optional(),
  /** S3 key returned by POST /uploads — never trust client-constructed keys for display. */
  avatarKey: z.string().trim().max(320).optional(),
  classId: z.string().trim().min(1).max(64).optional(),
  enrolmentDate: isoDate.optional(),
});

export const learnerUpdateSchema = learnerCreateSchema.partial();

export const guardianCreateSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  /** E.164, e.g. +263771234567 */
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'must be an E.164 phone number'),
  idNumber: z.string().trim().max(40).optional(),
  address: z.string().trim().max(200).optional(),
  relationship: z.string().trim().max(40).optional(),
  learnerIds: z.array(z.string().trim().min(1)).max(20).default([]),
});

export const guardianUpdateSchema = guardianCreateSchema.partial();

export const classCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  ageGroup: z.string().trim().min(1).max(30).optional(),
});

/** Body of the offline attendance mark (also the /attendance POST payload). */
export const attendanceMarkSchema = z.object({
  day: z.string().regex(/^\d{8}$/, 'must be formatted as yyyymmdd'),
  learnerId: z.string().trim().min(1).max(64),
  present: z.boolean(),
  markedBy: z.string().trim().min(1).max(64).optional(),
});

/** POST /sync body — a bounded batch of outbox items. */
export const syncRequestSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(['LEARNER', 'ATTENDANCE']),
        entityId: z.string().trim().min(1).max(128),
        operation: z.enum(['create', 'update']),
        payload: z.unknown(),
        clientUpdatedAt: z.string().datetime({ offset: true }),
      }),
    )
    .min(1)
    .max(50),
});

// ---------- finance ----------

const yyyymm = z.string().regex(/^\d{6}$/, 'must be formatted as yyyymm');
const money = z.number().min(0.01).max(1_000_000).refine(
  (value) => Math.round(value * 100) === value * 100,
  'amount must have at most two decimal places',
);

export const staffCreateSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(40),
  monthlySalary: money,
  idNumber: z.string().trim().min(1).max(40),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'must be an E.164 phone number'),
  email: z.string().trim().email('must be an email address').max(120),
  dateOfBirth: isoDate,
  address: z.string().trim().max(200).optional(),
  avatarKey: z.string().trim().max(320).optional(),
  certificates: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
});

export const staffUpdateSchema = staffCreateSchema.partial();

/** Learner notes — short teacher/staff comments. */
export const noteCreateSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

/** Learner reports — subject/term/grade records written by teachers. */
export const reportCreateSchema = z.object({
  subject: z.string().trim().min(1).max(60),
  term: z.string().trim().min(1).max(20),
  grade: z.string().trim().min(1).max(30),
  comment: z.string().trim().max(500).optional(),
});

/** Curriculum items — subjects/units a learner has covered. */
export const curriculumCreateSchema = z.object({
  subject: z.string().trim().min(1).max(60),
  term: z.string().trim().max(20).optional(),
  done: z.boolean().default(true),
});

/** Teacher study materials. */
export const materialCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).optional(),
  fileKey: z.string().trim().min(1).max(320),
});

/** Learner certificates. */
export const certificateCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  awardedAt: isoDate.optional(),
  fileKey: z.string().trim().max(320).optional(),
});

/** POST /uploads — requests a presigned PUT for the assets bucket. */
export const uploadRequestSchema = z
  .object({
    filename: z.string().trim().min(1).max(200),
    contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+/).max(120),
    kind: z.enum(['avatars', 'certificates', 'materials']).default('avatars'),
  })
  .strict();

export const expenseCreateSchema = z.object({
  day: z.string().regex(/^\d{8}$/, 'must be formatted as yyyymmdd'),
  category: z.string().trim().min(1).max(40),
  amount: money,
  note: z.string().trim().min(1).max(200).optional(),
});

export const paymentCreateSchema = z.object({
  learnerId: z.string().trim().min(1).max(64),
  month: yyyymm,
  amount: money,
  method: z.string().trim().min(1).max(30).optional(),
});

export const payrollRunSchema = z.object({
  month: yyyymm,
});

export function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'body';
    return `${path}: ${issue.message}`;
  });
}

/*
 * zod leaves optional fields typed `T | undefined`; domain inputs use exact
 * optional properties (a present key must carry a value). These mappers are
 * the boundary between the two — no undefined keys cross into the data layer,
 * on the server or in the browser.
 */

type LearnerCreateParsed = z.output<typeof learnerCreateSchema>;
type LearnerUpdateParsed = z.output<typeof learnerUpdateSchema>;
type GuardianCreateParsed = z.output<typeof guardianCreateSchema>;
type GuardianUpdateParsed = z.output<typeof guardianUpdateSchema>;
type ClassCreateParsed = z.output<typeof classCreateSchema>;
type ExpenseCreateParsed = z.output<typeof expenseCreateSchema>;
type PaymentCreateParsed = z.output<typeof paymentCreateSchema>;

export function toLearnerCreateInput(data: LearnerCreateParsed): LearnerCreateInput {
  const input: LearnerCreateInput = {
    firstName: data.firstName,
    lastName: data.lastName,
  };
  if (data.dateOfBirth !== undefined) input.dateOfBirth = data.dateOfBirth;
  if (data.classId !== undefined) input.classId = data.classId;
  if (data.enrolmentDate !== undefined) input.enrolmentDate = data.enrolmentDate;
  return input;
}

export function toLearnerUpdateInput(data: LearnerUpdateParsed): LearnerUpdateInput {
  const input: LearnerUpdateInput = {};
  if (data.firstName !== undefined) input.firstName = data.firstName;
  if (data.lastName !== undefined) input.lastName = data.lastName;
  if (data.dateOfBirth !== undefined) input.dateOfBirth = data.dateOfBirth;
  if (data.classId !== undefined) input.classId = data.classId;
  if (data.enrolmentDate !== undefined) input.enrolmentDate = data.enrolmentDate;
  return input;
}

export function toGuardianCreateInput(data: GuardianCreateParsed): GuardianCreateInput {
  return {
    fullName: data.fullName,
    phone: data.phone,
    learnerIds: data.learnerIds,
  };
}

export function toGuardianUpdateInput(data: GuardianUpdateParsed): GuardianUpdateInput {
  const input: GuardianUpdateInput = {};
  if (data.fullName !== undefined) input.fullName = data.fullName;
  if (data.phone !== undefined) input.phone = data.phone;
  if (data.learnerIds !== undefined) input.learnerIds = data.learnerIds;
  return input;
}

export function toClassCreateInput(data: ClassCreateParsed): ClassCreateInput {
  const input: ClassCreateInput = { name: data.name };
  if (data.ageGroup !== undefined) input.ageGroup = data.ageGroup;
  return input;
}

export function toExpenseCreateInput(data: ExpenseCreateParsed): ExpenseCreateInput {
  const input: ExpenseCreateInput = {
    day: data.day,
    category: data.category,
    amount: data.amount,
  };
  if (data.note !== undefined) input.note = data.note;
  return input;
}

export function toPaymentCreateInput(data: PaymentCreateParsed): PaymentCreateInput {
  const input: PaymentCreateInput = {
    learnerId: data.learnerId,
    month: data.month,
    amount: data.amount,
  };
  if (data.method !== undefined) input.method = data.method;
  return input;
}
