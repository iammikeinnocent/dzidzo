import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from 'react-oidc-context';
import { RequirePermission } from './auth/RequirePermission';
import { Layout } from './layout/Layout';
import { CallbackPage, LoginPrompt } from './pages/Auth';
import { AttendancePage } from './pages/Attendance';
import { Dashboard } from './pages/Dashboard';
import { FinancePage } from './pages/Finance';
import { LearnersPage } from './pages/Learners';
import { LearnerDetailPage } from './pages/LearnerDetail';
import { MaterialsPage, StaffPage } from './pages/StaffAndMaterials';

export function App({
  activeTenant,
  onSwitchTenant,
}: {
  activeTenant?: string | undefined;
  onSwitchTenant?: ((tenantId: string) => void) | undefined;
}) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <p className="text-sm">Loading…</p>
      </main>
    );
  }

  if (!auth.isAuthenticated && location.pathname !== '/auth/callback') {
    return <LoginPrompt />;
  }

  return (
    <Routes>
      <Route path="/auth/callback" element={<CallbackPage />} />
      <Route
      element={<Layout activeTenant={activeTenant} onSwitchTenant={onSwitchTenant} />}
    >
        <Route index element={<Dashboard />} />
        <Route path="learners" element={<LearnersPage />} />
        <Route path="learners/:learnerId" element={<LearnerDetailPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route
          path="materials"
          element={
            <RequirePermission permission="materials:write">
              <MaterialsPage />
            </RequirePermission>
          }
        />
        <Route
          path="staff"
          element={
            <RequirePermission permission="user:manage">
              <StaffPage />
            </RequirePermission>
          }
        />
        <Route
          path="finance"
          element={
            <RequirePermission permission="finance:read">
              <FinancePage />
            </RequirePermission>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
