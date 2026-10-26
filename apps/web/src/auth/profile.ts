import { isUserRole, parseTenantList, type UserRole } from '@dzidzo/core';

export interface StaffProfile {
  userId: string;
  email?: string;
  tenantId?: string;
  /** Every school this staff member can act in (stamped by the pre-token Lambda). */
  tenantIds: string[];
  role?: UserRole;
}

interface OidcUserLike {
  profile: Record<string, unknown>;
}

/**
 * Maps the id-token claims to a typed staff profile. The custom:role /
 * custom:tenant_id claims are stamped by the pre-token-generation Lambda —
 * the same values the API middleware validates, so UI gating and API gating
 * always agree.
 */
export function staffProfileFrom(user: OidcUserLike | null | undefined): StaffProfile | undefined {
  const profile = user?.profile;
  if (!profile) {
    return undefined;
  }
  const staffProfile: StaffProfile = {
    userId: typeof profile.sub === 'string' ? profile.sub : '',
    tenantIds: [],
  };
  if (typeof profile.email === 'string') {
    staffProfile.email = profile.email;
  }
  if (typeof profile['custom:tenant_id'] === 'string') {
    staffProfile.tenantId = profile['custom:tenant_id'];
    staffProfile.tenantIds = parseTenantList(
      profile['custom:tenant_ids'],
      profile['custom:tenant_id'],
    );
  }
  if (isUserRole(profile['custom:role'])) {
    staffProfile.role = profile['custom:role'];
  }
  return staffProfile;
}
