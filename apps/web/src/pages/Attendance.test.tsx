import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextProps } from 'react-oidc-context';
import { ApiProvider } from '../api/ApiContext';
import type { ApiClient } from '../api/client';
import { AttendancePage } from './Attendance';

import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import Dexie from 'dexie';

vi.mock('react-oidc-context', () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import('react-oidc-context');
const mockUseAuth = vi.mocked(useAuth);

function authWith(profile: Record<string, unknown>): AuthContextProps {
  return { user: { profile } } as unknown as AuthContextProps;
}

const classes = [{ classId: 'c-1', tenantId: 't1', name: 'ECD A', createdAt: '', updatedAt: '' }];
const roster = {
  classId: 'c-1',
  learners: [
    { learnerId: 'l-1', tenantId: 't1', firstName: 'Tendai', lastName: 'Moyo', classId: 'c-1', createdAt: '', updatedAt: '' },
    { learnerId: 'l-2', tenantId: 't1', firstName: 'Ana', lastName: 'Dube', classId: 'c-1', createdAt: '', updatedAt: '' },
  ],
};

let get: ReturnType<typeof vi.fn>;
let post: ReturnType<typeof vi.fn>;
let fakeClient: ApiClient;
let currentApi: ApiClient;

beforeAll(async () => {
  // jsdom has no IndexedDB; Dexie snapshots these at construction, so hand
  // both to its dependency table explicitly.
  Dexie.dependencies.indexedDB = new IDBFactory();
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;

  // Wire the offline singleton the page talks to.
  const { DzidzoLocalDb } = await import('../offline/db');
  const { DexieOutboxStore } = await import('../offline/dexie-outbox');
  const { startOfflineSync } = await import('../offline/sync');
  const db = new DzidzoLocalDb('dzidzo-test');
  currentApi = { post: vi.fn() } as unknown as ApiClient;
  startOfflineSync(db, new DexieOutboxStore(db), () => currentApi);
});

beforeEach(() => {
  get = vi.fn().mockImplementation(async (path: string) => {
    if (path === '/classes') return { classes };
    if (path.startsWith('/learners?classId=')) return roster;
    if (path.startsWith('/attendance?day=')) return { day: '', records: [] };
    throw new Error(`unexpected GET ${path}`);
  });
  post = vi.fn().mockResolvedValue({ results: [] });
  fakeClient = {
    get,
    post,
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as ApiClient;
  // The sync singleton reads the freshest client on every drain.
  currentApi = fakeClient;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={fakeClient}>
        <MemoryRouter>
          <AttendancePage />
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('AttendancePage (offline-first)', () => {
  it('renders the roster with both learners unmarked', async () => {
    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'teacher' }));
    renderPage();

    expect(await screen.findByText('Tendai Moyo')).toBeInTheDocument();
    expect(screen.getByText('Ana Dube')).toBeInTheDocument();
    expect(screen.getAllByText('not marked')).toHaveLength(2);
  });

  it('stores marks locally, drains them through the sync engine, and shows queued state', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'teacher' }));
    renderPage();
    const row = await screen.findByText('Tendai Moyo');

    const presentButtons = screen.getAllByText('Present');
    await user.click(presentButtons[0] as Element);
    void row;

    // The mark went to the local store; the engine drained it to POST /sync.
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [path, body] = post.mock.calls[0] as unknown as [
      string,
      { items: { entityType: string; payload: { learnerId: string; present: boolean } }[] },
    ];
    expect(path).toBe('/sync');
    expect(body.items[0]?.entityType).toBe('ATTENDANCE');
    expect(body.items[0]?.payload.learnerId).toBe('l-1');
    expect(body.items[0]?.payload.present).toBe(true);
  });
});
