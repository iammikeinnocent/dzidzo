import { useAuth } from 'react-oidc-context';
import { staffProfileFrom } from '../auth/profile';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { usePermissions } from '../hooks/usePermissions';
import { TeacherDashboard } from './TeacherDashboard';
import { DirectorDashboard } from './DirectorDashboard';

export function Dashboard() {
  const auth = useAuth();
  const { can } = usePermissions();
  const profile = staffProfileFrom(auth.user);

  const isDirector = can('finance:read') && profile?.role === 'director';
  const isManager = profile?.role === 'manager';
  const isTeacher = profile?.role === 'teacher';

  if (isDirector) {
    return <DirectorDashboard />;
  }

  if (isTeacher || isManager) {
    return <TeacherDashboard />;
  }

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome</h1>
          <p className="mt-1 text-sm text-slate-400">
            {profile?.tenantId
              ? `Signed in for school ${profile.tenantId}.`
              : 'Signed in.'}
          </p>
        </div>
        <SyncStatusBadge />
      </div>
      <p className="text-slate-400">Your role does not have a dedicated dashboard view.</p>
    </section>
  );
}