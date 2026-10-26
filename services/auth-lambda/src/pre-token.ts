import type { PreTokenGenerationV2TriggerEvent } from 'aws-lambda';
import { parseRoleFromGroups, parseTenantList, rolesFromGroups } from '@dzidzo/core';

/**
 * Pre-token-generation V2_0 trigger: stamps every issued token with the tenant
 * and the single resolved role, so the API middleware always consumes the same
 * claim shape regardless of how Cognito surfaces attributes and groups.
 *
 * Cognito requires the handler to return the FULL event object with
 * `response` mutated in place — returning only the response causes
 * "Invalid version in Lambda response" at token issuance.
 *
 * Fails closed: a user without a tenant attribute or without exactly one
 * role group cannot obtain a token at all.
 */
export const handler = async (
  event: PreTokenGenerationV2TriggerEvent,
): Promise<PreTokenGenerationV2TriggerEvent> => {
  const tenantId = event.request.userAttributes['custom:tenant_id'];
  if (!tenantId) {
    throw new Error('user is missing custom:tenant_id — staff must be provisioned into a school');
  }

  const groupConfig = event.request.groupConfiguration;
  const groups = groupConfig?.groupsToOverride ?? [];
  const roles = rolesFromGroups(groups);
  if (roles.length === 0) {
    throw new Error('user has no role group — assign one of director, manager or teacher');
  }
  if (roles.length > 1) {
    throw new Error(`user is in multiple role groups (${roles.join(', ')}) — provisioning error`);
  }
  const role = parseRoleFromGroups(groups);
  if (!role || role !== roles[0]) {
    throw new Error('role resolution failed');
  }

  const tenantIds = parseTenantList(
    event.request.userAttributes['custom:tenant_ids'],
    tenantId,
  );
  const claims = {
    'custom:tenant_id': tenantId,
    'custom:tenant_ids': tenantIds.join(','),
    'custom:role': role,
  };
  event.response = {
    claimsAndScopeOverrideDetails: {
      idTokenGeneration: { claimsToAddOrOverride: claims },
      accessTokenGeneration: { claimsToAddOrOverride: claims },
      groupOverrideDetails: {
        groupsToOverride: groups,
        iamRolesToOverride: groupConfig?.iamRolesToOverride ?? [],
        preferredRole: groupConfig?.preferredRole,
      },
    },
  };
  return event;
};