import type { Learner } from '@dzidzo/core';
import { ageFrom, learnerCreateSchema, zodIssues } from '@dzidzo/core';
import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useApiClient } from '../api/ApiContext';
import { useFileUrl } from '../api/queries';

export interface LearnerFormValues {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'F' | 'M' | 'other' | '';
  avatarKey: string;
  classId: string;
  enrolmentDate: string;
}

const emptyValues: LearnerFormValues = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  avatarKey: '',
  classId: '',
  enrolmentDate: '',
};

/**
 * Shared form for enrol and edit. Validation runs against the SAME zod schema
 * the API validates with (@dzidzo/core) — one validation source, client and
 * server agree by construction. Age is computed live from the date of birth.
 */
export function LearnerForm({
  initial,
  classes,
  defaultClassId,
  submitting,
  onSubmit,
  submitLabel,
}: {
  initial?: Learner;
  classes: SchoolClassOption[];
  defaultClassId?: string | null;
  submitting: boolean;
  onSubmit: (values: LearnerFormValues) => void;
  submitLabel: string;
}) {
  const client = useApiClient();
  const [values, setValues] = useState<LearnerFormValues>({
    ...emptyValues,
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    dateOfBirth: initial?.dateOfBirth ?? '',
    gender: initial?.gender ?? '',
    avatarKey: initial?.avatarKey ?? '',
    classId: initial?.classId ?? defaultClassId ?? '',
    enrolmentDate: initial?.enrolmentDate ?? '',
  });
  const [issues, setIssues] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const avatarUrl = useFileUrl(values.avatarKey || undefined);
  const age = ageFrom(values.dateOfBirth || undefined);

  const set = (field: keyof LearnerFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  async function handleAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { key, uploadUrl } = await client.post<{ key: string; uploadUrl: string }>('/uploads', {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        kind: 'avatars',
      });
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type || 'application/octet-stream' },
      });
      if (!put.ok) {
        throw new Error(`upload failed with status ${put.status}`);
      }
      setValues((current) => ({ ...current, avatarKey: key }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = learnerCreateSchema.safeParse({
      firstName: values.firstName,
      lastName: values.lastName,
      ...(values.dateOfBirth !== '' ? { dateOfBirth: values.dateOfBirth } : {}),
      ...(values.gender !== '' ? { gender: values.gender } : {}),
      ...(values.avatarKey !== '' ? { avatarKey: values.avatarKey } : {}),
      ...(values.classId !== '' ? { classId: values.classId } : {}),
      ...(values.enrolmentDate !== '' ? { enrolmentDate: values.enrolmentDate } : {}),
    });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    setIssues([]);
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="learner-form">
      <div className="flex items-center gap-3">
        {values.avatarKey && avatarUrl.data ? (
          <img
            src={avatarUrl.data}
            alt="Learner avatar preview"
            className="h-14 w-14 rounded-full border border-slate-700 object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-slate-700 text-xs text-slate-500">
            no photo
          </div>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Photo</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarFile}
            disabled={uploading}
            className="text-xs text-slate-400 file:mr-2 file:rounded-md file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-slate-200"
          />
          {uploading ? <span className="ml-2 text-xs text-slate-500">uploading…</span> : null}
          {uploadError ? <span className="ml-2 text-xs text-red-400">{uploadError}</span> : null}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <input
            value={values.firstName}
            onChange={(e) => set('firstName')(e.target.value)}
            className="input"
            placeholder="Tendai"
          />
        </Field>
        <Field label="Surname">
          <input
            value={values.lastName}
            onChange={(e) => set('lastName')(e.target.value)}
            className="input"
            placeholder="Moyo"
          />
        </Field>
        <Field label="Date of birth">
          <input
            type="date"
            value={values.dateOfBirth}
            onChange={(e) => set('dateOfBirth')(e.target.value)}
            className="input"
          />
          <span className="mt-1 block text-xs text-slate-500">
            {values.dateOfBirth === '' ? 'age appears once the date is set' : age === null ? 'invalid date' : `age: ${age}`}
          </span>
        </Field>
        <Field label="Gender">
          <select value={values.gender} onChange={(e) => set('gender')(e.target.value)} className="input">
            <option value="">Unspecified</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Enrolled on">
          <input
            type="date"
            value={values.enrolmentDate}
            onChange={(e) => set('enrolmentDate')(e.target.value)}
            className="input"
          />
        </Field>
      </div>
      <Field label="Class">
        <select value={values.classId} onChange={(e) => set('classId')(e.target.value)} className="input">
          <option value="">Unassigned</option>
          {classes.map((c) => (
            <option key={c.classId} value={c.classId}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      {issues.length > 0 ? (
        <ul className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

export interface SchoolClassOption {
  classId: string;
  name: string;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-400">{label}</span>
      {children}
    </label>
  );
}