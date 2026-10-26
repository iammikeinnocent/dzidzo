import { describe, expect, it } from 'vitest';
import { isUserRole, parseRoleFromGroups, rolesFromGroups, USER_ROLES } from './roles';

describe('role parsing from Cognito groups', () => {
  it('knows exactly three roles', () => {
    expect(USER_ROLES).toEqual(['director', 'manager', 'teacher']);
  });

  it('extracts a role from group membership', () => {
    expect(parseRoleFromGroups(['teacher'])).toBe('teacher');
    expect(parseRoleFromGroups(['manager', 'something-else'])).toBe('manager');
  });

  it('ignores non-role groups', () => {
    expect(parseRoleFromGroups(['All-Staff', '2026-intake'])).toBeUndefined();
    expect(parseRoleFromGroups([])).toBeUndefined();
    expect(parseRoleFromGroups(undefined)).toBeUndefined();
    expect(parseRoleFromGroups('teacher')).toBeUndefined();
  });

  it('refuses to guess when a user sits in multiple role groups', () => {
    expect(parseRoleFromGroups(['teacher', 'manager'])).toBeUndefined();
    expect(rolesFromGroups(['teacher', 'manager', 'teacher'])).toEqual(['teacher', 'manager']);
  });

  it('validates raw values', () => {
    expect(isUserRole('director')).toBe(true);
    expect(isUserRole('Director')).toBe(false);
    expect(isUserRole(42)).toBe(false);
  });
});
