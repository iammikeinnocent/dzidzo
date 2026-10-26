export type { UserRole } from './roles';
export { isUserRole, parseRoleFromGroups, rolesFromGroups, USER_ROLES } from './roles';
export { ageFrom } from './age';
export type { AuthContext } from './auth-context';
export { parseTenantList } from './auth-context';
export { ALL_PERMISSIONS, hasPermission, ROLE_PERMISSIONS } from './permissions';
export type { Permission } from './permissions';
export {
  ATTR,
  assessmentKey,
  attendanceKey,
  certificateKey,
  classKey,
  classRosterKey,
  classRosterPartition,
  curriculumKey,
  ENTITY,
  expenseKey,
  guardianKey,
  guardianPhoneKey,
  guardianPhonePartition,
  GSI_CLASS_ROSTER,
  GSI_GUARDIAN_PHONE,
  learnerAssessmentKey,
  learnerKey,
  learnerRecordPrefix,
  materialKey,
  noteKey,
  payrollKey,
  paymentKey,
  staffKey,
  tableNameFor,
  tenantPk,
  tenantRegistryKey,
  TENANTS_PARTITION,
  userKey,
} from './table';
export type {
  ClassRosterGsiKey,
  EntityName,
  GuardianPhoneGsiKey,
  PrimaryKey,
} from './table';
export type {
  ClassCreateInput,
  Guardian,
  GuardianCreateInput,
  GuardianUpdateInput,
  Learner,
  LearnerCreateInput,
  LearnerUpdateInput,
  SchoolClass,
} from './entities';
export type {
  CurriculumItem,
  StudyMaterial,
  StudyMaterialCreateInput,

  CurriculumItemCreateInput,
  LearnerCertificate,
  LearnerCertificateCreateInput,
  LearnerNote,
  LearnerNoteCreateInput,
  LearnerReport,
  LearnerReportCreateInput,
} from './entities';
export {
  certificateCreateSchema,
  curriculumCreateSchema,
  materialCreateSchema,
  noteCreateSchema,
  reportCreateSchema,
} from './validation';
export type { AttendanceRecord } from './attendance';
export { SYNC_PROTOCOL_VERSION, SYNCABLE_ENTITIES } from './sync';
export type {
  AttendanceMark,
  OutboxItem,
  OutboxOperation,
  SyncItemResult,
  SyncItemStatus,
  SyncRequest,
  SyncResponse,
  SyncableEntity,
} from './sync';
export { computePayroll, SIMPLIFIED_PAYE_RULES_2026 } from './payroll';
export type { PayeBand, PayrollComputation, PayrollRules } from './payroll';
export type {
  Expense,
  FeePayment,
  MonthSummary,
  PayrollLine,
  PayrollRun,
  StaffMember,
} from './finance';
export { summarizeMonth } from './finance';
export {
  attendanceMarkSchema,
  classCreateSchema,
  expenseCreateSchema,
  guardianCreateSchema,
  guardianUpdateSchema,
  learnerCreateSchema,
  learnerUpdateSchema,
  paymentCreateSchema,
  payrollRunSchema,
  staffCreateSchema,
  staffUpdateSchema,
  syncRequestSchema,
  uploadRequestSchema,
  toClassCreateInput,
  toExpenseCreateInput,
  toGuardianCreateInput,
  toGuardianUpdateInput,
  toLearnerCreateInput,
  toLearnerUpdateInput,
  toPaymentCreateInput,
  zodIssues,
} from './validation';
export type { ExpenseCreateInput, PaymentCreateInput } from './finance';
