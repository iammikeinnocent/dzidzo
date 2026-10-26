import { describe, expect, it } from 'vitest';
import { ageFrom } from './age';

describe('ageFrom', () => {
  it('computes completed years from the date of birth', () => {
    expect(ageFrom('2021-03-14', new Date(Date.UTC(2026, 9, 20)))).toBe(5);
    expect(ageFrom('2020-10-01', new Date(Date.UTC(2026, 9, 20)))).toBe(6);
  });

  it('does not count the birthday until it happens', () => {
    // 6th birthday is tomorrow
    expect(ageFrom('2020-10-21', new Date(Date.UTC(2026, 9, 20)))).toBe(5);
    expect(ageFrom('2020-10-20', new Date(Date.UTC(2026, 9, 20)))).toBe(6);
  });

  it('returns null for missing, malformed or impossible dates', () => {
    expect(ageFrom(undefined)).toBeNull();
    expect(ageFrom('')).toBeNull();
    expect(ageFrom('2021-13-40')).toBeNull();
    expect(ageFrom('not-a-date')).toBeNull();
    // 31 Feb does not exist
    expect(ageFrom('2021-02-31')).toBeNull();
  });

  it('returns null for future dates of birth', () => {
    expect(ageFrom('2099-01-01', new Date(Date.UTC(2026, 9, 20)))).toBeNull();
  });
});