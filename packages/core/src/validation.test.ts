import { describe, expect, it } from 'vitest';
import {
  classCreateSchema,
  guardianCreateSchema,
  learnerCreateSchema,
  toClassCreateInput,
  toGuardianCreateInput,
  toLearnerCreateInput,
  zodIssues,
} from './validation';

describe('shared validation schemas', () => {
  it('accepts a valid learner payload', () => {
    const parsed = learnerCreateSchema.safeParse({
      firstName: 'Tendai',
      lastName: 'Moyo',
      dateOfBirth: '2021-03-14',
      classId: 'c1',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects bad dates and empty names with readable issues', () => {
    const parsed = learnerCreateSchema.safeParse({
      firstName: '',
      lastName: 'Moyo',
      dateOfBirth: '2021/03/14',
    });
    if (parsed.success) {
      throw new Error('expected validation failure');
    }
    const issues = zodIssues(parsed.error);
    expect(issues.some((i) => i.includes('firstName'))).toBe(true);
    expect(issues.some((i) => i.includes('dateOfBirth') && i.includes('ISO'))).toBe(true);
  });

  it('requires E.164 phone numbers for guardians', () => {
    expect(guardianCreateSchema.safeParse({ fullName: 'MaDube', phone: '0771234567' }).success).toBe(false);
    expect(guardianCreateSchema.safeParse({ fullName: 'MaDube', phone: '+263771234567' }).success).toBe(true);
  });

  it('defaults guardian learnerIds to an empty list', () => {
    const parsed = guardianCreateSchema.parse({ fullName: 'MaDube', phone: '+263771234567' });
    expect(parsed.learnerIds).toEqual([]);
  });

  it('validates class payloads', () => {
    expect(classCreateSchema.safeParse({ name: 'ECD A', ageGroup: '4-5 years' }).success).toBe(true);
    expect(classCreateSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('mappers strip undefined optional keys', () => {
    const input = toLearnerCreateInput(
      learnerCreateSchema.parse({ firstName: 'A', lastName: 'B' }),
    );
    expect(Object.keys(input).sort()).toEqual(['firstName', 'lastName']);

    const guardian = toGuardianCreateInput(
      guardianCreateSchema.parse({ fullName: 'R', phone: '+263771234567' }),
    );
    expect(guardian.learnerIds).toEqual([]);

    const klass = toClassCreateInput(classCreateSchema.parse({ name: 'ECD A' }));
    expect(Object.keys(klass)).toEqual(['name']);
  });
});
