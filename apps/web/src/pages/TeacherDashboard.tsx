import { useAuth } from 'react-oidc-context';
import { staffProfileFrom } from '../auth/profile';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { useTeacherDashboard, useQuickAttendanceMark } from '../api/queries';
import { useCreateLearner } from '../api/queries';

export function TeacherDashboard() {
  const auth = useAuth();
  const profile = staffProfileFrom(auth.user);

  const dashboardQuery = useTeacherDashboard();
  const quickMark = useQuickAttendanceMark();
  const createLearner = useCreateLearner();

  const data = dashboardQuery.data;
  const learners = data?.learners ?? [];
  const attendance = data?.attendance ?? { present: 0, marked: 0, rate: 0 };
  const birthdays = data?.birthdays ?? [];
  const classes = data?.classes ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your class</h1>
          <p className="mt-1 text-sm text-slate-400">
            {profile?.tenantId
              ? `Signed in for school ${profile.tenantId}.`
              : 'Signed in.'}
          </p>
        </div>
        <SyncStatusBadge />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Learners"
          value={dashboardQuery.isLoading ? '—' : String(learners.length)}
          hint="enrolled across all classes"
        />
        <StatCard
          label="Attendance today"
          value={dashboardQuery.isLoading ? '—' : `${attendance.present}/${attendance.marked}`}
          hint={attendance.marked === 0 ? 'no marks yet today' : `${attendance.rate}% present`}
        />
        <StatCard
          label="Birthdays today"
          value={dashboardQuery.isLoading ? '—' : String(birthdays.length)}
          hint={birthdays.length === 0 ? 'none today' : birthdays.map(b => b.name).join(', ')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <QuickAttendanceCard
          learners={learners}
          attendance={attendance}
          quickMark={quickMark}
        />
        <BirthdayBanner birthdays={birthdays} />
      </div>

      <LearnerRoster learners={learners} classes={classes} createLearner={createLearner} />
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function QuickAttendanceCard({
  learners,
  attendance,
  quickMark,
}: {
  learners: { learnerId: string; firstName: string; lastName: string }[];
  attendance: { present: number; marked: number; rate: number };
  quickMark: ReturnType<typeof useQuickAttendanceMark>;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-100">Quick Attendance</h3>
        <span className="text-xs text-slate-500">
          {attendance.present}/{attendance.marked} ({attendance.rate}%)
        </span>
      </div>
      <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
        {learners.slice(0, 10).map((learner) => (
          <QuickAttendanceRow
            key={learner.learnerId}
            learner={learner}
            quickMark={quickMark}
          />
        ))}
        {learners.length > 10 && (
          <p className="text-xs text-slate-500 text-center py-2">
            +{learners.length - 10} more learners — see Attendance page for full register
          </p>
        )}
      </div>
    </div>
  );
}

function QuickAttendanceRow({
  learner,
  quickMark,
}: {
  learner: { learnerId: string; firstName: string; lastName: string };
  quickMark: ReturnType<typeof useQuickAttendanceMark>;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">{learner.firstName} {learner.lastName}</span>
      <div className="flex gap-1">
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => void quickMark.mutate({ learnerId: learner.learnerId, present: true })}
          disabled={quickMark.isPending}
        >
          Present
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => void quickMark.mutate({ learnerId: learner.learnerId, present: false })}
          disabled={quickMark.isPending}
        >
          Absent
        </button>
      </div>
    </div>
  );
}

function BirthdayBanner({ birthdays }: { birthdays: { name: string; class: string }[] }) {
  if (birthdays.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎂</span>
        <h3 className="font-medium text-amber-200">Birthdays today</h3>
      </div>
      <ul className="mt-2 space-y-1">
        {birthdays.map((b, i) => (
          <li key={i} className="text-sm text-amber-100">
            {b.name} — {b.class}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LearnerRoster({
  learners,
  classes,
  createLearner,
}: {
  learners: { learnerId: string; firstName: string; lastName: string; classId: string }[];
  classes: { classId: string; name: string }[];
  createLearner: ReturnType<typeof useCreateLearner>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    classId: classes[0]?.classId ?? '',
    dateOfBirth: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createLearner.mutateAsync(formData);
    setFormData({ firstName: '', lastName: '', classId: classes[0]?.classId ?? '', dateOfBirth: '' });
    setShowForm(false);
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-100">Learner Roster</h3>
        <button
          type="button"
          className="btn-primary text-sm"
          onClick={() => setShowForm(true)}
        >
          + Add Learner
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 p-4 rounded border border-slate-700 bg-slate-900/40">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="First name"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="input"
              required
            />
            <input
              type="text"
              placeholder="Last name"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="input"
              required
            />
            <select
              value={formData.classId}
              onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
              className="input"
              required
            >
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
              className="input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={createLearner.isPending}>
              {createLearner.isPending ? 'Adding…' : 'Add Learner'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Learner</th>
              <th className="px-4 py-2.5 font-medium">Class</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {learners.map((learner) => (
              <tr key={learner.learnerId} className="hover:bg-slate-900/50">
                <td className="px-4 py-2.5 font-medium">
                  {learner.firstName} {learner.lastName}
                </td>
                <td className="px-4 py-2.5 text-slate-400">
                  {classes.find(c => c.classId === learner.classId)?.name ?? learner.classId}
                </td>
              </tr>
            ))}
            {learners.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                  No learners enrolled yet — click "Add Learner" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState } from 'react';