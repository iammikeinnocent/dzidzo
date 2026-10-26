import type { UserRole } from './roles';

export interface AuthContext {
  /** The active school for this request (overridable via X-Tenant-Id). */
  tenantId: string;
  /** Every school this staff member can act in. */
  tenantIds: string[];
  userId: string;
  role: UserRole;
}

/**
 * Parses a comma-separated tenant-list claim. Falls back to a single-element
 * list containing the active tenant — single-school staff need no extra
 * attribute to work.
 */
export function parseTenantList(value: unknown, fallbackTenantId: string): string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return [fallbackTenantId];
  }
  const list = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return list.length > 0 ? list : [fallbackTenantId];
}