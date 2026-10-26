import { describe, expect, it } from 'vitest';
import type { AttendanceRecord, Guardian, Learner, SchoolClass } from '@dzidzo/core';
import { runAbsenteeism, type AbsenteeismDeps } from './absenteeism';
import { AfricasTalkingSmsProvider, MockSmsProvider } from './sms';

function learner(id: string, firstName: string): Learner {
  return { learnerId: id, tenantId: 't1', firstName, lastName: 'Moyo', createdAt: '', updatedAt: '' };
}

function fixtureDeps(sms: MockSmsProvider): AbsenteeismDeps {
  const classes: Record<string, SchoolClass[]> = {
    t1: [{ classId: 'c1', tenantId: 't1', name: 'ECD A', createdAt: '', updatedAt: '' }],
    t2: [],
  };
  const rosters: Record<string, Learner[]> = {
    't1#c1': [learner('l1', 'Absent'), learner('l2', 'Present'), learner('l3', 'Unmarked')],
  };
  const attendance: Record<string, AttendanceRecord[]> = {
    t1: [
      { tenantId: 't1', day: '20260202', learnerId: 'l1', present: false, updatedAt: 'x' },
      { tenantId: 't1', day: '20260202', learnerId: 'l2', present: true, updatedAt: 'x' },
      // l3 unmarked on purpose: register not taken ≠ absent
    ],
  };
  const guardians: Record<string, Guardian[]> = {
    't1#l1': [
      { guardianId: 'g1', tenantId: 't1', fullName: 'MaMoyo', phone: '+263771111111', learnerIds: ['l1'], createdAt: '', updatedAt: '' },
      { guardianId: 'g2', tenantId: 't1', fullName: 'BabaMoyo', phone: '+263772222222', learnerIds: ['l1'], createdAt: '', updatedAt: '' },
    ],
  };

  return {
    listTenants: async () => ['t1', 't2'],
    listClasses: async (tenantId) => classes[tenantId] ?? [],
    rosterForClass: async (tenantId, classId) => rosters[`${tenantId}#${classId}`] ?? [],
    attendanceForDay: async (tenantId) => attendance[tenantId] ?? [],
    guardiansForLearner: async (tenantId, learnerId) => guardians[`${tenantId}#${learnerId}`] ?? [],
    sms,
  };
}

describe('absenteeism job', () => {
  it('notifies every guardian of explicitly-absent learners only', async () => {
    const sms = new MockSmsProvider();
    const summary = await runAbsenteeism({ day: '20260202', deps: fixtureDeps(sms) });

    expect(summary.totalMessages).toBe(2);
    expect(summary.tenants).toEqual([
      { tenantId: 't1', absentees: 1, messages: 2, skippedClasses: 0 },
      { tenantId: 't2', absentees: 0, messages: 0, skippedClasses: 0 },
    ]);
    expect(sms.sent).toHaveLength(2);
    expect(sms.sent[0]?.to).toBe('+263771111111');
    expect(sms.sent[0]?.message).toContain('Absent was marked absent');
    // l3 unmarked → no message; l2 present → no message
    expect(sms.sent.every((s) => s.message.includes('Absent'))).toBe(true);
  });

  it('handles tenants with no classes and empty rosters gracefully', async () => {
    const sms = new MockSmsProvider();
    const deps = fixtureDeps(sms);
    (deps.listClasses as () => Promise<SchoolClass[]>) = async () => [];
    const summary = await runAbsenteeism({ day: '20260202', deps });
    expect(summary.totalMessages).toBe(0);
    expect(summary.tenants.every((t) => t.messages === 0)).toBe(true);
  });
});

describe('AfricasTalking provider', () => {
  it('posts to the sandbox host with the expected envelope', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ SMSMessageData: { Recipients: [] } }), { status: 200 });
    }) as unknown as typeof fetch;

    const provider = new AfricasTalkingSmsProvider(
      { username: 'sandbox', apiKey: 'key-1', sandbox: true },
      fetcher,
    );
    await provider.send('+263771111111', 'hello');

    const call = calls[0];
    expect(call?.url).toBe('https://api.sandbox.africastalking.com/version1/messaging');
    const headers = call?.init.headers as Record<string, string>;
    expect(headers.apiKey).toBe('key-1');
    expect(JSON.parse(String(call?.init.body))).toEqual({
      username: 'sandbox',
      to: ['+263771111111'],
      message: 'hello',
    });
  });

  it('surfaces API failures with the status code', async () => {
    const fetcher = (async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;
    const provider = new AfricasTalkingSmsProvider(
      { username: 'u', apiKey: 'bad', sandbox: false },
      fetcher,
    );
    await expect(provider.send('+263771111111', 'hi')).rejects.toThrow(/401/);
  });
});
