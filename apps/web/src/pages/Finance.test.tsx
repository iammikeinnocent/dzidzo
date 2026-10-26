import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextProps } from 'react-oidc-context';
import { ApiProvider } from '../api/ApiContext';
import type { ApiClient } from '../api/client';
import { FinancePage } from './Finance';

vi.mock('react-oidc-context', () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import('react-oidc-context');
const mockUseAuth = vi.mocked(useAuth);

function authWith(profile: Record<string, unknown>): AuthContextProps {
  return { user: { profile } } as unknown as AuthContextProps;
}

const staff = {
  staff: [
    { staffId: 's-1', tenantId: 't1', fullName: 'Senior Teacher', role: 'teacher', monthlySalary: 1000, createdAt: '', updatedAt: '' },
  ],
};
const payroll = {
  month: '202601',
  lines: [
    { staffId: 's-1', fullName: 'Senior Teacher', gross: 1000, taxable: 955, paye: 91, nssa: 45, aidsLevy: 2.73, net: 861.27 },
  ],
  totals: { gross: 1000, paye: 91, nssa: 45, aidsLevy: 2.73, net: 861.27 },
  computedAt: '',
  rulesEffectiveFrom: '2026-01-01',
};
const summary = {
  month: '202601',
  income: 200,
  expenses: 50,
  payrollNet: 861.27,
  expenditure: 911.27,
  balance: -711.27,
};

let get: ReturnType<typeof vi.fn>;
let fakeClient: ApiClient;

beforeEach(() => {
  get = vi.fn().mockImplementation(async (path: string) => {
    if (path === '/staff') return staff;
    if (path.startsWith('/payroll/')) return payroll;
    if (path.startsWith('/expenses?month=')) return { expenses: [] };
    if (path.startsWith('/payments?month=')) return { payments: [] };
    if (path.startsWith('/reports/summary?month=')) return summary;
    throw new Error(`unexpected GET ${path}`);
  });
  fakeClient = { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() } as unknown as ApiClient;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={fakeClient}>
        <MemoryRouter>
          <FinancePage />
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('FinancePage', () => {
  it('shows the month P&L and payroll lines for directors', async () => {
    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'director' }));
    renderPage();

    expect(await screen.findAllByText('Senior Teacher')).toBeTruthy();
    expect(screen.getAllByText('$861.27').length).toBeGreaterThan(0);
    expect(screen.getByText('$200.00')).toBeInTheDocument(); // income card
    expect(screen.getByText(/-\$711\.27|711\.27/)).toBeInTheDocument(); // balance card (may carry a minus sign)
    expect(screen.getByTestId('staff-form')).toBeInTheDocument();
    expect(screen.getByTestId('expense-form')).toBeInTheDocument();
  });

  it('hides write forms from managers (read-only role)', async () => {
    mockUseAuth.mockReturnValue(authWith({ sub: 'u1', 'custom:tenant_id': 't1', 'custom:role': 'manager' }));
    renderPage();

    expect(await screen.findAllByText('Senior Teacher')).toBeTruthy();
    expect(screen.queryByTestId('staff-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('expense-form')).not.toBeInTheDocument();
  });
});
