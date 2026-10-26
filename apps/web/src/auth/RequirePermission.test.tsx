import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContextProps } from 'react-oidc-context';
import { RequirePermission } from './RequirePermission';

vi.mock('react-oidc-context', () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import('react-oidc-context');
const mockUseAuth = vi.mocked(useAuth);

function authWith(profile: Record<string, unknown>): AuthContextProps {
  return { user: { profile } } as unknown as AuthContextProps;
}

function renderGuard(permission: Parameters<typeof RequirePermission>[0]['permission']) {
  return render(
    <MemoryRouter>
      <RequirePermission permission={permission}>
        <p>secret-content</p>
      </RequirePermission>
    </MemoryRouter>,
  );
}

describe('RequirePermission', () => {
  it('renders children when the role carries the permission', () => {
    mockUseAuth.mockReturnValue(
      authWith({
        sub: 'user-1',
        'custom:tenant_id': 'tenant-1',
        'custom:role': 'director',
      }),
    );
    renderGuard('finance:read');
    expect(screen.getByText('secret-content')).toBeInTheDocument();
  });

  it('denies teachers access to finance', () => {
    mockUseAuth.mockReturnValue(
      authWith({
        sub: 'user-1',
        'custom:tenant_id': 'tenant-1',
        'custom:role': 'teacher',
      }),
    );
    renderGuard('finance:read');
    expect(screen.queryByText('secret-content')).not.toBeInTheDocument();
    expect(screen.getByText(/does not include/)).toBeInTheDocument();
  });

  it('denies when no role claim is present', () => {
    mockUseAuth.mockReturnValue(authWith({ sub: 'user-1' }));
    renderGuard('finance:read');
    expect(screen.queryByText('secret-content')).not.toBeInTheDocument();
    expect(screen.getByText(/unknown/)).toBeInTheDocument();
  });
});
