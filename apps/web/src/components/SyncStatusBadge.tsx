import { useSyncStatus } from '../offline/sync';

const STATE_STYLES: Record<string, { dot: string; label: string }> = {
  idle: { dot: 'bg-emerald-400', label: 'synced' },
  syncing: { dot: 'bg-sky-400 animate-pulse', label: 'syncing…' },
  error: { dot: 'bg-amber-400', label: 'retry pending' },
  offline: { dot: 'bg-slate-500', label: 'offline' },
};

/** Live offline-sync indicator backed by the SyncController external store. */
export function SyncStatusBadge() {
  const status = useSyncStatus();
  const style = STATE_STYLES[status.state] ?? STATE_STYLES['idle']!;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-400">
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {style.label}
      {status.pending > 0 ? (
        <span className="text-slate-500">
          · {status.pending} queued
        </span>
      ) : null}
      {status.lastSyncedAt ? (
        <span className="text-slate-600" title={new Date(status.lastSyncedAt).toLocaleTimeString()}>
          · {new Date(status.lastSyncedAt).toLocaleTimeString()}
        </span>
      ) : null}
    </span>
  );
}
