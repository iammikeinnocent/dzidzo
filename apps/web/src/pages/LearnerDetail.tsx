import type { CurriculumItem, LearnerNote, LearnerReport } from '@dzidzo/core';
import { ageFrom } from '@dzidzo/core';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  useAddCurriculumItem,
  useClasses,
  useAddLearnerCertificate,
  useAddLearnerNote,
  useAddLearnerReport,
  useFileUrl,
  useLearner,
  useLearnerCertificates,
  useLearnerCurriculum,
  useLearnerNotes,
  useLearnerPayments,
  useLearnerReports,
} from '../api/queries';
import { usePermissions } from '../hooks/usePermissions';

const genderLabel: Record<string, string> = { F: 'female', M: 'male', other: 'other' };

export function LearnerDetailPage() {
  const { learnerId = '' } = useParams();
  const { can } = usePermissions();
  const learnerQuery = useLearner(learnerId || undefined);
  const learner = learnerQuery.data;
  const classesQuery = useClasses();

  if (learnerQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading learner…</p>;
  }
  if (!learner) {
    return (
      <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6 text-sm text-slate-500">
        Learner not found. <Link to="/learners" className="underline">Back to learners</Link>
      </p>
    );
  }

  const age = ageFrom(learner.dateOfBirth);
  const className = learner.classId
    ? (classesQuery.data?.classes.find((c) => c.classId === learner.classId)?.name ?? '—')
    : 'Unassigned';

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar
            avatarKey={learner.avatarKey}
            name={`${learner.firstName} ${learner.lastName}`}
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {learner.firstName} {learner.lastName}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {age !== null ? `${age} years old · ` : ''}
              {learner.gender ? `${genderLabel[learner.gender] ?? learner.gender} · ` : ''}
              {className}
            </p>
          </div>
        </div>
        <Link to="/learners" className="btn-secondary">
          Back to learners
        </Link>
      </div>

      <NotesSection learnerId={learner.learnerId} />
      <ReportsSection learnerId={learner.learnerId} />
      <CurriculumSection learnerId={learner.learnerId} />
      <CertificatesSection learnerId={learner.learnerId} />
      {can('finance:read') ? <FeesSection learnerId={learner.learnerId} /> : null}
    </section>
  );
}

function Avatar({ avatarKey, name }: { avatarKey?: string | undefined; name: string }) {
  const avatarUrl = useFileUrl(avatarKey);
  if (avatarKey && avatarUrl.data) {
    return (
      <img
        src={avatarUrl.data}
        alt={name}
        className="h-20 w-20 rounded-full border border-slate-700 object-cover"
      />
    );
  }
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-slate-700 text-lg text-slate-500">
      {name.slice(0, 1)}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function NotesSection({ learnerId }: { learnerId: string }) {
  const notesQuery = useLearnerNotes(learnerId);
  const addNote = useAddLearnerNote(learnerId);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed === '') return;
    addNote.mutate(
      trimmed,
      {
        onSuccess: () => setText(''),
        onError: (err) => setError(err instanceof Error ? err.message : 'failed to save note'),
      },
    );
  }

  return (
    <Panel title="Notes">
      <form onSubmit={submit} className="flex items-start gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add an observation or comment…"
          className="input flex-1"
        />
        <button type="submit" className="btn-secondary" disabled={addNote.isPending}>
          Add note
        </button>
      </form>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {(notesQuery.data?.notes ?? []).map((note: LearnerNote) => (
          <li key={note.noteId} className="rounded bg-slate-900/70 px-3 py-2 text-sm">
            <span className="text-slate-200">{note.text}</span>
            <span className="ml-2 text-xs text-slate-500">
              {note.createdAt.slice(0, 16).replace('T', ' ')}
            </span>
          </li>
        ))}
        {notesQuery.data?.notes.length === 0 ? (
          <li className="text-xs text-slate-500">No notes yet.</li>
        ) : null}
      </ul>
    </Panel>
  );
}

function ReportsSection({ learnerId }: { learnerId: string }) {
  const reportsQuery = useLearnerReports(learnerId);
  const addReport = useAddLearnerReport(learnerId);
  const { can } = usePermissions();
  const [subject, setSubject] = useState('');
  const [term, setTerm] = useState('');
  const [grade, setGrade] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    addReport.mutate(
      { subject: subject.trim(), term: term.trim(), grade: grade.trim(), ...(comment.trim() ? { comment: comment.trim() } : {}) },
      {
        onSuccess: () => {
          setSubject('');
          setTerm('');
          setGrade('');
          setComment('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'failed to save report'),
      },
    );
  }

  return (
    <Panel title="Past reports">
      {can('assessment:write') ? (
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="input" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term (2026-T2)" className="input" />
          <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade" className="input" />
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" className="input" />
          <button type="submit" className="btn-secondary sm:col-span-4" disabled={addReport.isPending}>
            Add report
          </button>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {(reportsQuery.data?.reports ?? []).map((report: LearnerReport) => (
          <li key={report.reportId} className="rounded bg-slate-900/70 px-3 py-2 text-sm">
            <span className="font-medium text-slate-100">{report.subject}</span>
            <span className="ml-2 text-xs text-slate-500">{report.term}</span>
            <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-xs text-emerald-300">{report.grade}</span>
            {report.comment ? <p className="mt-1 text-xs text-slate-400">{report.comment}</p> : null}
          </li>
        ))}
        {reportsQuery.data?.reports.length === 0 ? (
          <li className="text-xs text-slate-500">No reports yet.</li>
        ) : null}
      </ul>
    </Panel>
  );
}

function CurriculumSection({ learnerId }: { learnerId: string }) {
  const curriculumQuery = useLearnerCurriculum(learnerId);
  const addItem = useAddCurriculumItem(learnerId);
  const { can } = usePermissions();
  const [subject, setSubject] = useState('');
  const [term, setTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    addItem.mutate(
      { subject: subject.trim(), ...(term.trim() ? { term: term.trim() } : {}), done: true },
      {
        onSuccess: () => {
          setSubject('');
          setTerm('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'failed to save'),
      },
    );
  }

  return (
    <Panel title="Subjects / curriculum done">
      {can('assessment:write') ? (
        <form onSubmit={submit} className="flex items-start gap-2">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject or unit" className="input flex-1" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term (optional)" className="input w-36" />
          <button type="submit" className="btn-secondary" disabled={addItem.isPending}>
            Mark done
          </button>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {(curriculumQuery.data?.items ?? []).map((item: CurriculumItem) => (
          <li key={item.itemId} className="rounded bg-slate-900/70 px-3 py-2 text-sm">
            <span className="text-emerald-400">✓</span>
            <span className="ml-2 text-slate-200">{item.subject}</span>
            {item.term ? <span className="ml-2 text-xs text-slate-500">{item.term}</span> : null}
          </li>
        ))}
        {curriculumQuery.data?.items.length === 0 ? (
          <li className="text-xs text-slate-500">Nothing recorded yet.</li>
        ) : null}
      </ul>
    </Panel>
  );
}

function CertificatesSection({ learnerId }: { learnerId: string }) {
  const certificatesQuery = useLearnerCertificates(learnerId);
  const addCertificate = useAddLearnerCertificate(learnerId);
  const { can } = usePermissions();
  const [title, setTitle] = useState('');
  const [awardedAt, setAwardedAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    addCertificate.mutate(
      { title: title.trim(), ...(awardedAt ? { awardedAt } : {}) },
      {
        onSuccess: () => {
          setTitle('');
          setAwardedAt('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'failed to save'),
      },
    );
  }

  return (
    <Panel title="Certificates">
      {can('learner:write') ? (
        <form onSubmit={submit} className="flex items-start gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Certificate title" className="input flex-1" />
          <input type="date" value={awardedAt} onChange={(e) => setAwardedAt(e.target.value)} className="input w-40" />
          <button type="submit" className="btn-secondary" disabled={addCertificate.isPending}>
            Add
          </button>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {(certificatesQuery.data?.certificates ?? []).map((certificate) => (
          <li key={certificate.certificateId} className="rounded bg-slate-900/70 px-3 py-2 text-sm">
            <span className="text-amber-300">🏅</span>
            <span className="ml-2 text-slate-200">{certificate.title}</span>
            {certificate.awardedAt ? (
              <span className="ml-2 text-xs text-slate-500">{certificate.awardedAt}</span>
            ) : null}
          </li>
        ))}
        {certificatesQuery.data?.certificates.length === 0 ? (
          <li className="text-xs text-slate-500">No certificates yet.</li>
        ) : null}
      </ul>
    </Panel>
  );
}

function FeesSection({ learnerId }: { learnerId: string }) {
  const paymentsQuery = useLearnerPayments(learnerId, true);
  const payments = paymentsQuery.data?.payments ?? [];
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <Panel title="Fees paid">
      <ul className="space-y-2">
        {payments.map((payment) => (
          <li key={payment.paymentId} className="flex justify-between rounded bg-slate-900/70 px-3 py-2 text-sm">
            <span className="text-slate-300">{payment.month}</span>
            <span className="text-emerald-300">+${payment.amount.toFixed(2)}</span>
          </li>
        ))}
        {payments.length === 0 ? <li className="text-xs text-slate-500">No payments recorded.</li> : null}
      </ul>
      <p className="mt-3 border-t border-slate-800 pt-2 text-sm text-slate-300">
        Total: <span className="font-semibold text-emerald-300">${total.toFixed(2)}</span>
      </p>
    </Panel>
  );
}