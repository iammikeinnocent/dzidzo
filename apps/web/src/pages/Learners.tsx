import type { Guardian, Learner, SchoolClass } from '@dzidzo/core';
import { guardianCreateSchema, toGuardianCreateInput, zodIssues } from '@dzidzo/core';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  useAllLearners,
  useClasses,
  useCreateClass,
  useCreateGuardian,
  useCreateLearner,
  useDeleteLearner,
  useLearnerGuardians,
  useRoster,
  useUpdateLearner,
} from '../api/queries';
import { LearnerForm, type LearnerFormValues } from '../components/LearnerForm';
import { usePermissions } from '../hooks/usePermissions';

export function LearnersPage() {
  const { can } = usePermissions();
  const classesQuery = useClasses();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const classes = classesQuery.data?.classes ?? [];
  const activeClassId = selectedClassId ?? classes[0]?.classId ?? null;
  const isAllView = activeClassId === 'all';
  const allLearnersQuery = useAllLearners(isAllView);
  const rosterQuery = useRoster(isAllView ? null : activeClassId);
  const roster = isAllView
    ? {
        isLoading: allLearnersQuery.isLoading,
        isError: allLearnersQuery.isError,
        learners: allLearnersQuery.data?.learners ?? [],
      }
    : {
        isLoading: rosterQuery.isLoading,
        isError: rosterQuery.isError,
        learners: rosterQuery.data?.learners ?? [],
      };

  const [modal, setModal] = useState<null | { kind: 'enrol' } | { kind: 'edit'; learner: Learner } | { kind: 'guardian'; learner: Learner }>(null);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Learners</h1>
          <select
            aria-label="Class"
            value={activeClassId ?? ''}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-auto text-sm"
          >
            <option value="all">All learners (school)</option>
            {classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.name}
              </option>
            ))}
            {classes.length === 0 ? <option value="">No classes yet</option> : null}
          </select>
        </div>
        <div className="flex gap-2">
          {can('class:write') ? <AddClassInline /> : null}
          {can('learner:write') ? (
            <button
              type="button"
              onClick={() => setModal({ kind: 'enrol' })}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Enrol learner
            </button>
          ) : null}
        </div>
      </div>

      {roster.isLoading ? <p className="text-sm text-slate-500">Loading roster…</p> : null}
      {roster.isError ? (
        <p className="text-sm text-red-400">Could not load the roster — is the API reachable?</p>
      ) : null}
      {!roster.isLoading && !roster.isError && roster.learners.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6 text-sm text-slate-500">
          {isAllView
            ? 'No learners enrolled in the school yet.'
            : 'No learners enrolled in this class yet.'}
        </p>
      ) : null}
      {!roster.isLoading && !roster.isError && roster.learners.length > 0 ? (
        <RosterTable learners={roster.learners} classes={classes} onAction={setModal} />
      ) : null}

      {modal?.kind === 'enrol' ? (
        <Modal title="Enrol learner" onClose={() => setModal(null)}>
          <EnrolForm classes={classes} defaultClassId={isAllView ? null : activeClassId} onDone={() => setModal(null)} />
        </Modal>
      ) : null}
      {modal?.kind === 'edit' ? (
        <Modal title={`Edit ${modal.learner.firstName}`} onClose={() => setModal(null)}>
          <EditForm learner={modal.learner} classes={classes} onDone={() => setModal(null)} />
        </Modal>
      ) : null}
      {modal?.kind === 'guardian' ? (
        <Modal title={`Add guardian for ${modal.learner.firstName}`} onClose={() => setModal(null)}>
          <GuardianForm learner={modal.learner} onDone={() => setModal(null)} />
        </Modal>
      ) : null}
    </section>
  );
}

function RosterTable({
  learners,
  classes,
  onAction,
}: {
  learners: Learner[];
  classes: SchoolClass[];
  onAction: (action: { kind: 'edit'; learner: Learner } | { kind: 'guardian'; learner: Learner }) => void;
}) {
  const classesById = new Map(classes.map((c) => [c.classId, c.name]));
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Class</th>
            <th className="px-4 py-2.5 font-medium">Born</th>
            <th className="px-4 py-2.5 font-medium">Enrolled</th>
            <th className="px-4 py-2.5 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {learners.map((learner) => (
            <LearnerRow
              key={learner.learnerId}
              learner={learner}
              className={learner.classId ? (classesById.get(learner.classId) ?? '—') : '—'}
              onAction={onAction}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LearnerRow({
  learner,
  className,
  onAction,
}: {
  learner: Learner;
  className: string;
  onAction: (action: { kind: 'edit'; learner: Learner } | { kind: 'guardian'; learner: Learner }) => void;
}) {
  const { can } = usePermissions();
  const [showGuardians, setShowGuardians] = useState(false);

  return (
    <>
      <tr className="hover:bg-slate-900/50">
        <td className="px-4 py-2.5 font-medium">
          <Link to={`/learners/${learner.learnerId}`} className="text-emerald-300 hover:underline">
            {learner.firstName} {learner.lastName}
          </Link>
        </td>
        <td className="px-4 py-2.5 text-slate-400">{className}</td>
        <td className="px-4 py-2.5 text-slate-400">{learner.dateOfBirth ?? '—'}</td>
        <td className="px-4 py-2.5 text-slate-400">{learner.enrolmentDate ?? '—'}</td>
        <td className="px-4 py-2.5 text-right">
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setShowGuardians((s) => !s)}>
              Guardians
            </button>
            {can('learner:write') ? (
              <>
                <button type="button" className="btn-secondary" onClick={() => onAction({ kind: 'edit', learner })}>
                  Edit
                </button>
                {can('learner:delete') ? <DeleteButton learner={learner} /> : null}
              </>
            ) : null}
          </div>
        </td>
      </tr>
      {showGuardians ? (
        <tr>
          <td colSpan={5} className="bg-slate-900/60 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <GuardianList learnerId={learner.learnerId} />
              {can('guardian:write') ? (
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => onAction({ kind: 'guardian', learner })}
                >
                  Add guardian
                </button>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DeleteButton({ learner }: { learner: Learner }) {
  const deleteLearner = useDeleteLearner();
  return (
    <button
      type="button"
      className="btn-secondary text-red-300 hover:bg-red-950/40"
      onClick={() => {
        if (window.confirm(`Remove ${learner.firstName} ${learner.lastName}?`)) {
          deleteLearner.mutate(learner.learnerId);
        }
      }}
    >
      Remove
    </button>
  );
}

function GuardianList({ learnerId }: { learnerId: string }) {
  const guardiansQuery = useLearnerGuardians(learnerId);

  if (guardiansQuery.isLoading) return <p className="text-xs text-slate-500">Loading guardians…</p>;
  const guardians: Guardian[] = guardiansQuery.data?.guardians ?? [];
  if (guardians.length === 0) {
    return <p className="text-xs text-slate-500">No guardians linked to this learner yet.</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {guardians.map((g) => (
        <li key={g.guardianId} className="flex items-center justify-between rounded bg-slate-900 px-3 py-1.5">
          <span className="text-slate-300">{g.fullName}</span>
          <a href={`tel:${g.phone}`} className="text-emerald-400 hover:underline">
            {g.phone}
          </a>
        </li>
      ))}
    </ul>
  );
}

function AddClassInline() {
  const createClass = useCreateClass();
  const [name, setName] = useState('');
  return (
    <div className="space-y-1">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() !== '') {
            createClass.mutate({ name: name.trim() });
            setName('');
          }
        }}
      >
        <input
          aria-label="New class name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New class…"
          className="input w-36"
        />
        <button type="submit" className="btn-secondary" disabled={createClass.isPending}>
          Add class
        </button>
      </form>
      {createClass.error ? (
        <p className="text-xs text-red-400">Couldn't add class: {createClass.error.message}</p>
      ) : null}
    </div>
  );
}

function EnrolForm({
  classes,
  defaultClassId,
  onDone,
}: {
  classes: SchoolClass[];
  defaultClassId: string | null;
  onDone: () => void;
}) {
  const createLearner = useCreateLearner();
  return (
    <div className="space-y-2">
      <LearnerForm
        classes={classes}
        defaultClassId={defaultClassId}
        submitting={createLearner.isPending}
        submitLabel="Enrol"
        onSubmit={(values: LearnerFormValues) => {
          createLearner.mutate(
            {
              firstName: values.firstName,
              lastName: values.lastName,
              ...(values.dateOfBirth !== '' ? { dateOfBirth: values.dateOfBirth } : {}),
              ...(values.gender !== '' ? { gender: values.gender } : {}),
              ...(values.avatarKey !== '' ? { avatarKey: values.avatarKey } : {}),
              ...(values.classId !== '' ? { classId: values.classId } : {}),
              ...(values.enrolmentDate !== '' ? { enrolmentDate: values.enrolmentDate } : {}),
            },
            { onSuccess: onDone },
          );
        }}
      />
      {createLearner.error ? (
        <p className="text-xs text-red-400">Couldn't enrol learner: {createLearner.error.message}</p>
      ) : null}
    </div>
  );
}

function EditForm({
  learner,
  classes,
  onDone,
}: {
  learner: Learner;
  classes: SchoolClass[];
  onDone: () => void;
}) {
  const updateLearner = useUpdateLearner();
  return (
    <div className="space-y-2">
      <LearnerForm
        initial={learner}
        classes={classes}
        submitting={updateLearner.isPending}
        submitLabel="Save changes"
        onSubmit={(values) => {
          updateLearner.mutate(
            {
              learnerId: learner.learnerId,
              input: {
                firstName: values.firstName,
                lastName: values.lastName,
                ...(values.dateOfBirth !== '' ? { dateOfBirth: values.dateOfBirth } : {}),
                ...(values.gender !== '' ? { gender: values.gender } : {}),
                ...(values.avatarKey !== '' ? { avatarKey: values.avatarKey } : {}),
                ...(values.classId !== '' ? { classId: values.classId } : {}),
                ...(values.enrolmentDate !== '' ? { enrolmentDate: values.enrolmentDate } : {}),
              },
            },
            { onSuccess: onDone },
          );
        }}
      />
      {updateLearner.error ? (
        <p className="text-xs text-red-400">Couldn't save changes: {updateLearner.error.message}</p>
      ) : null}
    </div>
  );
}

function GuardianForm({ learner, onDone }: { learner: Learner; onDone: () => void }) {
  const createGuardian = useCreateGuardian();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [address, setAddress] = useState('');
  const [relationship, setRelationship] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  return (
    <form
      className="space-y-4"
      data-testid="guardian-form"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = guardianCreateSchema.safeParse({
          fullName: fullName.trim(),
          phone: phone.trim(),
          ...(idNumber.trim() !== '' ? { idNumber: idNumber.trim() } : {}),
          ...(address.trim() !== '' ? { address: address.trim() } : {}),
          ...(relationship.trim() !== '' ? { relationship: relationship.trim() } : {}),
          learnerIds: [learner.learnerId],
        });
        if (!parsed.success) {
          setIssues(zodIssues(parsed.error));
          return;
        }
        setIssues([]);
        createGuardian.mutate(toGuardianCreateInput(parsed.data), { onSuccess: onDone });
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Full name</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" placeholder="MaDube" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Phone (E.164, e.g. +263771234567)</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="+263…" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Relationship to learner</span>
        <input
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          className="input"
          placeholder="mother, father, aunt…"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">ID number</span>
        <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className="input" placeholder="national ID / passport" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Address</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} className="input" placeholder="home address" />
      </label>
      {issues.length > 0 ? <p className="text-xs text-red-300">{issues.join(' · ')}</p> : null}
      <button
        type="submit"
        disabled={createGuardian.isPending}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
      >
        {createGuardian.isPending ? 'Saving…' : 'Add guardian'}
      </button>
    </form>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
