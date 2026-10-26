import type { StaffMember, StudyMaterial } from '@dzidzo/core';
import { staffCreateSchema, zodIssues } from '@dzidzo/core';
import { useState, type FormEvent } from 'react';
import { useApiClient } from '../api/ApiContext';
import {
  useAddMaterial,
  useAddStaff,
  useDeleteMaterial,
  useFileUrl,
  useMaterials,
  useStaff,
  useUpdateStaff,
} from '../api/queries';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Teacher study-material library. Every staff member can browse and download;
 * teachers+ upload and remove (materials:write).
 */
export function MaterialsPage() {
  const materialsQuery = useMaterials();
  const deleteMaterial = useDeleteMaterial();
  const { can } = usePermissions();
  const materials = materialsQuery.data?.materials ?? [];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Study materials</h1>
          <p className="mt-1 text-sm text-slate-400">
            Curriculum and learning resources shared by the teaching team.
          </p>
        </div>
      </div>

      {can('materials:write') ? <AddMaterialForm /> : null}

      {materialsQuery.isLoading ? <p className="text-sm text-slate-500">Loading materials…</p> : null}
      {materials.length === 0 && !materialsQuery.isLoading ? (
        <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6 text-sm text-slate-500">
          No materials uploaded yet.
        </p>
      ) : null}

      <ul className="space-y-2">
        {materials.map((material: StudyMaterial) => (
          <MaterialRow key={material.materialId} material={material} canDelete={can('materials:write')} onDelete={() => deleteMaterial.mutate(material.materialId)} />
        ))}
      </ul>
    </section>
  );
}

function MaterialRow({
  material,
  canDelete,
  onDelete,
}: {
  material: StudyMaterial;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const fileUrl = useFileUrl(material.fileKey);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-100">{material.title}</p>
        <p className="text-xs text-slate-500">
          {material.subject ? `${material.subject} · ` : ''}
          {material.description ? `${material.description} · ` : ''}
          added {material.createdAt.slice(0, 10)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {fileUrl.data ? (
          <a href={fileUrl.data} download className="btn-secondary text-xs">
            Download
          </a>
        ) : (
          <span className="text-xs text-slate-500">loading…</span>
        )}
        {canDelete ? (
          <button type="button" className="btn-secondary text-xs text-red-300" onClick={onDelete}>
            Remove
          </button>
        ) : null}
      </div>
    </li>
  );
}

function AddMaterialForm() {
  const client = useApiClient();
  const addMaterial = useAddMaterial();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (title.trim() === '' || file === null) {
      setError('A title and a file are required.');
      return;
    }
    setBusy(true);
    try {
      const { key, uploadUrl } = await client.post<{ key: string; uploadUrl: string }>('/uploads', {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        kind: 'materials',
      });
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type || 'application/octet-stream' },
      });
      if (!put.ok) {
        throw new Error(`file upload failed with status ${put.status}`);
      }
      await addMaterial.mutateAsync({
        title: title.trim(),
        fileKey: key,
        ...(subject.trim() !== '' ? { subject: subject.trim() } : {}),
        ...(description.trim() !== '' ? { description: description.trim() } : {}),
      });
      setTitle('');
      setSubject('');
      setDescription('');
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to add material');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Phonics worksheet pack" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" placeholder="Literacy" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Description</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="optional" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">File</span>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs text-slate-400 file:mr-2 file:rounded-md file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-slate-200"
        />
      </label>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? 'Uploading…' : 'Add material'}
      </button>
    </form>
  );
}

/**
 * Director-only staff administration: profiles, certificates, salary.
 * The whole page is gated by user:manage in the router.
 */
export function StaffPage() {
  const staffQuery = useStaff();
  const [editingId, setEditingId] = useState<string | null>(null);
  const staff = staffQuery.data?.staff ?? [];

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
        <p className="mt-1 text-sm text-slate-400">
          Profiles, certificates and salaries — visible to directors only.
        </p>
      </div>

      <AddStaffForm />

      {staffQuery.isLoading ? <p className="text-sm text-slate-500">Loading staff…</p> : null}
      <ul className="space-y-3">
        {staff.map((member: StaffMember) => (
          <li key={member.staffId} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <StaffCard member={member} editing={editingId === member.staffId} onToggleEdit={() => setEditingId(editingId === member.staffId ? null : member.staffId)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StaffCard({ member, editing, onToggleEdit }: { member: StaffMember; editing: boolean; onToggleEdit: () => void }) {
  const client = useApiClient();
  const updateStaff = useUpdateStaff();
  const [address, setAddress] = useState(member.address ?? '');
  const [idNumber, setIdNumber] = useState(member.idNumber ?? '');
  const [certificates, setCertificates] = useState((member.certificates ?? []).join(', '));
  const [monthlySalary, setMonthlySalary] = useState(String(member.monthlySalary));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarUrl = useFileUrl(member.avatarKey);

  async function uploadAvatar(file: File) {
    setUploading(true);
    setError(null);
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
      await updateStaff.mutateAsync({ staffId: member.staffId, patch: { avatarKey: key } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setUploading(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    updateStaff.mutate(
      {
        staffId: member.staffId,
        patch: {
          address,
          idNumber,
          monthlySalary: Number(monthlySalary) || member.monthlySalary,
          certificates: certificates
            .split(',')
            .map((c) => c.trim())
            .filter((c) => c !== ''),
        },
      },
      {
        onSuccess: onToggleEdit,
        onError: (err) => setError(err instanceof Error ? err.message : 'failed to save'),
      },
    );
  }

  return (
    <div className="flex items-start gap-4">
      {member.avatarKey && avatarUrl.data ? (
        <img src={avatarUrl.data} alt={member.fullName} className="h-14 w-14 rounded-full border border-slate-700 object-cover" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-slate-700 text-sm text-slate-500">
          {member.fullName.slice(0, 1)}
        </div>
      )}
      <div className="flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-100">{member.fullName}</p>
            <p className="text-xs text-slate-500">
              {member.role} · salary ${member.monthlySalary.toFixed(2)}/month
              {member.idNumber ? ` · ID ${member.idNumber}` : ''}
            </p>
            {member.address ? <p className="text-xs text-slate-500">{member.address}</p> : null}
            {member.certificates && member.certificates.length > 0 ? (
              <p className="mt-1 text-xs text-amber-300">🏅 {member.certificates.join(' · ')}</p>
            ) : null}
          </div>
          <button type="button" className="btn-secondary text-xs" onClick={onToggleEdit}>
            {editing ? 'Cancel' : 'Edit profile'}
          </button>
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-3 space-y-2 border-t border-slate-800 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">
                <span className="mb-1 block text-slate-500">Address</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className="input" />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-slate-500">ID number</span>
                <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className="input" />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-slate-500">Certificates (comma-separated)</span>
                <input value={certificates} onChange={(e) => setCertificates(e.target.value)} className="input" />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-slate-500">Monthly salary (USD)</span>
                <input value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} className="input" />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-slate-500">Photo{uploading ? ' (uploading…)' : ''}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadAvatar(file);
                  }}
                  className="text-xs text-slate-400 file:mr-2 file:rounded-md file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-slate-200"
                />
              </label>
            </div>
            {error ? <p className="text-xs text-red-400">{error}</p> : null}
            <button type="submit" className="btn-secondary text-xs" disabled={updateStaff.isPending}>
              Save profile
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function AddStaffForm() {
  const addStaff = useAddStaff();
  const [formData, setFormData] = useState({
    fullName: '',
    role: 'teacher',
    monthlySalary: '',
    idNumber: '',
    phone: '',
    email: '',
    dateOfBirth: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = staffCreateSchema.safeParse({
      fullName: formData.fullName.trim(),
      role: formData.role.trim(),
      monthlySalary: Number(formData.monthlySalary) || 0,
      idNumber: formData.idNumber.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      dateOfBirth: formData.dateOfBirth,
    });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    setIssues([]);
    addStaff.mutate(parsed.data, {
      onSuccess: () => {
        setFormData({
          fullName: '',
          role: 'teacher',
          monthlySalary: '',
          idNumber: '',
          phone: '',
          email: '',
          dateOfBirth: '',
        });
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'failed to add staff'),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Full name *</span>
          <input
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            className="input"
            placeholder="Tariro Moyo"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Role *</span>
          <input
            name="role"
            value={formData.role}
            onChange={handleChange}
            className="input"
            placeholder="teacher"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Monthly salary (USD) *</span>
          <input
            name="monthlySalary"
            type="number"
            step="0.01"
            min="0"
            value={formData.monthlySalary}
            onChange={handleChange}
            className="input"
            placeholder="450"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">ID number *</span>
          <input
            name="idNumber"
            value={formData.idNumber}
            onChange={handleChange}
            className="input"
            placeholder="123456789"
            required
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-slate-400">Phone (E.164) *</span>
          <input
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="input"
            placeholder="+263771234567"
            required
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-slate-400">Email *</span>
          <input
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            className="input"
            placeholder="staff@school.example"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Date of birth *</span>
          <input
            name="dateOfBirth"
            type="date"
            value={formData.dateOfBirth}
            onChange={handleChange}
            className="input"
            required
          />
        </label>
      </div>
      {issues.length > 0 && (
        <ul className="text-xs text-red-400 space-y-1">
          {issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={addStaff.isPending}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
      >
        Add staff member
      </button>
    </form>
  );
}