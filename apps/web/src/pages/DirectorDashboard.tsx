import { useAuth } from 'react-oidc-context';
import { staffProfileFrom } from '../auth/profile';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { useDirectorDashboard, useFinanceTrend } from '../api/queries';
import { useClasses } from '../api/queries';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}

export function DirectorDashboard() {
  const auth = useAuth();
  const profile = staffProfileFrom(auth.user);

  const dashboardQuery = useDirectorDashboard();
  const trendQuery = useFinanceTrend();
  const classesQuery = useClasses();

  const data = dashboardQuery.data;
  const feesCollected = data?.feesCollected ?? 0;
  const byMethod = data?.byMethod ?? {};
  const byCategory = data?.byCategory ?? {};
  const recent = data?.recent ?? [];
  const payrollNet = data?.payrollNet;
  const payrollRun = data?.payrollRun ?? false;

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Director dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            {profile?.tenantId
              ? `School ${profile.tenantId} · ${currentMonth().slice(0, 4)}-${currentMonth().slice(4)}`
              : 'Signed in.'}
          </p>
        </div>
        <SyncStatusBadge />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Fees collected this month"
          value={dashboardQuery.isLoading ? '—' : formatCurrency(feesCollected)}
          hint="net payments received"
        />
        <StatCard
          label="Payment methods"
          value={dashboardQuery.isLoading ? '—' : String(Object.keys(byMethod).length)}
          hint={Object.entries(byMethod).map(([m, v]) => `${m}: ${formatCurrency(v)}`).join(' · ') || 'no payments yet'}
        />
        <StatCard
          label="Expense categories"
          value={dashboardQuery.isLoading ? '—' : String(Object.keys(byCategory).length)}
          hint={Object.entries(byCategory).map(([c, v]) => `${c}: ${formatCurrency(v)}`).join(' · ') || 'no expenses yet'}
        />
        <StatCard
          label="Payroll"
          value={dashboardQuery.isLoading ? '—' : payrollRun ? formatCurrency(payrollNet ?? 0) : 'not run'}
          hint={payrollRun ? 'net payroll this month' : 'not run this month'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FinanceTrendCard months={trendQuery.data?.months ?? []} isLoading={trendQuery.isLoading} />
        <RevenueBreakdownCard byMethod={byMethod} byCategory={byCategory} />
      </div>

      <RecentTransactionsCard recent={recent} />
      <QuickActionsCard classes={classesQuery.data?.classes ?? []} />
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500 truncate">{hint}</p>
    </div>
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function FinanceTrendCard({
  months,
  isLoading,
}: {
  months: { month: string; income: number; expenses: number }[];
  isLoading: boolean;
}) {
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.expenses)));
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-100">6-Month Trend</h3>
        <div className="flex gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" /> income
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-rose-400" /> expenses
          </span>
        </div>
      </div>
      <div className="mt-4 flex h-48 justify-around gap-2">
        {months.map((m) => (
          <div key={m.month} className="flex h-full flex-1 flex-col items-center">
            <div className="flex w-full flex-1 items-end justify-center gap-0.5">
              <div
                className="w-1/3 bg-emerald-500/60 rounded-t"
                style={{ height: `${(m.income / max) * 100}%` }}
                title={`Income ${formatCurrency(m.income)}`}
              />
              <div
                className="w-1/3 bg-rose-500/60 rounded-t"
                style={{ height: `${(m.expenses / max) * 100}%` }}
                title={`Expenses ${formatCurrency(m.expenses)}`}
              />
            </div>
            <span className="mt-2 text-xs text-slate-500">
              {MONTH_NAMES[Number(m.month.slice(4)) - 1] ?? m.month}
            </span>
          </div>
        ))}
      </div>
      {isLoading && <p className="mt-3 text-xs text-slate-500 text-center">Loading…</p>}
    </div>
  );
}

function RevenueBreakdownCard({
  byMethod,
  byCategory,
}: {
  byMethod: Record<string, number>;
  byCategory: Record<string, number>;
}) {
  const methodEntries = Object.entries(byMethod);
  const categoryEntries = Object.entries(byCategory);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-medium text-slate-100">Revenue Breakdown</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="text-xs uppercase tracking-wide text-slate-500">By Method</h4>
          <ul className="mt-2 space-y-1">
            {methodEntries.length === 0 ? (
              <li className="text-xs text-slate-500">No payments this month</li>
            ) : (
              methodEntries.map(([method, amount]) => (
                <li key={method} className="flex justify-between text-sm">
                  <span className="text-slate-300 capitalize">{method}</span>
                  <span className="font-medium text-slate-100">{formatCurrency(amount)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wide text-slate-500">By Category</h4>
          <ul className="mt-2 space-y-1">
            {categoryEntries.length === 0 ? (
              <li className="text-xs text-slate-500">No expenses this month</li>
            ) : (
              categoryEntries.map(([category, amount]) => (
                <li key={category} className="flex justify-between text-sm">
                  <span className="text-slate-300">{category}</span>
                  <span className="font-medium text-slate-100">{formatCurrency(amount)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function RecentTransactionsCard({ recent }: { recent: { id: string; date: string; amount: number; method: string; learnerName: string }[] }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-100">Recent Transactions</h3>
        <a href="/finance" className="text-xs text-blue-400 hover:underline">
          View all
        </a>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Learner</th>
              <th className="px-4 py-2.5 font-medium">Method</th>
              <th className="px-4 py-2.5 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {recent.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No recent transactions
                </td>
              </tr>
            ) : (
              recent.slice(0, 5).map((txn) => (
                <tr key={txn.id} className="hover:bg-slate-900/50">
                  <td className="px-4 py-2.5 text-slate-400">{txn.date}</td>
                  <td className="px-4 py-2.5 font-medium">{txn.learnerName}</td>
                  <td className="px-4 py-2.5 text-slate-400 capitalize">{txn.method}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-emerald-300">
                    {formatCurrency(txn.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuickActionsCard({ classes }: { classes: { classId: string; name: string }[] }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="font-medium text-slate-100">Quick Actions</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <a href="/learners" className="btn-secondary text-left p-3">
          <p className="font-medium">Manage Learners</p>
          <p className="text-xs text-slate-500">Enrol, edit, export roster</p>
        </a>
        <a href="/attendance" className="btn-secondary text-left p-3">
          <p className="font-medium">Attendance Register</p>
          <p className="text-xs text-slate-500">Mark & export attendance</p>
        </a>
        <a href="/finance" className="btn-secondary text-left p-3">
          <p className="font-medium">Finance</p>
          <p className="text-xs text-slate-500">Payments, expenses, payroll</p>
        </a>
        <a href="/staff" className="btn-secondary text-left p-3">
          <p className="font-medium">Staff & Materials</p>
          <p className="text-xs text-slate-500">Profiles, payroll, library</p>
        </a>
      </div>
      {classes.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs uppercase tracking-wide text-slate-500">Classes</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {classes.map((c) => (
              <span key={c.classId} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300">
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}