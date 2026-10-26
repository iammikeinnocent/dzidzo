import { beforeAll, describe, expect, it } from 'vitest';
import { tableNameFor } from '@dzidzo/core';
import { createApp, developmentVerifier } from '../../src/app';
import { createDb } from '../../src/db';
import { isDynamoDbLocalUp, LOCAL_ENDPOINT, recreateLocalTable } from '../helpers/db';

const localUp = await isDynamoDbLocalUp();

describe.skipIf(!localUp)('CRUD integration (DynamoDB Local)', () => {
  const db = createDb({
    region: 'us-east-1',
    endpoint: LOCAL_ENDPOINT,
    tableName: tableNameFor('local'),
  });
  const app = createApp(developmentVerifier, db);

  const headers = (role: string, tenantId = 'tenant-a') => ({
    authorization: `Bearer ${tokenFor(role, tenantId)}`,
    'content-type': 'application/json',
  });

  beforeAll(async () => {
    await recreateLocalTable();
  });

  it('round-trips a learner through create, read, update and delete', async () => {
    const classRes = await app.request('/classes', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ name: 'ECD A', ageGroup: '4-5 years' }),
    });
    expect(classRes.status).toBe(201);
    const schoolClass = (await classRes.json()) as { classId: string };

    const createRes = await app.request('/learners', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({
        firstName: 'Tendai',
        lastName: 'Moyo',
        classId: schoolClass.classId,
        enrolmentDate: '2026-01-12',
      }),
    });
    expect(createRes.status).toBe(201);
    const learner = (await createRes.json()) as { learnerId: string; firstName: string };
    expect(learner.firstName).toBe('Tendai');

    const readRes = await app.request(`/learners/${learner.learnerId}`, {
      headers: headers('teacher'),
    });
    expect(readRes.status).toBe(200);
    expect(((await readRes.json()) as { classId?: string }).classId).toBe(schoolClass.classId);

    const patchRes = await app.request(`/learners/${learner.learnerId}`, {
      method: 'PATCH',
      headers: headers('manager'),
      body: JSON.stringify({ firstName: 'Tendo' }),
    });
    expect(patchRes.status).toBe(200);
    expect(((await patchRes.json()) as { firstName: string }).firstName).toBe('Tendo');

    const deleteRes = await app.request(`/learners/${learner.learnerId}`, {
      method: 'DELETE',
      headers: headers('manager'),
    });
    expect(deleteRes.status).toBe(200);

    const goneRes = await app.request(`/learners/${learner.learnerId}`, {
      headers: headers('manager'),
    });
    expect(goneRes.status).toBe(404);
  });

  it('keeps tenants isolated — tenant B never sees tenant A rows', async () => {
    const createRes = await app.request('/learners', {
      method: 'POST',
      headers: headers('manager', 'tenant-a'),
      body: JSON.stringify({ firstName: 'Secret', lastName: 'Child' }),
    });
    const learner = (await createRes.json()) as { learnerId: string };

    const crossTenant = await app.request(`/learners/${learner.learnerId}`, {
      headers: headers('director', 'tenant-b'),
    });
    expect(crossTenant.status).toBe(404);
  });

  it('lists a class roster through the class-roster GSI', async () => {
    const classRes = await app.request('/classes', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ name: 'ECD B' }),
    });
    const { classId } = (await classRes.json()) as { classId: string };

    for (const name of [['Blessing', 'Chirwa'], ['Ana', 'Dube'], ['Tariro', 'Banda']]) {
      const res = await app.request('/learners', {
        method: 'POST',
        headers: headers('manager'),
        body: JSON.stringify({ firstName: name[0], lastName: name[1], classId }),
      });
      expect(res.status).toBe(201);
    }

    const rosterRes = await app.request(`/learners?classId=${classId}`, {
      headers: headers('manager'),
    });
    expect(rosterRes.status).toBe(200);
    const { learners } = (await rosterRes.json()) as {
      learners: { firstName: string; lastName: string }[];
    };
    expect(learners.map((l) => `${l.firstName} ${l.lastName}`)).toEqual([
      'Ana Dube',
      'Blessing Chirwa',
      'Tariro Banda',
    ]);
  });

  it('looks up guardians by phone through the guardian-phone GSI', async () => {
    const learnerRes = await app.request('/learners', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ firstName: 'Child', lastName: 'OfGuardian' }),
    });
    const learner = (await learnerRes.json()) as { learnerId: string };

    const guardianRes = await app.request('/guardians', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({
        fullName: 'MaDube',
        phone: '+263771234567',
        learnerIds: [learner.learnerId],
      }),
    });
    expect(guardianRes.status).toBe(201);

    const lookup = await app.request('/guardians?phone=%2B263771234567', {
      headers: headers('manager'),
    });
    expect(lookup.status).toBe(200);
    const { guardians } = (await lookup.json()) as {
      guardians: { fullName: string; learnerIds: string[] }[];
    };
    expect(guardians).toHaveLength(1);
    expect(guardians[0]?.fullName).toBe('MaDube');
    expect(guardians[0]?.learnerIds).toContain(learner.learnerId);

    const miss = await app.request('/guardians?phone=%2B263799000000', {
      headers: headers('manager'),
    });
    expect(((await miss.json()) as { guardians: unknown[] }).guardians).toHaveLength(0);
  });

  it('lists guardians for a learner through the tenant-partition filter', async () => {
    const learnerRes = await app.request('/learners', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ firstName: 'Linked', lastName: 'Child' }),
    });
    const learner = (await learnerRes.json()) as { learnerId: string };

    const otherRes = await app.request('/learners', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ firstName: 'Other', lastName: 'Child' }),
    });
    const other = (await otherRes.json()) as { learnerId: string };

    const guardianRes = await app.request('/guardians', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({
        fullName: 'Linked Guardian',
        phone: '+263771234000',
        learnerIds: [learner.learnerId],
      }),
    });
    expect(guardianRes.status).toBe(201);

    const linked = await app.request(`/guardians?learnerId=${learner.learnerId}`, {
      headers: headers('manager'),
    });
    const { guardians } = (await linked.json()) as { guardians: { fullName: string }[] };
    expect(guardians).toHaveLength(1);
    expect(guardians[0]?.fullName).toBe('Linked Guardian');

    const none = await app.request(`/guardians?learnerId=${other.learnerId}`, {
      headers: headers('manager'),
    });
    expect(((await none.json()) as { guardians: unknown[] }).guardians).toHaveLength(0);
  });

  it('rejects guardians referencing learners that do not exist', async () => {
    const res = await app.request('/guardians', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({
        fullName: 'Nobody',
        phone: '+263770000000',
        learnerIds: ['no-such-learner'],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown_learner', learnerId: 'no-such-learner' });
  });
});

function tokenFor(role: string, tenantId: string): string {
  const payload = {
    sub: 'user-1',
    'cognito:groups': [role],
    'custom:tenant_id': tenantId,
  };
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe.skipIf(!localUp)('offline sync integration (DynamoDB Local)', () => {
  const db = createDb({
    region: 'us-east-1',
    endpoint: LOCAL_ENDPOINT,
    tableName: tableNameFor('local'),
  });
  const app = createApp(developmentVerifier, db);

  beforeAll(async () => {
    await recreateLocalTable();
  });

  const post = (path: string, role: string, tenantId: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor(role, tenantId)}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('creates a learner from a client-generated id and replays idempotently', async () => {
    const clientUpdatedAt = new Date().toISOString();
    const item = {
      id: crypto.randomUUID(),
      entityType: 'LEARNER',
      entityId: 'client-l-42',
      operation: 'create',
      payload: { firstName: 'Offline', lastName: 'Enrolled' },
      clientUpdatedAt,
    };

    const first = await post('/sync', 'manager', 'tenant-a', { items: [item] });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { results: { status: string }[] };
    expect(firstBody.results[0]?.status).toBe('applied');

    const read = await app.request('/learners/client-l-42', {
      headers: { authorization: `Bearer ${tokenFor('teacher', 'tenant-a')}` },
    });
    expect(read.status).toBe(200);
    expect(((await read.json()) as { firstName: string }).firstName).toBe('Offline');

    const replay = await post('/sync', 'manager', 'tenant-a', { items: [item] });
    const replayBody = (await replay.json()) as { results: { status: string }[] };
    expect(replayBody.results[0]?.status).toBe('duplicate');
  });

  it('marks attendance offline via /sync; stale writes lose to newer server state', async () => {
    const createRes = await post('/learners', 'manager', 'tenant-a', {
      firstName: 'LWW',
      lastName: 'Kid',
    });
    const { learnerId } = (await createRes.json()) as { learnerId: string };

    const now = new Date();
    const newer = new Date(now.getTime() + 60_000).toISOString();
    const older = new Date(now.getTime() - 60_000).toISOString();

    const newerItem = {
      id: crypto.randomUUID(),
      entityType: 'ATTENDANCE',
      entityId: `${learnerId}#20260401`,
      operation: 'create',
      payload: { day: '20260401', learnerId, present: false },
      clientUpdatedAt: newer,
    };
    const applied = await post('/sync', 'teacher', 'tenant-a', { items: [newerItem] });
    expect(((await applied.json()) as { results: { status: string }[] }).results[0]?.status).toBe('applied');

    const olderItem = {
      id: crypto.randomUUID(),
      entityType: 'ATTENDANCE',
      entityId: `${learnerId}#20260401`,
      operation: 'update',
      payload: { day: '20260401', learnerId, present: true },
      clientUpdatedAt: older,
    };
    const stale = await post('/sync', 'teacher', 'tenant-a', { items: [olderItem] });
    expect(((await stale.json()) as { results: { status: string }[] }).results[0]?.status).toBe('applied');

    const day = await app.request('/attendance?day=20260401', {
      headers: { authorization: `Bearer ${tokenFor('teacher', 'tenant-a')}` },
    });
    const { records } = (await day.json()) as { records: { present: boolean }[] };
    expect(records).toHaveLength(1);
    expect(records[0]?.present).toBe(false); // the stale write did not win
  });
});

describe.skipIf(!localUp)('finance integration (DynamoDB Local)', () => {
  const db = createDb({
    region: 'us-east-1',
    endpoint: LOCAL_ENDPOINT,
    tableName: tableNameFor('local'),
  });
  const app = createApp(developmentVerifier, db);

  beforeAll(async () => {
    await recreateLocalTable();
  });

  const request = (method: string, path: string, role: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        authorization: `Bearer ${tokenFor(role, 'tenant-f')}`,
        'content-type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  it('runs payroll from staff records and produces a month summary', async () => {
    await request('POST', '/staff', 'director', { fullName: 'Head Teacher', role: 'teacher', monthlySalary: 1000 });
    await request('POST', '/staff', 'director', { fullName: 'Caretaker', role: 'support', monthlySalary: 200 });

    const run = await request('POST', '/payroll/run', 'director', { month: '202607' });
    expect(run.status).toBe(201);
    const runBody = (await run.json()) as { totals: { net: number }; lines: unknown[] };
    expect(runBody.lines).toHaveLength(2);
    expect(runBody.totals.net).toBeGreaterThan(0);

    const stored = await request('GET', '/payroll/202607', 'manager');
    expect(stored.status).toBe(200);
    expect(((await stored.json()) as { totals: { net: number } }).totals.net).toBe(runBody.totals.net);

    await request('POST', '/expenses', 'director', { day: '20260715', category: 'Mealie meal', amount: 120.5 });
    const learner = await request('POST', '/learners', 'manager', { firstName: 'Fee', lastName: 'Kid' });
    const { learnerId } = (await learner.json()) as { learnerId: string };
    await request('POST', '/payments', 'director', { learnerId, month: '202607', amount: 200 });

    const summary = await request('GET', '/reports/summary?month=202607', 'director');
    const summaryBody = (await summary.json()) as {
      income: number;
      expenses: number;
      payrollNet: number;
      expenditure: number;
      balance: number;
    };
    expect(summaryBody.income).toBe(200);
    expect(summaryBody.expenses).toBe(120.5);
    expect(summaryBody.payrollNet).toBe(runBody.totals.net);
    expect(summaryBody.expenditure).toBeCloseTo(120.5 + runBody.totals.net, 2);
    expect(summaryBody.balance).toBeCloseTo(200 - 120.5 - runBody.totals.net, 2);
  });
});
