/**
 * Payroll computation for Zimbabwean ECD schools.
 *
 * The rule tables are CONFIGURATION, not code: bands and rates live in
 * versioned data so a change in ZIMRA rules is a data update, not a logic
 * change. The 2026 table below is a SIMPLIFIED example — confirm current
 * bands with ZIMRA before real use.
 */

export interface PayeBand {
  /** Upper bound of the band in monthly USD; null = no upper bound. */
  upTo: number | null;
  /** Marginal rate, e.g. 0.25. */
  rate: number;
}

export interface PayrollRules {
  effectiveFrom: string;
  /** Ascending bands starting from 0. */
  payeBands: PayeBand[];
  /** NSSA employee contribution rate on insurable earnings. */
  nssaEmployeeRate: number;
  /** Monthly insurable-earnings cap for NSSA. */
  nssaInsurableCap: number;
  /** AIDS levy rate applied on the PAYE amount. */
  aidsLevyRate: number;
}

export const SIMPLIFIED_PAYE_RULES_2026: PayrollRules = {
  effectiveFrom: '2026-01-01',
  payeBands: [
    { upTo: 500, rate: 0 },
    { upTo: 1500, rate: 0.2 },
    { upTo: 3500, rate: 0.25 },
    { upTo: null, rate: 0.3 },
  ],
  nssaEmployeeRate: 0.045,
  nssaInsurableCap: 1780,
  aidsLevyRate: 0.03,
};

export interface PayrollComputation {
  gross: number;
  taxable: number;
  paye: number;
  nssa: number;
  aidsLevy: number;
  net: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * PAYE applies to gross minus the NSSA employee contribution (a ZIMRA
 * deduction), computed in marginal bands; AIDS levy is a percentage of PAYE;
 * net is gross minus PAYE, NSSA and AIDS levy.
 */
export function computePayroll(gross: number, rules: PayrollRules): PayrollComputation {
  if (!Number.isFinite(gross) || gross < 0) {
    throw new Error('gross must be a non-negative finite number');
  }
  const nssa = round2(Math.min(gross, rules.nssaInsurableCap) * rules.nssaEmployeeRate);
  const taxable = Math.max(0, gross - nssa);

  let remaining = taxable;
  let paye = 0;
  let previousBound = 0;
  for (const band of rules.payeBands) {
    const upper = band.upTo ?? Number.POSITIVE_INFINITY;
    const span = Math.min(remaining, upper - previousBound);
    if (span > 0) {
      paye += span * band.rate;
      remaining -= span;
    }
    previousBound = upper;
    if (remaining <= 0) {
      break;
    }
  }

  paye = round2(paye);
  const aidsLevy = round2(paye * rules.aidsLevyRate);
  const net = round2(gross - paye - nssa - aidsLevy);

  return {
    gross: round2(gross),
    taxable: round2(taxable),
    paye,
    nssa,
    aidsLevy,
    net,
  };
}
