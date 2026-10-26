import type { AttendanceRecord, Learner } from '@dzidzo/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useApiClient } from '../api/ApiContext';
import { useClasses } from '../api/queries';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { usePermissions } from '../hooks/usePermissions';
import { drainNow, offlineStore, useSyncStatus } from '../offline/sync';
import type { LocalAttendance } from '../offline/db';

function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

interface RegisterRow {
  learnerId: string;
  name: string;
  present: boolean | null; // null = not marked
  unsynced: boolean;
}

/**
 * Offline-first register: marks are written to IndexedDB immediately and
 * drained to the API by the sync engine. The day view merges server state
 * with unsynced local marks (local wins visually until synced) and falls
 * back to the local roster when the API is unreachable.
 */
export function AttendancePage() {
  const { profile } = usePermissions();
  const api = useApiClient();
  const sync = useSyncStatus();
  const classesQuery = useClasses();
  const [day, setDay] = useState(todayYmd());
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [localMarks, setLocalMarks] = useState<LocalAttendance[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const classes = classesQuery.data?.classes ?? [];
  const classId = selectedClassId ?? classes[0]?.classId ?? null;

  const refreshLocal = async (forDay: string) => {
    setLocalMarks((await offlineStore()?.attendanceForDay(forDay)) ?? []);
  };

  useEffect(() => {
    void refreshLocal(day);
  }, [day, sync.pending]);

  // Online-first reads; local fallback when the API is unreachable.
  const rosterQuery = useQuery({
    queryKey: ['attendance-roster', classId],
    queryFn: async (): Promise<{ learners: Learner[]; offline: boolean }> => {
      try {
        const res = await api.get<{ classId: string; learners: Learner[] }>(
          `/learners?classId=${encodeURIComponent(classId as string)}`,
        );
        return { learners: res.learners, offline: false };
      } catch {
        const local = await offlineStore()?.learnersForClass(classId as string);
        return { learners: local ?? [], offline: true };
      }
    },
    enabled: classId !== null,
  });

  const dayQuery = useQuery({
    queryKey: ['attendance-day', day],
    queryFn: async (): Promise<{ records: AttendanceRecord[]; offline: boolean }> => {
      try {
        const res = await api.get<{ day: string; records: AttendanceRecord[] }>(
          `/attendance?day=${day}`,
        );
        return { records: res.records, offline: false };
      } catch {
        const local = await offlineStore()?.attendanceForDay(day);
        const records: AttendanceRecord[] = (local ?? []).map((row) => ({
          tenantId: 'local',
          day: row.day,
          learnerId: row.learnerId,
          present: row.present,
          ...(row.markedBy !== undefined ? { markedBy: row.markedBy } : {}),
          updatedAt: row.updatedAt,
        }));
        return { records, offline: true };
      }
    },
  });

  const rows: RegisterRow[] = useMemo(() => {
    const server = new Map<string, AttendanceRecord>();
    for (const record of dayQuery.data?.records ?? []) {
      server.set(record.learnerId, record);
    }
    // Unsynced local marks overlay server state until the engine acks them.
    const pending = new Map(
      localMarks.filter((m) => m.syncedAt === null).map((m) => [m.learnerId, m]),
    );

    return (rosterQuery.data?.learners ?? []).map((learner) => {
      const pendingMark = pending.get(learner.learnerId);
      const record = server.get(learner.learnerId);
      return {
        learnerId: learner.learnerId,
        name: `${learner.firstName} ${learner.lastName}`,
        present: pendingMark ? pendingMark.present : record ? record.present : null,
        unsynced: pendingMark !== undefined,
      };
    });
  }, [dayQuery.data, rosterQuery.data, localMarks]);

  async function mark(learnerId: string, present: boolean) {
    const store = offlineStore();
    if (!store) {
      return;
    }
    await store.markAttendance({
      day,
      learnerId,
      present,
      markedBy: profile?.userId ?? 'unknown',
    });
    await refreshLocal(day);
    await dayQuery.refetch();
    await drainNow();
    await refreshLocal(day);
  }

  const markedCount = rows.filter((r) => r.present !== null).length;

  const downloadCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await api.getBlob('/attendance/export');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `attendance-${todayYmd()}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
          <SyncStatusBadge />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void downloadCsv()}
            disabled={exporting}
            title="Downloads the last 3 months of marks as CSV"
          >
            {exporting ? 'Preparing…' : 'Download CSV'}
          </button>
          {exportError ? <span className="text-xs text-red-400">{exportError}</span> : null}
          <label className="text-slate-400" htmlFor="attendance-day">
            Day
          </label>
          <input
            id="attendance-day"
            type="date"
            value={ymdToIso(day)}
            onChange={(e) => setDay(isoToYmd(e.target.value))}
            className="input w-auto"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <select
          aria-label="Class"
          value={classId ?? ''}
          onChange={(e) => setSelectedClassId(e.target.value)}
          className="input w-auto"
        >
          {classes.map((c) => (
            <option key={c.classId} value={c.classId}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          {markedCount}/{rows.length} marked{rosterQuery.data?.offline ? ' · offline roster' : ''}
        </span>
      </div>

      {rosterQuery.isLoading ? <p className="text-sm text-slate-500">Loading roster…</p> : null}

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Learner</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Mark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row) => (
              <tr key={row.learnerId} className="hover:bg-slate-900/50">
                <td className="px-4 py-2.5 font-medium">
                  {row.name}
                  {row.unsynced ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-400">
                      queued
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  {row.present === null ? (
                    <span className="text-slate-600">not marked</span>
                  ) : row.present ? (
                    <span className="rounded-full bg-emerald-950/60 px-2.5 py-1 text-xs text-emerald-300">
                      present
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-950/60 px-2.5 py-1 text-xs text-red-300">
                      absent
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className={`btn-secondary ${row.present === true ? 'ring-1 ring-emerald-500 text-emerald-300' : ''}`}
                      onClick={() => void mark(row.learnerId, true)}
                    >
                      Present
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary ${row.present === false ? 'ring-1 ring-red-500 text-red-300' : ''}`}
                      onClick={() => void mark(row.learnerId, false)}
                    >
                      Absent
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !rosterQuery.isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                  No learners in this class yet — enrol them on the Learners page.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Marks are stored on-device first (IndexedDB + outbox) and sync idempotently — safe with no
        connectivity.
      </p>
    </section>
  );
}

function ymdToIso(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function isoToYmd(iso: string): string {
  const compact = iso.replaceAll('-', '');
  return /^\d{8}$/.test(compact) ? compact : todayYmd();
}
