import type { FeePayment, Learner, PayrollRun, StaffMember } from '@dzidzo/core';
import { expenseCreateSchema, paymentCreateSchema, staffCreateSchema, zodIssues } from '@dzidzo/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useApiClient } from '../api/ApiContext';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { usePermissions } from '../hooks/usePermissions';

interface MonthSummary {
  month: string;
  income: number;
  expenses: number;
  payrollNet: number;
  expenditure: number;
  balance: number;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function FinancePage() {
  const { can } = usePermissions();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [issues, setIssues] = useState<string[]>([]);
  const [exporting, setExporting] = useState<'payments' | 'expenses' | null>(null);

  const downloadCsv = async (type: 'payments' | 'expenses') => {
    setExporting(type);
    try {
      const blob = await client.getBlob(`/reports/${type}.csv?month=${month}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${type}-${month}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Failed to export ${type}:`, err);
    } finally {
      setExporting(null);
    }
  };

  const staffQuery = useQuery({
    queryKey: ['staff'],
    queryFn: () => client.get<{ staff: StaffMember[] }>('/staff'),
  });
  const learnersQuery = useQuery({
    queryKey: ['learners', 'all'],
    queryFn: () => client.get<{ learners: Learner[] }>('/learners'),
  });
  const payrollQuery = useQuery({
    queryKey: ['payroll', month],
    queryFn: () => client.get<PayrollRun>(`/payroll/${month}`),
  });
  const expensesQuery = useQuery({
    queryKey: ['expenses', month],
    queryFn: () => client.get<{ expenses: { expenseId: string; day: string; category: string; amount: number; note?: string }[] }>(`/expenses?month=${month}`),
  });
  const paymentsQuery = useQuery({
    queryKey: ['payments', month],
    queryFn: () => client.get<{ payments: FeePayment[] }>(`/payments?month=${month}`),
  });
  const summaryQuery = useQuery({
    queryKey: ['summary', month],
    queryFn: () => client.get<MonthSummary>(`/reports/summary?month=${month}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['payroll'] });
    void queryClient.invalidateQueries({ queryKey: ['expenses'] });
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
    void queryClient.invalidateQueries({ queryKey: ['summary'] });
    void queryClient.invalidateQueries({ queryKey: ['staff'] });
  };

  const runPayroll = useMutation({
    mutationFn: () => client.post('/payroll/run', { month }),
    onSuccess: invalidate,
  });

  function submitStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const parsed = staffCreateSchema.safeParse({
      fullName: String(form.get('fullName') ?? ''),
      role: String(form.get('role') ?? ''),
      monthlySalary: Number(form.get('monthlySalary') ?? 0),
      idNumber: String(form.get('idNumber') ?? ''),
      phone: String(form.get('phone') ?? ''),
      email: String(form.get('email') ?? ''),
      dateOfBirth: String(form.get('dateOfBirth') ?? ''),
    });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    setIssues([]);
    void client.post('/staff', parsed.data).then(() => {
      invalidate();
      formEl.reset();
    });
  }

  function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const parsed = expenseCreateSchema.safeParse({
      day: String(form.get('day') ?? '').replaceAll('-', ''),
      category: String(form.get('category') ?? ''),
      amount: Number(form.get('amount') ?? 0),
    });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    setIssues([]);
    void client
      .post('/expenses', parsed.data)
      .then(() => {
        invalidate();
        formEl.reset();
      })
      .catch((err: unknown) => {
        setIssues([err instanceof Error ? err.message : 'expense request failed']);
      });
  }

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const parsed = paymentCreateSchema.safeParse({
      learnerId: String(form.get('learnerId') ?? ''),
      month,
      amount: Number(form.get('amount') ?? 0),
      method: 'cash',
    });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    setIssues([]);
    void client
      .post('/payments', parsed.data)
      .then(() => {
        invalidate();
        formEl.reset();
      })
      .catch((err: unknown) => {
        setIssues([err instanceof Error ? err.message : 'payment request failed']);
      });
  }

  const summary = summaryQuery.data;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
          <SyncStatusBadge />
        </div>
        <div className="flex items-center gap-2">
          {can('finance:read') && (
            <>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => void downloadCsv('payments')}
                disabled={exporting !== null}
              >
                {exporting === 'payments' ? 'Exporting…' : 'Export Payments CSV'}
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => void downloadCsv('expenses')}
                disabled={exporting !== null}
              >
                {exporting === 'expenses' ? 'Exporting…' : 'Export Expenses CSV'}
              </button>
            </>
          )}
          <label htmlFor="finance-month" className="text-sm text-slate-400">
            Month
          </label>
          <input
            id="finance-month"
            type="month"
            value={`${month.slice(0, 4)}-${month.slice(4, 6)}`}
            onChange={(e) => setMonth(e.target.value.replaceAll('-', ''))}
            className="input w-auto"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryCard label="Income (fees)" value={summary?.income} />
        <SummaryCard label="Expenses" value={summary?.expenses} />
        <SummaryCard label="Payroll (net)" value={summary?.payrollNet} />
        <SummaryCard label="Balance" value={summary?.balance} highlight />
      </div>

      {issues.length > 0 ? (
        <ul className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Staff & payroll">
          <ul className="mb-4 space-y-1 text-sm">
            {(staffQuery.data?.staff ?? []).map((member) => (
              <li key={member.staffId} className="flex justify-between rounded bg-slate-900 px-3 py-1.5">
                <span>
                  {member.fullName} <span className="text-slate-500">· {member.role}</span>
                </span>
                <span className="text-slate-300">${member.monthlySalary.toFixed(2)}/mo</span>
              </li>
            ))}
            {(staffQuery.data?.staff ?? []).length === 0 ? (
              <li className="text-xs text-slate-500">No staff captured yet.</li>
            ) : null}
          </ul>
          {can('finance:write') ? (
            <form onSubmit={submitStaff} className="space-y-2" data-testid="staff-form">
              <input name="fullName" placeholder="Full name" className="input" required />
              <input name="role" placeholder="Role (e.g. teacher)" className="input" required />
              <input name="monthlySalary" type="number" step="0.01" min="0" placeholder="Monthly salary USD" className="input" required />
              <input name="idNumber" placeholder="ID number" className="input" required />
              <input name="phone" placeholder="Phone (E.164, e.g. +263771234567)" className="input" required />
              <input name="email" type="email" placeholder="Email" className="input" required />
              <input name="dateOfBirth" type="date" className="input" required />
              <button type="submit" className="btn-secondary">
                Add staff member
              </button>
            </form>
          ) : null}
          {can('finance:write') ? (
            <button
              type="button"
              className="mt-3 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
              onClick={() => runPayroll.mutate()}
              disabled={runPayroll.isPending}
            >
              {runPayroll.isPending ? 'Computing…' : `Run payroll for ${month}`}
            </button>
          ) : null}
          {payrollQuery.data ? (
            <table className="mt-4 w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-1">Employee</th>
                  <th className="py-1">PAYE</th>
                  <th className="py-1">NSSA</th>
                  <th className="py-1">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {payrollQuery.data.lines.map((line) => (
                  <tr key={line.staffId}>
                    <td className="py-1">{line.fullName}</td>
                    <td className="py-1">${line.paye.toFixed(2)}</td>
                    <td className="py-1">${line.nssa.toFixed(2)}</td>
                    <td className="py-1 font-medium">${line.net.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-xs text-slate-500">No payroll run for {month} yet.</p>
          )}
        </Panel>

        <Panel title="Expenses & fee income">
          {can('finance:write') ? (
            <form onSubmit={submitExpense} className="mb-4 flex flex-wrap items-end gap-2" data-testid="expense-form">
              <input name="day" type="date" className="input w-auto" />
              <input name="category" placeholder="Category" className="input w-32" />
              <input name="amount" type="number" step="0.01" min="0" placeholder="Amount" className="input w-28" />
              <button type="submit" className="btn-secondary">
                Add expense
              </button>
            </form>
          ) : null}
          <ul className="mb-4 space-y-1 text-xs">
            {(expensesQuery.data?.expenses ?? []).map((expense) => (
              <li key={expense.expenseId} className="flex justify-between rounded bg-slate-900 px-3 py-1.5">
                <span>
                  {expense.day.slice(6, 8)}/{expense.day.slice(4, 6)} · {expense.category}
                </span>
                <span className="text-slate-300">${expense.amount.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          {can('finance:write') ? (
            <form onSubmit={submitPayment} className="flex flex-wrap items-end gap-2" data-testid="payment-form">
              <select name="learnerId" className="input w-48" defaultValue="" aria-label="Learner">
                <option value="" disabled>
                  Select learner…
                </option>
                {(learnersQuery.data?.learners ?? []).map((learner) => (
                  <option key={learner.learnerId} value={learner.learnerId}>
                    {learner.firstName} {learner.lastName}
                  </option>
                ))}
              </select>
              <input name="amount" type="number" step="0.01" min="0" placeholder="Fee paid" className="input w-28" />
              <button type="submit" className="btn-secondary">
                Record fee payment
              </button>
            </form>
          ) : null}
          <ul className="mt-4 space-y-1 text-xs">
            {(paymentsQuery.data?.payments ?? []).map((payment) => (
              <li key={payment.paymentId} className="flex justify-between rounded bg-slate-900 px-3 py-1.5">
                <span>
                  Learner {payment.learnerId.slice(0, 8)}… · {payment.month}
                </span>
                <span className="text-emerald-300">+${payment.amount.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | undefined;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-emerald-900/60 bg-emerald-950/30' : 'border-slate-800 bg-slate-900/60'}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${highlight ? 'text-emerald-300' : ''}`}>
        {value === undefined
          ? '—'
          : value < 0
            ? `-$${Math.abs(value).toFixed(2)}`
            : `$${value.toFixed(2)}`}
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </div>
  );
}
