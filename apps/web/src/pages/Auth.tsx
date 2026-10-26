import { Navigate, useLocation } from 'react-router';
import { useAuth } from 'react-oidc-context';

/** Shown instead of protected content when there is no session. */
export function LoginPrompt() {
  const auth = useAuth();
  const location = useLocation();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Dzidzo<span className="text-emerald-400">.</span>
        </h1>
        <p className="text-sm text-slate-400">
          School management that works without connectivity. Sign in with your staff account to
          continue.
        </p>
        <button
          type="button"
          onClick={() => void auth.signinRedirect({ state: { from: location.pathname } })}
          className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
        >
          Sign in
        </button>
        {auth.error ? <p className="text-xs text-red-400">{String(auth.error)}</p> : null}
      </div>
    </main>
  );
}

/** Hosted-UI lands here; the provider completes the code exchange. */
export function CallbackPage() {
  const auth = useAuth();
  if (auth.isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
      {auth.error ? (
        <div className="max-w-md text-center">
          <p className="text-sm font-semibold text-red-400">Sign-in failed</p>
          <p className="mt-2 text-xs break-all">{auth.error.message}</p>
          <a href="/" className="mt-4 inline-block text-xs underline text-slate-300">
            Back to home
          </a>
        </div>
      ) : (
        <p className="text-sm">Completing sign-in…</p>
      )}
    </main>
  );
}

/** Rendered when VITE_COGNITO_* env vars are absent (pre-deployment). */
export function NotConfiguredNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
      <div className="max-w-md space-y-4 rounded-xl border border-amber-900/60 bg-amber-950/30 p-8">
        <h1 className="text-xl font-bold text-amber-200">Authentication not configured</h1>
        <p className="text-sm text-amber-300/80">
          The app builds and boots without Cognito settings so CI stays green before the
          infrastructure is deployed. To run the full experience locally:
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-amber-300/80">
          <li>Deploy the dev stacks (cdk outputs print the values)</li>
          <li>
            Copy <code className="text-xs">.env.example</code> to{' '}
            <code className="text-xs">.env.local</code> and fill in the three variables
          </li>
          <li>Restart the dev server</li>
        </ol>
      </div>
    </main>
  );
}
