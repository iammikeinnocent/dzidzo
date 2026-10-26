import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CurriculumItem,
  FeePayment,
  Guardian,
  Learner,
  LearnerCertificate,
  LearnerCertificateCreateInput,
  LearnerNote,
  LearnerReport,
  LearnerReportCreateInput,
  SchoolClass,
  StaffMember,
  StudyMaterial,
  StudyMaterialCreateInput,
} from '@dzidzo/core';
import { useApiClient } from './ApiContext';

export interface RosterResponse {
  classId: string;
  learners: Learner[];
}

export function useClasses() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['classes'],
    queryFn: () => client.get<{ classes: SchoolClass[] }>('/classes'),
  });
}

export function useCreateClass() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => client.post<SchoolClass>('/classes', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['classes'] }),
  });
}

/** Signed-URL-backed file fetch: turns an asset key into a displayable object URL. */
export function useFileUrl(key: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['file', key],
    queryFn: async () => {
      const { url } = await client.get<{ url: string }>(`/files/${encodeURIComponent(key as string)}`);
      return url;
    },
    enabled: key !== undefined && key !== '',
    staleTime: 4 * 60 * 1000,
  });
}

export function useRoster(classId: string | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['roster', classId],
    queryFn: () =>
      client.get<RosterResponse>(`/learners?classId=${encodeURIComponent(classId as string)}`),
    enabled: classId !== null,
  });
}

// ---------- learner detail ----------

export function useLearner(learnerId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['learner', learnerId],
    queryFn: () => client.get<Learner>(`/learners/${encodeURIComponent(learnerId as string)}`),
    enabled: learnerId !== undefined && learnerId !== '',
  });
}

export function useLearnerNotes(learnerId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['learner-notes', learnerId],
    queryFn: () =>
      client.get<{ notes: LearnerNote[] }>(`/learners/${encodeURIComponent(learnerId as string)}/notes`),
    enabled: learnerId !== undefined && learnerId !== '',
  });
}

export function useAddLearnerNote(learnerId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      client.post<LearnerNote>(`/learners/${encodeURIComponent(learnerId)}/notes`, { text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['learner-notes', learnerId] }),
  });
}

export function useLearnerReports(learnerId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['learner-reports', learnerId],
    queryFn: () =>
      client.get<{ reports: LearnerReport[] }>(`/learners/${encodeURIComponent(learnerId as string)}/reports`),
    enabled: learnerId !== undefined && learnerId !== '',
  });
}

export function useAddLearnerReport(learnerId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LearnerReportCreateInput) =>
      client.post<LearnerReport>(`/learners/${encodeURIComponent(learnerId)}/reports`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['learner-reports', learnerId] }),
  });
}

export function useLearnerCurriculum(learnerId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['learner-curriculum', learnerId],
    queryFn: () =>
      client.get<{ items: CurriculumItem[] }>(`/learners/${encodeURIComponent(learnerId as string)}/curriculum`),
    enabled: learnerId !== undefined && learnerId !== '',
  });
}

export function useAddCurriculumItem(learnerId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { subject: string; term?: string; done: boolean }) =>
      client.post<CurriculumItem>(`/learners/${encodeURIComponent(learnerId)}/curriculum`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['learner-curriculum', learnerId] }),
  });
}

export function useLearnerCertificates(learnerId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['learner-certificates', learnerId],
    queryFn: () =>
      client.get<{ certificates: LearnerCertificate[] }>(
        `/learners/${encodeURIComponent(learnerId as string)}/certificates`,
      ),
    enabled: learnerId !== undefined && learnerId !== '',
  });
}

export function useAddLearnerCertificate(learnerId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LearnerCertificateCreateInput) =>
      client.post<LearnerCertificate>(`/learners/${encodeURIComponent(learnerId)}/certificates`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['learner-certificates', learnerId] }),
  });
}

export function useLearnerPayments(learnerId: string | undefined, enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['learner-payments', learnerId],
    queryFn: () =>
      client.get<{ payments: FeePayment[] }>(`/learners/${encodeURIComponent(learnerId as string)}/payments`),
    enabled: enabled && learnerId !== undefined && learnerId !== '',
  });
}

// ---------- staff + materials ----------

export function useStaff() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['staff'],
    queryFn: () => client.get<{ staff: StaffMember[] }>('/staff'),
  });
}

export function useAddStaff() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => client.post<StaffMember>('/staff', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });
}

export function useUpdateStaff() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, patch }: { staffId: string; patch: Record<string, unknown> }) =>
      client.patch<StaffMember>(`/staff/${encodeURIComponent(staffId)}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });
}

export function useMaterials() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['materials'],
    queryFn: () => client.get<{ materials: StudyMaterial[] }>('/materials'),
  });
}

export function useAddMaterial() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StudyMaterialCreateInput) => client.post<StudyMaterial>('/materials', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['materials'] }),
  });
}

export function useDeleteMaterial() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (materialId: string) => client.delete<{ deleted: boolean }>(`/materials/${encodeURIComponent(materialId)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['materials'] }),
  });
}

/** Tenant-wide learner list — GET /learners without a classId. */
export function useAllLearners(enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['learners', 'all'],
    queryFn: () => client.get<{ learners: Learner[] }>('/learners'),
    enabled,
  });
}

export function useCreateLearner() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => client.post<Learner>('/learners', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roster'] }),
  });
}

export function useUpdateLearner() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, input }: { learnerId: string; input: unknown }) =>
      client.patch<Learner>(`/learners/${encodeURIComponent(learnerId)}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roster'] }),
  });
}

export function useDeleteLearner() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (learnerId: string) =>
      client.delete<{ deleted: boolean }>(`/learners/${encodeURIComponent(learnerId)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roster'] }),
  });
}

export function useLearnerGuardians(learnerId: string | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['guardians', learnerId],
    queryFn: () =>
      client.get<{ learnerId: string; guardians: Guardian[] }>(
        `/guardians?learnerId=${encodeURIComponent(learnerId as string)}`,
      ),
    enabled: learnerId !== null,
  });
}

export function useCreateGuardian() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => client.post<Guardian>('/guardians', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guardians'] }),
  });
}

export interface TeacherDashboardData {
  learners: { learnerId: string; firstName: string; lastName: string; classId: string }[];
  attendance: { present: number; marked: number; rate: number };
  birthdays: { name: string; class: string }[];
  classes: { classId: string; name: string }[];
}

export function useTeacherDashboard() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['dashboard', 'teacher'],
    queryFn: () => client.get<TeacherDashboardData>('/reports/dashboard/teacher'),
  });
}

export interface DirectorDashboardData {
  feesCollected: number;
  byMethod: Record<string, number>;
  byCategory: Record<string, number>;
  recent: { id: string; date: string; amount: number; method: string; learnerName: string }[];
  payrollNet: number | null;
  payrollRun: boolean;
}

export function useDirectorDashboard() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['dashboard', 'director'],
    queryFn: () => client.get<DirectorDashboardData>('/reports/dashboard/director'),
  });
}

export interface FinanceTrendMonth {
  month: string;
  income: number;
  expenses: number;
  payrollNet: number | null;
}

export function useFinanceTrend(months = 6) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['finance-trend', months],
    queryFn: () => client.get<{ months: FinanceTrendMonth[] }>(`/reports/monthly?months=${months}`),
  });
}

export function useQuickAttendanceMark() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { learnerId: string; present: boolean }) =>
      client.post<{ marked: boolean }>('/attendance/quick', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'teacher'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-day'] });
    },
  });
}
