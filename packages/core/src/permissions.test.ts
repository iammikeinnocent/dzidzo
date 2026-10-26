import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, hasPermission, ROLE_PERMISSIONS } from './permissions';

describe('role permission matrix', () => {
  it('teachers can record attendance and assessments for their class', () => {
    expect(hasPermission('teacher', 'attendance:write')).toBe(true);
    expect(hasPermission('teacher', 'assessment:write')).toBe(true);
  });

  it('teachers run the classroom: enrolment, guardians, classes, reports and materials', () => {
    expect(hasPermission('teacher', 'learner:write')).toBe(true);
    expect(hasPermission('teacher', 'guardian:write')).toBe(true);
    expect(hasPermission('teacher', 'class:write')).toBe(true);
    expect(hasPermission('teacher', 'reports:read')).toBe(true);
    expect(hasPermission('teacher', 'materials:write')).toBe(true);
  });

  it('teachers cannot delete anything or touch finance and users', () => {
    expect(hasPermission('teacher', 'learner:delete')).toBe(false);
    expect(hasPermission('teacher', 'finance:read')).toBe(false);
    expect(hasPermission('teacher', 'finance:write')).toBe(false);
    expect(hasPermission('teacher', 'user:manage')).toBe(false);
  });

  it('managers run the school: everything teachers do, plus record deletion and read-only finance', () => {
    expect(hasPermission('manager', 'learner:write')).toBe(true);
    expect(hasPermission('manager', 'guardian:write')).toBe(true);
    expect(hasPermission('manager', 'class:write')).toBe(true);
    expect(hasPermission('manager', 'reports:read')).toBe(true);
    expect(hasPermission('manager', 'learner:delete')).toBe(true);
    expect(hasPermission('manager', 'finance:read')).toBe(true);
  });

  it('managers cannot change money or manage users', () => {
    expect(hasPermission('manager', 'finance:write')).toBe(false);
    expect(hasPermission('manager', 'user:manage')).toBe(false);
  });

  it('directors have every permission', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission('director', permission)).toBe(true);
    }
  });

  it('every role has a defined permission set', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(['director', 'manager', 'teacher']);
  });
});