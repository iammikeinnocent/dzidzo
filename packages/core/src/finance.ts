import type { PayrollComputation } from './payroll';

export interface StaffMember {
  staffId: string;
  tenantId: string;
  fullName: string;
  role: string;
  monthlySalary: number;
  /** National ID / passport number */
  idNumber: string;
  /** E.164 phone number */
  phone: string;
  email: string;
  /** ISO date */
  dateOfBirth: string;
  address?: string;
  /** S3 key of the staff avatar image. */
  avatarKey?: string;
  /** Certificate titles (files land in the assets bucket). */
  certificates?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PayrollLine extends PayrollComputation {
  staffId: string;
  fullName: string;
}

export interface PayrollRun {
  tenantId: string;
  /** yyyymm */
  month: string;
  lines: PayrollLine[];
  totals: { gross: number; paye: number; nssa: number; aidsLevy: number; net: number };
  computedAt: string;
  rulesEffectiveFrom: string;
}

export interface Expense {
  expenseId: string;
  tenantId: string;
  /** yyyymmdd */
  day: string;
  category: string;
  amount: number;
  note?: string;
  createdAt: string;
}

export interface FeePayment {
  paymentId: string;
  tenantId: string;
  learnerId: string;
  /** yyyymm the fee period relates to */
  month: string;
  amount: number;
  method?: string;
  createdAt: string;
}

export interface MonthSummary {
  month: string;
  income: number;
  expenses: number;
  payrollNet: number;
  expenditure: number;
  balance: number;
}

export type ExpenseCreateInput = Pick<Expense, 'day' | 'category' | 'amount'> & { note?: string };

export type PaymentCreateInput = Pick<FeePayment, 'learnerId' | 'month' | 'amount'> & { method?: string };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * P&L for one month: fee payments are income; operational expenses plus the
 * payroll NET (what actually left the account) are expenditure.
 */
export function summarizeMonth(args: {
  month: string;
  payments: FeePayment[];
  expenses: Expense[];
  payroll?: PayrollRun;
}): MonthSummary {
  const { month, payments, expenses, payroll } = args;
  const income = round2(payments.reduce((sum, p) => sum + p.amount, 0));
  const expenseTotal = round2(expenses.reduce((sum, e) => sum + e.amount, 0));
  const payrollNet = round2(payroll?.totals.net ?? 0);
  const expenditure = round2(expenseTotal + payrollNet);
  return {
    month,
    income,
    expenses: expenseTotal,
    payrollNet,
    expenditure,
    balance: round2(income - expenditure),
  };
}
