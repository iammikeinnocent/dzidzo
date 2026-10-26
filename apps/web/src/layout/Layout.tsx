import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from 'react-oidc-context';
import { hasPermission } from '@dzidzo/core';
import { staffProfileFrom } from '../auth/profile';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm transition-colors ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
  }`;

export function Layout({
  activeTenant,
  onSwitchTenant,
}: {
  activeTenant?: string | undefined;
  onSwitchTenant?: ((tenantId: string) => void) | undefined;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const profile = staffProfileFrom(auth.user);
  const canSwitch = (profile?.tenantIds.length ?? 0) > 1 && onSwitchTenant !== undefined;
  const active = activeTenant ?? profile?.tenantId ?? '';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold tracking-tight">
              Dzidzo<span className="text-emerald-400">.</span>
            </span>
            <nav className="flex items-center gap-1">
              <NavLink to="/" end className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/learners" className={navLinkClass}>
                Learners
              </NavLink>
              <NavLink to="/attendance" className={navLinkClass}>
                Attendance
              </NavLink>
              <NavLink to="/materials" className={navLinkClass}>
                Materials
              </NavLink>
              {profile?.role && hasPermission(profile.role, 'user:manage') ? (
                <NavLink to="/staff" className={navLinkClass}>
                  Staff
                </NavLink>
              ) : null}
              {profile?.role && hasPermission(profile.role, 'finance:read') ? (
                <NavLink to="/finance" className={navLinkClass}>
                  Finance
                </NavLink>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {canSwitch && profile ? (
              <select
                aria-label="School"
                value={active}
                onChange={(e) => onSwitchTenant(e.target.value)}
                className="text-sm"
              >
                {profile.tenantIds.map((tenantId) => (
                  <option key={tenantId} value={tenantId}>
                    {tenantId === 'demo' ? 'Demo school' : tenantId}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="text-right text-xs leading-tight">
              <p className="font-medium text-slate-200">{profile?.email ?? 'Signed in'}</p>
              <p className="text-slate-500">
                {profile?.role ?? 'unknown role'}
                {profile?.tenantId ? ` · ${profile.tenantId}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await auth.signoutRedirect();
                navigate('/');
              }}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
