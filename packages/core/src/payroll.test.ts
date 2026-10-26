import { describe, expect, it } from 'vitest';
import { computePayroll, SIMPLIFIED_PAYE_RULES_2026 } from './payroll';

describe('payroll engine (simplified 2026 rules)', () => {
  it('produces no deductions for earnings inside the tax-free band', () => {
    const result = computePayroll(400, SIMPLIFIED_PAYE_RULES_2026);
    expect(result.paye).toBe(0);
    expect(result.nssa).toBe(18); // 400 * 4.5%
    expect(result.aidsLevy).toBe(0);
    expect(result.net).toBe(382);
  });

  it('applies marginal bands across boundaries', () => {
    // 2500 gross: NSSA 4.5% capped at 1780 → 80.10; taxable 2419.90
    // PAYE: first 500 free; next 1000 at 20% = 200; remaining 919.90 at 25% = 229.98
    const result = computePayroll(2500, SIMPLIFIED_PAYE_RULES_2026);
    expect(result.nssa).toBe(80.1);
    expect(result.taxable).toBe(2419.9);
    expect(result.paye).toBeCloseTo(429.98, 2);
    expect(result.aidsLevy).toBeCloseTo(12.9, 2);
    expect(result.net).toBeCloseTo(2500 - 429.98 - 80.1 - 12.9, 2);
  });

  it('caps the NSSA contribution at the insurable cap', () => {
    const result = computePayroll(5000, SIMPLIFIED_PAYE_RULES_2026);
    expect(result.nssa).toBe(80.1); // 1780 * 4.5%, not 5000 * 4.5%
  });

  it('never returns negative net and keeps two-decimal money', () => {
    const result = computePayroll(0, SIMPLIFIED_PAYE_RULES_2026);
    expect(result.net).toBe(0);
    expect(Number.isInteger(result.paye * 100)).toBe(true);
  });

  it('rejects negative or non-finite gross', () => {
    expect(() => computePayroll(-1, SIMPLIFIED_PAYE_RULES_2026)).toThrow(/non-negative/);
    expect(() => computePayroll(Number.NaN, SIMPLIFIED_PAYE_RULES_2026)).toThrow(/non-negative/);
  });
});
