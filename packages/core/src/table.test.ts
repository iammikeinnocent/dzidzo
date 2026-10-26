import { describe, expect, it } from 'vitest';
import {
  attendanceKey,
  classRosterKey,
  classKey,
  expenseKey,
  guardianKey,
  guardianPhoneKey,
  learnerKey,
  payrollKey,
  paymentKey,
  tableNameFor,
  tenantPk,
  userKey,
} from './table';

describe('single-table key builders', () => {
  it('builds tenant-partitioned keys', () => {
    expect(tenantPk('t1')).toBe('TENANT#t1');
    expect(learnerKey('t1', 'l1')).toEqual({ pk: 'TENANT#t1', sk: 'LEARNER#l1' });
    expect(userKey('t1', 'u1')).toEqual({ pk: 'TENANT#t1', sk: 'USER#u1' });
    expect(classKey('t1', 'c1')).toEqual({ pk: 'TENANT#t1', sk: 'CLASS#c1' });
    expect(guardianKey('t1', 'g1')).toEqual({ pk: 'TENANT#t1', sk: 'GUARDIAN#g1' });
  });

  it('builds attendance keys with a yyyymmdd day segment', () => {
    expect(attendanceKey('t1', '20260105', 'l1')).toEqual({
      pk: 'TENANT#t1',
      sk: 'ATTENDANCE#20260105#l1',
    });
  });

  it('builds payroll and expense keys with calendar segments', () => {
    expect(payrollKey('t1', '202601')).toEqual({ pk: 'TENANT#t1', sk: 'PAYROLL#202601' });
    expect(expenseKey('t1', '20260105', 'e1')).toEqual({
      pk: 'TENANT#t1',
      sk: 'EXPENSE#20260105#e1',
    });
    expect(paymentKey('t1', '202601', 'p1')).toEqual({
      pk: 'TENANT#t1',
      sk: 'PAYMENT#202601#p1',
    });
  });

  it('builds the class-roster GSI key from learner name', () => {
    expect(classRosterKey('t1', 'c1', 'Tendai Moyo')).toEqual({
      gsi1pk: 'TENANT#t1#CLASS#c1',
      gsi1sk: 'Tendai Moyo',
    });
  });

  it('builds the guardian-phone GSI key', () => {
    expect(guardianPhoneKey('t1', '+263771234567')).toEqual({
      gsi2pk: 'TENANT#t1#PHONE#+263771234567',
    });
  });

  it('rejects empty identifiers', () => {
    expect(() => learnerKey('t1', '')).toThrow(/learnerId/);
    expect(() => tenantPk('  ')).toThrow(/tenantId/);
  });

  it('rejects badly formatted calendar segments', () => {
    expect(() => attendanceKey('t1', '2026-01-05', 'l1')).toThrow(/yyyymmdd/);
    expect(() => payrollKey('t1', '2026-1')).toThrow(/yyyymm/);
  });

  it('derives the table name from the stage', () => {
    expect(tableNameFor('dev')).toBe('dzidzo-dev-main');
    expect(tableNameFor('local')).toBe('dzidzo-local-main');
  });
});
