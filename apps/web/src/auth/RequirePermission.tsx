import { hasPermission, type Permission } from '@dzidzo/core';
import type { ReactNode } from 'react';
import { useAuth } from 'react-oidc-context';
import { staffProfileFrom } from './profile';

/**
 * UI-level gate. Cosmetic only: the API enforces the same permission
 * server-side (middleware + matrix in @dzidzo/core), so the UI can never be
 * the security boundary — it just avoids dead ends.
 */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const auth = useAuth();
  const profile = staffProfileFrom(auth.user);

  if (!profile?.role || !hasPermission(profile.role, permission)) {
    return (
      <div className="rounded-lg border border-amber-900/60 bg-amber-950/40 p-6 text-amber-200">
        <h2 className="text-lg font-semibold">Access denied</h2>
        <p className="mt-2 text-sm text-amber-300/80">
          Your role ({profile?.role ?? 'unknown'}) does not include{' '}
          <code className="rounded bg-amber-900/50 px-1.5 py-0.5 text-xs">{permission}</code>. Ask a
          director if you need access.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
