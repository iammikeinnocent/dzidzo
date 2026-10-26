import { describe, expect, it } from 'vitest';
import type { PreTokenGenerationV2TriggerEvent } from 'aws-lambda';
import { handler } from './pre-token';

function eventFor(
  userAttributes: Record<string, string>,
  groups?: string[],
): PreTokenGenerationV2TriggerEvent {
  return {
    version: '2',
    triggerSource: 'TokenGeneration_Authentication',
    userPoolId: 'us-east-1_test',
    userName: 'user-1',
    callerContext: { clientId: 'client-1', clientName: 'web' },
    region: 'us-east-1',
    userAttributes,
    request: {
      userAttributes,
      ...(groups !== undefined
        ? { groupConfiguration: { groupsToOverride: groups, iamRolesToOverride: [], preferredRole: undefined } }
        : {}),
    },
    response: { claimsAndScopeOverrideDetails: {} },
  } as unknown as PreTokenGenerationV2TriggerEvent;
}

describe('pre-token claims handler', () => {
  it('stamps tenant and role claims from group membership', async () => {
    const response = await handler(
      eventFor({ 'custom:tenant_id': 'tenant-1', email: '[EMAIL]' }, ['teacher']),
    );

    expect(response.response.claimsAndScopeOverrideDetails.accessTokenGeneration?.claimsToAddOrOverride).toEqual({
      'custom:tenant_id': 'tenant-1',
      'custom:tenant_ids': 'tenant-1',
      'custom:role': 'teacher',
    });
    expect(response.response.claimsAndScopeOverrideDetails.idTokenGeneration?.claimsToAddOrOverride).toEqual({
      'custom:tenant_id': 'tenant-1',
      'custom:tenant_ids': 'tenant-1',
      'custom:role': 'teacher',
    });
    expect(response.response.claimsAndScopeOverrideDetails.groupOverrideDetails?.groupsToOverride).toEqual(['teacher']);
  });

  it('resolves director from group membership', async () => {
    const response = await handler(eventFor({ 'custom:tenant_id': 'tenant-2' }, ['director']));
    expect(response.response.claimsAndScopeOverrideDetails.accessTokenGeneration?.claimsToAddOrOverride).toMatchObject({
      'custom:role': 'director',
    });
  });

  it('fails closed when the tenant attribute is missing', async () => {
    await expect(handler(eventFor({ email: 't@school.example' }, ['teacher']))).rejects.toThrow(
      /custom:tenant_id/,
    );
  });

  it('fails closed when no role group is assigned', async () => {
    await expect(
      handler(eventFor({ 'custom:tenant_id': 'tenant-1' }, ['All-Staff'])),
    ).rejects.toThrow(/no role group/);
  });

  it('fails closed when a user sits in multiple role groups', async () => {
    await expect(
      handler(eventFor({ 'custom:tenant_id': 'tenant-1' }, ['teacher', 'manager'])),
    ).rejects.toThrow(/multiple role groups/);
  });

  it('fails closed when the group configuration is missing entirely', async () => {
    await expect(handler(eventFor({ 'custom:tenant_id': 'tenant-1' }))).rejects.toThrow(
      /no role group/,
    );
  });
});
