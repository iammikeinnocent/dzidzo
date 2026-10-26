import {
  computePayroll,
  ENTITY,
  expenseKey,
  paymentKey,
  payrollKey,
  staffKey,
  SIMPLIFIED_PAYE_RULES_2026,
  tenantPk,
  type Expense,
  type FeePayment,
  type PayrollRules,
  type PayrollRun,
  type StaffMember,
} from '@dzidzo/core';
import { DataIntegrityError, type SingleTableRepository, type TableItem } from './repository';
import type { StaffMemberPatch } from './index';

// ---------- mappers ----------

function staffToItem(member: StaffMember): TableItem {
  const key = staffKey(member.tenantId, member.staffId);
  const item: TableItem = {
    entityType: ENTITY.STAFF,
    pk: key.pk,
    sk: key.sk,
    tenantId: member.tenantId,
    staffId: member.staffId,
    fullName: member.fullName,
    role: member.role,
    monthlySalary: member.monthlySalary,
    idNumber: member.idNumber,
    phone: member.phone,
    email: member.email,
    dateOfBirth: member.dateOfBirth,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
  if (member.address !== undefined) {
    item.address = member.address;
  }
  if (member.address !== undefined) {
    item.address = member.address;
  }
  if (member.avatarKey !== undefined) {
    item.avatarKey = member.avatarKey;
  }
  if (member.certificates !== undefined) {
    item.certificates = member.certificates;
  }
  return item;
}

export function staffFromItem(item: TableItem): StaffMember {
  if (item.entityType !== ENTITY.STAFF) {
    throw new DataIntegrityError('item is not a staff member');
  }
  const member: StaffMember = {
    tenantId: String(item.tenantId),
    staffId: String(item.staffId),
    fullName: String(item.fullName),
    role: String(item.role),
    monthlySalary: Number(item.monthlySalary),
    idNumber: String(item.idNumber ?? ''),
    phone: String(item.phone ?? ''),
    email: String(item.email ?? ''),
    dateOfBirth: String(item.dateOfBirth ?? ''),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
  if (typeof item.address === 'string' && item.address !== '') {
    member.address = item.address;
  }
  if (typeof item.avatarKey === 'string' && item.avatarKey !== '') {
    member.avatarKey = item.avatarKey;
  }
  if (Array.isArray(item.certificates)) {
    member.certificates = item.certificates as string[];
  }
  return member;
}

function expenseToItem(expense: Expense): TableItem {
  const key = expenseKey(expense.tenantId, expense.day, expense.expenseId);
  const item: TableItem = {
    entityType: ENTITY.EXPENSE,
    pk: key.pk,
    sk: key.sk,
    tenantId: expense.tenantId,
    expenseId: expense.expenseId,
    day: expense.day,
    category: expense.category,
    amount: expense.amount,
    createdAt: expense.createdAt,
  };
  if (expense.note !== undefined) {
    item.note = expense.note;
  }
  return item;
}

export function expenseFromItem(item: TableItem): Expense {
  if (item.entityType !== ENTITY.EXPENSE) {
    throw new DataIntegrityError('item is not an expense');
  }
  const expense: Expense = {
    tenantId: String(item.tenantId),
    expenseId: String(item.expenseId),
    day: String(item.day),
    category: String(item.category),
    amount: Number(item.amount),
    createdAt: String(item.createdAt),
  };
  if (typeof item.note === 'string') {
    expense.note = item.note;
  }
  return expense;
}

function paymentToItem(payment: FeePayment): TableItem {
  const key = paymentKey(payment.tenantId, payment.month, payment.paymentId);
  const item: TableItem = {
    entityType: ENTITY.PAYMENT,
    pk: key.pk,
    sk: key.sk,
    tenantId: payment.tenantId,
    paymentId: payment.paymentId,
    learnerId: payment.learnerId,
    month: payment.month,
    amount: payment.amount,
    createdAt: payment.createdAt,
  };
  if (payment.method !== undefined) {
    item.method = payment.method;
  }
  return item;
}

export function paymentFromItem(item: TableItem): FeePayment {
  if (item.entityType !== ENTITY.PAYMENT) {
    throw new DataIntegrityError('item is not a payment');
  }
  const payment: FeePayment = {
    tenantId: String(item.tenantId),
    paymentId: String(item.paymentId),
    learnerId: String(item.learnerId),
    month: String(item.month),
    amount: Number(item.amount),
    createdAt: String(item.createdAt),
  };
  if (typeof item.method === 'string') {
    payment.method = item.method;
  }
  return payment;
}

// ---------- repositories ----------

export class StaffRepository {
  constructor(private readonly repo: SingleTableRepository) {}

  async create(
    tenantId: string,
    input: {
      fullName: string;
      role: string;
      monthlySalary: number;
      idNumber: string;
      phone: string;
      email: string;
      dateOfBirth: string;
      address?: string;
      avatarKey?: string;
      certificates?: string[];
    },
  ): Promise<StaffMember> {
    const now = new Date().toISOString();
    const member: StaffMember = {
      staffId: crypto.randomUUID(),
      tenantId,
      fullName: input.fullName,
      role: input.role,
      monthlySalary: input.monthlySalary,
      idNumber: input.idNumber,
      phone: input.phone,
      email: input.email,
      dateOfBirth: input.dateOfBirth,
      createdAt: now,
      updatedAt: now,
    };
    if (input.address !== undefined) {
      member.address = input.address;
    }
    if (input.avatarKey !== undefined) {
      member.avatarKey = input.avatarKey;
    }
    if (input.certificates !== undefined) {
      member.certificates = input.certificates;
    }
    await this.repo.put(staffToItem(member));
    return member;
  }

  async update(tenantId: string, staffId: string, patch: StaffMemberPatch): Promise<StaffMember | undefined> {
    const item = await this.repo.get(staffKey(tenantId, staffId));
    if (!item) {
      return undefined;
    }
    const existing = staffFromItem(item);
    const updated: StaffMember = { ...existing, updatedAt: new Date().toISOString() };
    if (patch.fullName !== undefined) {
      updated.fullName = patch.fullName;
    }
    if (patch.role !== undefined) {
      updated.role = patch.role;
    }
    if (patch.monthlySalary !== undefined) {
      updated.monthlySalary = patch.monthlySalary;
    }
    if (patch.idNumber !== undefined) {
      updated.idNumber = patch.idNumber;
    }
    if (patch.phone !== undefined) {
      updated.phone = patch.phone;
    }
    if (patch.email !== undefined) {
      updated.email = patch.email;
    }
    if (patch.dateOfBirth !== undefined) {
      updated.dateOfBirth = patch.dateOfBirth;
    }
    if (patch.address !== undefined) {
      updated.address = patch.address;
    }
    if (patch.avatarKey !== undefined) {
      updated.avatarKey = patch.avatarKey;
    }
    if (patch.certificates !== undefined) {
      updated.certificates = patch.certificates;
    }
    await this.repo.put(staffToItem(updated));
    return updated;
  }

  async list(tenantId: string): Promise<StaffMember[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: `${ENTITY.STAFF}#`,
    });
    return items.map(staffFromItem);
  }
}

export class PayrollRepository {
  constructor(private readonly repo: SingleTableRepository) {}

  /**
   * Recomputes and overwrites the month's run, so running payroll twice is
   * safe — a replay after a failure just overwrites the previous run again.
   */
  async run(tenantId: string, month: string, rules: PayrollRules = SIMPLIFIED_PAYE_RULES_2026): Promise<PayrollRun> {
    const staff = await new StaffRepository(this.repo).list(tenantId);
    const lines = staff.map((member) => ({
      staffId: member.staffId,
      fullName: member.fullName,
      ...computePayroll(member.monthlySalary, rules),
    }));
    const totals = {
      gross: round2(lines.reduce((sum, l) => sum + l.gross, 0)),
      paye: round2(lines.reduce((sum, l) => sum + l.paye, 0)),
      nssa: round2(lines.reduce((sum, l) => sum + l.nssa, 0)),
      aidsLevy: round2(lines.reduce((sum, l) => sum + l.aidsLevy, 0)),
      net: round2(lines.reduce((sum, l) => sum + l.net, 0)),
    };
    const run: PayrollRun = {
      tenantId,
      month,
      lines,
      totals,
      computedAt: new Date().toISOString(),
      rulesEffectiveFrom: rules.effectiveFrom,
    };
    await this.repo.put({
      entityType: ENTITY.PAYROLL,
      pk: tenantPk(tenantId),
      sk: payrollKey(tenantId, month).sk,
      ...run,
    });
    return run;
  }

  async get(tenantId: string, month: string): Promise<PayrollRun | undefined> {
    const item = await this.repo.get(payrollKey(tenantId, month));
    if (!item) {
      return undefined;
    }
    if (item.entityType !== ENTITY.PAYROLL) {
      throw new DataIntegrityError('item is not a payroll run');
    }
    const lines = Array.isArray(item.lines) ? (item.lines as PayrollRun['lines']) : [];
    const totals = (item.totals ?? {}) as PayrollRun['totals'];
    return {
      tenantId: String(item.tenantId),
      month: String(item.month),
      lines,
      totals,
      computedAt: String(item.computedAt),
      rulesEffectiveFrom: String(item.rulesEffectiveFrom),
    };
  }
}

export class ExpenseRepository {
  constructor(private readonly repo: SingleTableRepository) {}

  async create(tenantId: string, input: { day: string; category: string; amount: number; note?: string }): Promise<Expense> {
    const expense: Expense = {
      expenseId: crypto.randomUUID(),
      tenantId,
      day: input.day,
      category: input.category,
      amount: input.amount,
      createdAt: new Date().toISOString(),
    };
    if (input.note !== undefined) {
      expense.note = input.note;
    }
    await this.repo.put(expenseToItem(expense));
    return expense;
  }

  /** Month prefix match: EXPENSE#yyyymmdd sorts under EXPENSE#yyyymm. */
  async listForMonth(tenantId: string, month: string): Promise<Expense[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: `${ENTITY.EXPENSE}#${month}`,
    });
    return items.map(expenseFromItem);
  }
}

export class PaymentRepository {
  constructor(private readonly repo: SingleTableRepository) {}

  async create(tenantId: string, input: { learnerId: string; month: string; amount: number; method?: string }): Promise<FeePayment> {
    const payment: FeePayment = {
      paymentId: crypto.randomUUID(),
      tenantId,
      learnerId: input.learnerId,
      month: input.month,
      amount: input.amount,
      createdAt: new Date().toISOString(),
    };
    if (input.method !== undefined) {
      payment.method = input.method;
    }
    await this.repo.put(paymentToItem(payment));
    return payment;
  }

  async listForMonth(tenantId: string, month: string): Promise<FeePayment[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: `${ENTITY.PAYMENT}#${month}`,
    });
    return items.map(paymentFromItem);
  }

  /** Every fee payment for one learner, newest first (finance:read only). */
  async listForLearner(tenantId: string, learnerId: string): Promise<FeePayment[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: `${ENTITY.PAYMENT}#`,
      filter: { expression: 'learnerId = :learnerId', values: { ':learnerId': learnerId } },
    });
    return items
      .map(paymentFromItem)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
