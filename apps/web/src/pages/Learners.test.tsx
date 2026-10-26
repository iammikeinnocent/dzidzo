import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextProps } from 'react-oidc-context';
import { ApiProvider } from '../api/ApiContext';
import type { ApiClient } from '../api/client';
import { LearnersPage } from './Learners';

vi.mock('react-oidc-context', () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import('react-oidc-context');
const mockUseAuth = vi.mocked(useAuth);

function authWith(profile: Record<string, unknown>): AuthContextProps {
  return { user: { profile } } as unknown as AuthContextProps;
}

const classes = [
  { classId: 'c-1', tenantId: 't1', name: 'ECD A', createdAt: '', updatedAt: '' },
  { classId: 'c-2', tenantId: 't1', name: 'ECD B', createdAt: '', updatedAt: '' },
];

const roster = {
  classId: 'c-1',
  learners: [
    { learnerId: 'l-1', tenantId: 't1', firstName: 'Tendai', lastName: 'Moyo', classId: 'c-1', createdAt: '', updatedAt: '' },
    { learnerId: 'l-2', tenantId: 't1', firstName: 'Ana', lastName: 'Dube', classId: 'c-1', createdAt: '', updatedAt: '' },
  ],
};

const allLearners = {
  learners: [
    ...roster.learners,
    { learnerId: 'l-3', tenantId: 't1', firstName: 'Kudzai', lastName: 'Chirwa', classId: 'c-2', createdAt: '', updatedAt: '' },
  ],
};

let get: ReturnType<typeof vi.fn>;
let post: ReturnType<typeof vi.fn>;
let patch: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;
let fakeClient: ApiClient;

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={fakeClient}>
        <MemoryRouter>
          <LearnersPage />
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get = vi.fn();
  post = vi.fn();
  patch = vi.fn();
  remove = vi.fn();
  get.mockImplementation(async (path: string) => {
    if (path === '/classes') return { classes };
    if (path === '/learners') return allLearners;
    if (path.startsWith('/learners?classId=')) return roster;
    if (path.startsWith('/guardians?learnerId=')) return { learnerId: 'l-1', guardians: [] };
    throw new Error(`unexpected GET ${path}`);
  });
  fakeClient = { get, post, patch, delete: remove } as unknown as ApiClient;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LearnersPage', () => {
  it('renders the class selector and roster from the API', async () => {
    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'manager' }));
    renderPage();

    expect(await screen.findByText('Tendai Moyo')).toBeInTheDocument();
    expect(screen.getByText('Ana Dube')).toBeInTheDocument();
    expect(screen.getByLabelText('Class')).toBeInTheDocument();
  });

  it('shows every school learner with their class under "All learners (school)"', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'manager' }));
    renderPage();
    await screen.findByText('Tendai Moyo');

    await user.selectOptions(screen.getByLabelText('Class'), 'all');

    expect(await screen.findByText('Kudzai Chirwa')).toBeInTheDocument();
    expect(screen.getByText('Tendai Moyo')).toBeInTheDocument();
    expect(screen.getByText('Ana Dube')).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: 'ECD A' })).toHaveLength(2);
    expect(screen.getByRole('cell', { name: 'ECD B' })).toBeInTheDocument();
  });

  it('shows enrolment to teachers but hides the delete button; managers get both', async () => {
    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'teacher' }));
    const teacher = renderPage();
    await screen.findByText('Tendai Moyo');
    expect(screen.getByText('Enrol learner')).toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    teacher.unmount();

    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'manager' }));
    renderPage();
    await screen.findByText('Tendai Moyo');
    expect(screen.getByText('Enrol learner')).toBeInTheDocument();
    expect(screen.getAllByText('Remove').length).toBeGreaterThan(0);
  });

  it('enrols a learner through the API after validation passes', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'manager' }));
    renderPage();
    await screen.findByText('Tendai Moyo');

    await user.click(screen.getByText('Enrol learner'));
    await screen.findByTestId('learner-form');

    // invalid first: empty names must surface schema issues and never hit the API
    await user.click(screen.getByText('Enrol', { selector: 'button' }));
    expect(await screen.findByText(/firstName/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('First name'), 'Rudo');
    await user.type(screen.getByLabelText('Surname'), 'Ncube');
    await user.click(screen.getByText('Enrol', { selector: 'button' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/learners', expect.objectContaining({ firstName: 'Rudo', lastName: 'Ncube' }));
  });

  it('removes a learner after confirmation', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'manager' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('Tendai Moyo');

    const removeButtons = screen.getAllByText('Remove');
    await user.click(removeButtons[0] as Element);

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(remove).toHaveBeenCalledWith('/learners/l-1');
  });

  it('adds a guardian through the expanded row and posts the linkage', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'manager' }));
    renderPage();
    await screen.findByText('Tendai Moyo');

    await user.click(screen.getAllByText('Guardians')[0] as Element);
    expect(await screen.findByText(/No guardians linked/)).toBeInTheDocument();

    await user.click(screen.getByText('Add guardian', { selector: '.btn-secondary' }));
    const form = await screen.findByTestId('guardian-form');
    await user.type(form.querySelector('input') as HTMLInputElement, 'MaDube');
    const inputs = form.querySelectorAll('input');
    await user.type(inputs[1] as HTMLInputElement, '+263771234567');
    await user.click(screen.getByText('Add guardian', { selector: '[type="submit"]' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(
      '/guardians',
      expect.objectContaining({ fullName: 'MaDube', phone: '+263771234567', learnerIds: ['l-1'] }),
    );
  });

  it('rejects invalid guardian phone numbers before calling the API', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'manager' }));
    renderPage();
    await screen.findByText('Tendai Moyo');

    await user.click(screen.getAllByText('Guardians')[0] as Element);
    await user.click(screen.getByText('Add guardian', { selector: '.btn-secondary' }));
    const form = await screen.findByTestId('guardian-form');
    await user.type(form.querySelector('input') as HTMLInputElement, 'MaDube');
    const inputs = form.querySelectorAll('input');
    await user.type(inputs[1] as HTMLInputElement, '[PHONE]');
    await user.click(screen.getByText('Add guardian', { selector: '[type="submit"]' }));

    expect(await screen.findByText(/E\.164/, { selector: 'p' })).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
