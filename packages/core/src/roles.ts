export type UserRole = 'director' | 'manager' | 'teacher';

export const USER_ROLES: readonly UserRole[] = ['director', 'manager', 'teacher'];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Extracts role assignments from Cognito group membership.
 * Returns every distinct role found so callers can enforce exactly-one
 * (a user in two role groups is a provisioning error, not a privilege union).
 */
export function rolesFromGroups(groups: unknown): UserRole[] {
  if (!Array.isArray(groups)) {
    return [];
  }
  return [...new Set(groups.filter(isUserRole))];
}

/** The single role for a user, or undefined when unassigned or ambiguous. */
export function parseRoleFromGroups(groups: unknown): UserRole | undefined {
  const roles = rolesFromGroups(groups);
  return roles.length === 1 ? roles[0] : undefined;
}
