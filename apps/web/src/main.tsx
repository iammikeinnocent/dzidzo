import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { WebStorageStateStore } from 'oidc-client-ts';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { BrowserRouter } from 'react-router';
import { StrictMode, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiClient } from './api/client';
import { ApiProvider } from './api/ApiContext';
import { App } from './App';
import { config, isAuthConfigured } from './config';
import { DzidzoLocalDb } from './offline/db';
import { DexieOutboxStore } from './offline/dexie-outbox';
import { startOfflineSync } from './offline/sync';
import { NotConfiguredNotice } from './pages/Auth';
import './index.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('root element missing');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

/**
 * Security decision: authorization-code + PKCE via the maintained
 * react-oidc-context/oidc-client-ts libraries rather than a hand-rolled
 * OAuth flow — hand-rolled crypto is how auth bugs happen. Tokens persist in
 * localStorage so the PWA can restore a session while offline.
 */
function AppShell() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        authority={config.authority as string}
        client_id={config.clientId as string}
        redirect_uri={`${window.location.origin}/auth/callback`}
        post_logout_redirect_uri={window.location.origin}
        scope="openid email profile"
        response_type="code"
        userStore={new WebStorageStateStore({ store: window.localStorage })}
        onSigninCallback={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
        }}
      >
        <AuthedShell />
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Inside the provider: build the API client with the live token source. */
function AuthedShell() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [activeTenant, setActiveTenant] = useState<string | undefined>(undefined);
  const apiClient = useMemo(
    () =>
      new ApiClient(config.apiBaseUrl as string, {
        // Silent renew keeps auth.user fresh; the context updates trigger a
        // new client through the useMemo dependency.
        getAccessToken: async () => auth.user?.access_token,
        getActiveTenant: () => activeTenant,
      }),
    [auth, activeTenant],
  );

  /** School switcher handler: re-scopes every future request, drops caches. */
  const switchTenant = (tenantId: string) => {
    setActiveTenant(tenantId);
    queryClient.clear();
  };
  const apiRef = useRef(apiClient);
  apiRef.current = apiClient;

  const db = useMemo(() => new DzidzoLocalDb(), []);
  const outbox = useMemo(() => new DexieOutboxStore(db), [db]);
  const controller = useMemo(() => startOfflineSync(db, outbox, () => apiRef.current), [db, outbox]);
  void controller;

  return (
    <ApiProvider client={apiClient}>
      <BrowserRouter>
        <App activeTenant={activeTenant} onSwitchTenant={switchTenant} />
      </BrowserRouter>
    </ApiProvider>
  );
}

const fullyConfigured = isAuthConfigured() && config.apiBaseUrl !== null;

createRoot(root).render(
  <StrictMode>{fullyConfigured ? <AppShell /> : <NotConfiguredNotice />}</StrictMode>,
);
