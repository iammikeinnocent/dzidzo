import { hasPermission, type Permission } from '@dzidzo/core';
import { useCallback } from 'react';
import { useAuth } from 'react-oidc-context';
import { staffProfileFrom, type StaffProfile } from '../auth/profile';

/**
 * One place for "what can the signed-in user do" in the UI — reading the same
 * role the pre-token Lambda stamped, checked against the same matrix the API
 * enforces.
 */
export function usePermissions(): {
  can: (permission: Permission) => boolean;
  profile: StaffProfile | undefined;
} {
  const auth = useAuth();
  const profile = staffProfileFrom(auth.user);
  const role = profile?.role;

  const can = useCallback(
    (permission: Permission) => (role ? hasPermission(role, permission) : false),
    [role],
  );
  return { can, profile };
}
