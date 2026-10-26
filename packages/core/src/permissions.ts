import type { UserRole } from './roles';

/**
 * Every capability the API can guard. Convention: "<resource>:<action>".
 * Keep this list closed — a new capability means a matrix decision, not an ad-hoc check.
 */
export const ALL_PERMISSIONS = [
  'attendance:write',
  'assessment:write',
  'learner:write',
  'learner:delete',
  'guardian:write',
  'class:write',
  'materials:write',
  'payments:log',
  'reports:read',
  'finance:read',
  'finance:write',
  'user:manage',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/**
 * Permission matrix — the single source of truth, shared by the API middleware
 * and the web route guards. Teachers teach and run the classroom day-to-day
 * (attendance, assessments, enrolling learners, guardians and classes, reading
 * rosters and reports, logging fee payments). Removing records is
 * manager-and-up: teachers cannot delete anything, and money visibility is
 * manager-and-up (they log payments without seeing histories or totals).
 */
const TEACHER: readonly Permission[] = [
  'attendance:write',
  'assessment:write',
  'learner:write',
  'guardian:write',
  'class:write',
  'materials:write',
  'payments:log',
  'reports:read',
];

const MANAGER: readonly Permission[] = [...TEACHER, 'learner:delete', 'finance:read'];

const DIRECTOR: readonly Permission[] = [...MANAGER, 'finance:write', 'user:manage'];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  teacher: TEACHER,
  manager: MANAGER,
  director: DIRECTOR,
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
