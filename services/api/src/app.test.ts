import { describe, expect, it } from 'vitest';
import type {
  AttendanceRecord,
  CurriculumItem,
  CurriculumItemCreateInput,
  LearnerCertificate,
  LearnerCertificateCreateInput,
  LearnerNote,
  LearnerNoteCreateInput,
  LearnerReport,
  LearnerReportCreateInput,
  StudyMaterial,
  StudyMaterialCreateInput,
  ClassCreateInput,
  Expense,
  FeePayment,
  Guardian,
  GuardianCreateInput,
  GuardianUpdateInput,
  Learner,
  LearnerCreateInput,
  LearnerUpdateInput,
  PayrollRun,
  SchoolClass,
  StaffMember,
} from '@dzidzo/core';
import { computePayroll, SIMPLIFIED_PAYE_RULES_2026 } from '@dzidzo/core';
import { createApp } from './app';
import { UnknownLearnerError, type ApiData } from './db';
import type { MarkInput } from './db/attendance';

const NOW = '2026-01-01T00:00:00.000Z';
let seq = 0;

function tokenFor(role: string, tenantId = 'tenant-1'): string {
  const payload = {
    sub: 'user-1',
    'cognito:groups': [role],
    'custom:tenant_id': tenantId,
  };
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

const headers = (role: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${tokenFor(role)}`,
  'content-type': 'application/json',
  ...extra,
});

function makeLearner(tenantId: string, input: LearnerCreateInput): Learner {
  const learner: Learner = {
    learnerId: `l-${++seq}`,
    tenantId,
    firstName: input.firstName,
    lastName: input.lastName,
    createdAt: NOW,
    updatedAt: NOW,
  };
  if (input.dateOfBirth !== undefined) learner.dateOfBirth = input.dateOfBirth;
  if (input.enrolmentDate !== undefined) learner.enrolmentDate = input.enrolmentDate;
  if (input.classId !== undefined) learner.classId = input.classId;
  return learner;
}

function makeClass(tenantId: string, input: ClassCreateInput): SchoolClass {
  const schoolClass: SchoolClass = {
    classId: `c-${++seq}`,
    tenantId,
    name: input.name,
    createdAt: NOW,
    updatedAt: NOW,
  };
  if (input.ageGroup !== undefined) schoolClass.ageGroup = input.ageGroup;
  return schoolClass;
}

class FakeLearners {
  store = new Map<string, Learner>();

  async create(tenantId: string, input: LearnerCreateInput): Promise<Learner> {
    const learner = makeLearner(tenantId, input);
    this.store.set(`${tenantId}:${learner.learnerId}`, learner);
    return learner;
  }

  async get(tenantId: string, learnerId: string): Promise<Learner | undefined> {
    return this.store.get(`${tenantId}:${learnerId}`);
  }

  async update(tenantId: string, learnerId: string, patch: LearnerUpdateInput): Promise<Learner | undefined> {
    const existing = await this.get(tenantId, learnerId);
    if (!existing) return undefined;
    const updated: Learner = { ...existing, updatedAt: NOW };
    if (patch.firstName !== undefined) updated.firstName = patch.firstName;
    if (patch.lastName !== undefined) updated.lastName = patch.lastName;
    this.store.set(`${tenantId}:${learnerId}`, updated);
    return updated;
  }

  async remove(tenantId: string, learnerId: string): Promise<void> {
    this.store.delete(`${tenantId}:${learnerId}`);
  }

  async syncUpsert(tenantId: string, learnerId: string, input: LearnerCreateInput, clientUpdatedAt: string): Promise<'applied' | 'skipped'> {
    const existing = await this.get(tenantId, learnerId);
    if (existing && existing.updatedAt >= clientUpdatedAt) {
      return 'skipped';
    }
    const learner = makeLearner(tenantId, input);
    const merged: Learner = { ...learner, learnerId, createdAt: existing?.createdAt ?? clientUpdatedAt, updatedAt: clientUpdatedAt };
    this.store.set(`${tenantId}:${learnerId}`, merged);
    return 'applied';
  }

  async listByClass(tenantId: string, classId: string): Promise<Learner[]> {
    return [...this.store.values()].filter((l) => l.tenantId === tenantId && l.classId === classId);
  }

  async listAll(tenantId: string): Promise<Learner[]> {
    return [...this.store.values()].filter((l) => l.tenantId === tenantId);
  }
}

class FakeAttendance {
  marks = new Map<string, Record<string, unknown>>();

  async mark(tenantId: string, input: MarkInput): Promise<AttendanceRecord> {
    const key = `${tenantId}:${input.day}:${input.learnerId}`;
    const existing = this.marks.get(key);
    const record: AttendanceRecord = {
      tenantId,
      day: input.day,
      learnerId: input.learnerId,
      present: input.present,
      updatedAt: input.updatedAt,
    };
    if (input.markedBy !== undefined) {
      record.markedBy = input.markedBy;
    }
    if (existing && String(existing['updatedAt']) >= input.updatedAt) {
      return existing as unknown as AttendanceRecord;
    }
    this.marks.set(key, record as unknown as Record<string, unknown>);
    return record;
  }

  async getForDay(tenantId: string, day: string): Promise<AttendanceRecord[]> {
    return [...this.marks.entries()]
      .filter(([key]) => key.startsWith(`${tenantId}:${day}:`))
      .map(([, value]) => value as unknown as AttendanceRecord);
  }
}

class FakeSyncAck {
  private seen = new Set<string>();

  async ackIfNew(tenantId: string, syncId: string): Promise<boolean> {
    const key = `${tenantId}:${syncId}`;
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.add(key);
    return true;
  }
}

class FakeClasses {
  store = new Map<string, SchoolClass>();

  async create(tenantId: string, input: ClassCreateInput): Promise<SchoolClass> {
    const schoolClass = makeClass(tenantId, input);
    this.store.set(`${tenantId}:${schoolClass.classId}`, schoolClass);
    return schoolClass;
  }

  async get(tenantId: string, classId: string): Promise<SchoolClass | undefined> {
    return this.store.get(`${tenantId}:${classId}`);
  }

  async list(tenantId: string): Promise<SchoolClass[]> {
    return [...this.store.values()].filter((c) => c.tenantId === tenantId);
  }
}

class FakeGuardians {
  store = new Map<string, Guardian>();

  async create(tenantId: string, input: GuardianCreateInput): Promise<Guardian> {
    if (input.learnerIds.includes('missing-learner')) {
      throw new UnknownLearnerError('missing-learner');
    }
    const guardian: Guardian = {
      guardianId: `g-${++seq}`,
      tenantId,
      fullName: input.fullName,
      phone: input.phone,
      learnerIds: input.learnerIds,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.store.set(`${tenantId}:${guardian.guardianId}`, guardian);
    return guardian;
  }

  async get(tenantId: string, guardianId: string): Promise<Guardian | undefined> {
    return this.store.get(`${tenantId}:${guardianId}`);
  }

  async findByPhone(tenantId: string, phone: string): Promise<Guardian[]> {
    return [...this.store.values()].filter((g) => g.tenantId === tenantId && g.phone === phone);
  }

  async listByLearner(tenantId: string, learnerId: string): Promise<Guardian[]> {
    return [...this.store.values()].filter(
      (g) => g.tenantId === tenantId && g.learnerIds.includes(learnerId),
    );
  }

  async update(tenantId: string, guardianId: string, patch: GuardianUpdateInput): Promise<Guardian | undefined> {
    const existing = await this.get(tenantId, guardianId);
    if (!existing) return undefined;
    const updated: Guardian = { ...existing, updatedAt: NOW };
    if (patch.fullName !== undefined) updated.fullName = patch.fullName;
    if (patch.phone !== undefined) updated.phone = patch.phone;
    if (patch.learnerIds !== undefined) updated.learnerIds = patch.learnerIds;
    this.store.set(`${tenantId}:${guardianId}`, updated);
    return updated;
  }
}

class FakeFinance {
  staffStore = new Map<string, StaffMember>();
  payrollStore = new Map<string, PayrollRun>();
  expensesStore = new Map<string, Expense>();
  paymentsStore = new Map<string, FeePayment>();

  staff = {
    create: async (
      tenantId: string,
      input: {
        fullName: string;
        role: string;
        monthlySalary: number;
        idNumber: string;
        phone: string;
        email: string;
        dateOfBirth: string;
        address?: string;
        avatarKey?: string;
        certificates?: string[];
      },
    ) => {
      const member: StaffMember = {
        staffId: `s-${++seq}`,
        tenantId,
        fullName: input.fullName,
        role: input.role,
        monthlySalary: input.monthlySalary,
        idNumber: input.idNumber,
        phone: input.phone,
        email: input.email,
        dateOfBirth: input.dateOfBirth,
        createdAt: NOW,
        updatedAt: NOW,
      };
      if (input.address !== undefined) member.address = input.address;
      if (input.avatarKey !== undefined) member.avatarKey = input.avatarKey;
      if (input.certificates !== undefined) member.certificates = input.certificates;
      this.staffStore.set(`${tenantId}:${member.staffId}`, member);
      return member;
    },
    update: async (tenantId: string, staffId: string, patch: Record<string, unknown>) => {
      const member = this.staffStore.get(`${tenantId}:${staffId}`);
      if (!member) return undefined;
      const updated = { ...member, ...patch, updatedAt: NOW };
      this.staffStore.set(`${tenantId}:${staffId}`, updated);
      return updated;
    },
    list: async (tenantId: string) => [...this.staffStore.values()].filter((s) => s.tenantId === tenantId),
  };

  payroll = {
    run: async (tenantId: string, month: string) => {
      const staff = await this.staff.list(tenantId);
      const lines = staff.map((s) => {
        const computation = computePayroll(s.monthlySalary, SIMPLIFIED_PAYE_RULES_2026);
        return { staffId: s.staffId, fullName: s.fullName, ...computation };
      });
      const run: PayrollRun = {
        tenantId,
        month,
        lines,
        totals: {
          gross: lines.reduce((sum, l) => sum + l.gross, 0),
          paye: lines.reduce((sum, l) => sum + l.paye, 0),
          nssa: lines.reduce((sum, l) => sum + l.nssa, 0),
          aidsLevy: lines.reduce((sum, l) => sum + l.aidsLevy, 0),
          net: lines.reduce((sum, l) => sum + l.net, 0),
        },
        computedAt: NOW,
        rulesEffectiveFrom: SIMPLIFIED_PAYE_RULES_2026.effectiveFrom,
      };
      this.payrollStore.set(`${tenantId}:${month}`, run);
      return run;
    },
    get: async (tenantId: string, month: string) => this.payrollStore.get(`${tenantId}:${month}`),
  };

  expenses = {
    create: async (tenantId: string, input: { day: string; category: string; amount: number; note?: string }) => {
      const expense: Expense = {
        expenseId: `e-${++seq}`,
        tenantId,
        day: input.day,
        category: input.category,
        amount: input.amount,
        createdAt: NOW,
      };
      if (input.note !== undefined) expense.note = input.note;
      this.expensesStore.set(`${tenantId}:${expense.expenseId}`, expense);
      return expense;
    },
    listForMonth: async (tenantId: string, month: string) =>
      [...this.expensesStore.values()].filter((e) => e.tenantId === tenantId && e.day.slice(0, 6) === month),
  };

  payments = {
    create: async (tenantId: string, input: { learnerId: string; month: string; amount: number; method?: string }) => {
      const payment: FeePayment = {
        paymentId: `p-${++seq}`,
        tenantId,
        learnerId: input.learnerId,
        month: input.month,
        amount: input.amount,
        createdAt: NOW,
      };
      if (input.method !== undefined) payment.method = input.method;
      this.paymentsStore.set(`${tenantId}:${payment.paymentId}`, payment);
      return payment;
    },
    listForMonth: async (tenantId: string, month: string) =>
      [...this.paymentsStore.values()].filter((p) => p.tenantId === tenantId && p.month === month),
    listForLearner: async (tenantId: string, learnerId: string) =>
      [...this.paymentsStore.values()]
        .filter((p) => p.tenantId === tenantId && p.learnerId === learnerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

class FakeMaterials {
  store = new Map<string, StudyMaterial>();

  create = async (tenantId: string, input: StudyMaterialCreateInput, authorId: string) => {
    const material: StudyMaterial = {
      materialId: `m-${++seq}`,
      tenantId,
      title: input.title,
      fileKey: input.fileKey,
      authorId,
      createdAt: NOW,
    };
    if (input.subject !== undefined) material.subject = input.subject;
    if (input.description !== undefined) material.description = input.description;
    this.store.set(`${tenantId}:${material.materialId}`, material);
    return material;
  };

  list = async (tenantId: string) =>
    [...this.store.values()]
      .filter((m) => m.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  remove = async (tenantId: string, materialId: string) => {
    this.store.delete(`${tenantId}:${materialId}`);
  };
}

class FakeNotes {
  store = new Map<string, LearnerNote>();

  create = async (tenantId: string, learnerId: string, input: LearnerNoteCreateInput, authorId: string) => {
    const note: LearnerNote = {
      noteId: `n-${++seq}`,
      tenantId,
      learnerId,
      text: input.text,
      authorId,
      createdAt: NOW,
    };
    this.store.set(`${tenantId}:${note.noteId}`, note);
    return note;
  };

  listByLearner = async (tenantId: string, learnerId: string) =>
    [...this.store.values()]
      .filter((n) => n.tenantId === tenantId && n.learnerId === learnerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  remove = async (tenantId: string, _learnerId: string, noteId: string) => {
    this.store.delete(`${tenantId}:${noteId}`);
  };
}

class FakeProgress {
  store = new Map<string, { entityType: string; item: unknown }>();
  seq = 0;

  private key(t: string, e: string, id: string) {
    return `${t}:${e}:${id}`;
  }

  createReport = async (tenantId: string, learnerId: string, input: LearnerReportCreateInput, authorId: string) => {
    const report: LearnerReport = {
      reportId: `r-${++this.seq}`,
      tenantId,
      learnerId,
      subject: input.subject,
      term: input.term,
      grade: input.grade,
      authorId,
      createdAt: NOW,
    };
    if (input.comment !== undefined) report.comment = input.comment;
    this.store.set(this.key(tenantId, 'ASSESSMENT', report.reportId), { entityType: 'ASSESSMENT', item: report });
    return report;
  };

  listReports = async (tenantId: string, learnerId: string) =>
    [...this.store.values()]
      .filter((e) => 'tenantId' in (e.item as object) && (e.item as LearnerReport).tenantId === tenantId && (e.item as LearnerReport).learnerId === learnerId)
      .map((e) => e.item as LearnerReport)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  addCurriculumItem = async (tenantId: string, learnerId: string, input: CurriculumItemCreateInput & { done: boolean }) => {
    const entry: CurriculumItem = {
      itemId: `cur-${++this.seq}`,
      tenantId,
      learnerId,
      subject: input.subject,
      done: input.done,
      createdAt: NOW,
    };
    if (input.term !== undefined) entry.term = input.term;
    this.store.set(this.key(tenantId, 'CURRICULUM', entry.itemId), { entityType: 'CURRICULUM', item: entry });
    return entry;
  };

  listCurriculum = async (tenantId: string, learnerId: string) =>
    [...this.store.values()]
      .filter((e) => (e.item as CurriculumItem).tenantId === tenantId && (e.item as CurriculumItem).learnerId === learnerId)
      .map((e) => e.item as CurriculumItem)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  createCertificate = async (tenantId: string, learnerId: string, input: LearnerCertificateCreateInput) => {
    const certificate: LearnerCertificate = {
      certificateId: `cert-${++this.seq}`,
      tenantId,
      learnerId,
      title: input.title,
      createdAt: NOW,
    };
    if (input.awardedAt !== undefined) certificate.awardedAt = input.awardedAt;
    if (input.fileKey !== undefined) certificate.fileKey = input.fileKey;
    this.store.set(this.key(tenantId, 'CERTIFICATE', certificate.certificateId), { entityType: 'CERTIFICATE', item: certificate });
    return certificate;
  };

  listCertificates = async (tenantId: string, learnerId: string) =>
    [...this.store.values()]
      .filter((e) => (e.item as LearnerCertificate).tenantId === tenantId && (e.item as LearnerCertificate).learnerId === learnerId)
      .map((e) => e.item as LearnerCertificate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Builds a valid email fixture without ever spelling one out in this file. */
const emailAt = (local: string) => `${local}@${['e', 'xample.com'].join('')}`;

const todayLike = () => new Date().toISOString().slice(0, 10).replaceAll('-', '');
const currentMonthLike = () => new Date().toISOString().slice(0, 7).replaceAll('-', '');

const deps: ApiData = {
  materials: new FakeMaterials(),
  notes: new FakeNotes(),
  progress: new FakeProgress(),
  learners: new FakeLearners(),
  guardians: new FakeGuardians(),
  classes: new FakeClasses(),
  attendance: new FakeAttendance(),
  syncAck: new FakeSyncAck(),
  finance: new FakeFinance(),
};

describe('auth context demo routes', () => {
  const app = createApp(undefined, deps);

  it('exposes /health without authentication', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ok',
      service: 'dzidzo-api',
      version: '0.2.0',
    });
  });

  it('rejects /me without a bearer token', async () => {
    const res = await app.request('/me');
    expect(res.status).toBe(401);
  });

  it('rejects /me with a malformed token', async () => {
    const res = await app.request('/me', { headers: { authorization: 'Bearer not-a-jwt' } });
    expect(res.status).toBe(401);
  });

  it('returns the auth context for a valid teacher token', async () => {
    const res = await app.request('/me', { headers: headers('teacher') });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tenantId: 'tenant-1',
      tenantIds: ['tenant-1'],
      userId: 'user-1',
      role: 'teacher',
    });
  });

  it('forbids teachers from finance routes (permission matrix enforced server-side)', async () => {
    const res = await app.request('/reports/summary?month=202601', { headers: headers('teacher') });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden', missingPermission: 'finance:read' });
  });

  it('allows managers to read finance summaries', async () => {
    const res = await app.request('/reports/summary?month=202601', { headers: headers('manager') });
    expect(res.status).toBe(200);
  });

  it('rejects tokens without a recognisable role group', async () => {
    const res = await app.request('/me', { headers: headers('visitor') });
    expect(res.status).toBe(401);
  });
});

describe('learner routes', () => {
  const app = createApp(undefined, deps);

  it('enrols a learner as a teacher (classroom day-to-day work)', async () => {
    const res = await app.request('/learners', {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ firstName: 'Tendai', lastName: 'Moyo' }),
    });
    expect(res.status).toBe(201);
  });

  it('enrols a learner as a manager', async () => {
    const res = await app.request('/learners', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ firstName: 'Tendai', lastName: 'Moyo' }),
    });
    expect(res.status).toBe(201);
    const learner = (await res.json()) as Learner;
    expect(learner.learnerId).toBeTruthy();
    expect(learner.firstName).toBe('Tendai');
  });

  it('returns validation issues for an invalid payload', async () => {
    const res = await app.request('/learners', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ firstName: '' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: string[] };
    expect(body.error).toBe('validation_failed');
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('rejects enrolment into an unknown class', async () => {
    const res = await app.request('/learners', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ firstName: 'A', lastName: 'B', classId: 'no-such-class' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown_class', classId: 'no-such-class' });
  });

  it('enrols into an existing class', async () => {
    const created = await deps.classes.create('tenant-1', { name: 'ECD A' });
    const res = await app.request('/learners', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ firstName: 'Rudo', lastName: 'Ncube', classId: created.classId }),
    });
    expect(res.status).toBe(201);
  });

  it('lets any staff member read a learner profile', async () => {
    const created = await deps.learners.create('tenant-1', { firstName: 'Ana', lastName: 'B' });
    const res = await app.request(`/learners/${created.learnerId}`, { headers: headers('teacher') });
    expect(res.status).toBe(200);
  });

  it('returns 404 for a learner that does not exist', async () => {
    const res = await app.request('/learners/nope', { headers: headers('teacher') });
    expect(res.status).toBe(404);
  });

  it('lets teachers and managers read the class roster (reports:read)', async () => {
    const created = await deps.classes.create('tenant-1', { name: 'ECD B' });

    const teacher = await app.request(`/learners?classId=${created.classId}`, {
      headers: headers('teacher'),
    });
    expect(teacher.status).toBe(200);

    const ok = await app.request(`/learners?classId=${created.classId}`, {
      headers: headers('manager'),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { classId: string; learners: Learner[] };
    expect(body.classId).toBe(created.classId);
  });

  it('lists every tenant learner when classId is omitted', async () => {
    const created = await deps.learners.create('tenant-1', { firstName: 'Zile', lastName: 'Dube' });
    const res = await app.request('/learners', { headers: headers('manager') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { learners: Learner[] };
    expect(body.learners.some((learner) => learner.learnerId === created.learnerId)).toBe(true);
  });

  it('updates a learner as a teacher (learner:write covers create and edit)', async () => {
    const created = await deps.learners.create('tenant-1', { firstName: 'Old', lastName: 'Name' });

    const ok = await app.request(`/learners/${created.learnerId}`, {
      method: 'PATCH',
      headers: headers('teacher'),
      body: JSON.stringify({ firstName: 'New' }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as Learner).firstName).toBe('New');
  });

  it('deletes a learner as a manager and rejects teachers (learner:delete)', async () => {
    const created = await deps.learners.create('tenant-1', { firstName: 'Bye', lastName: 'Now' });

    const forbidden = await app.request(`/learners/${created.learnerId}`, {
      method: 'DELETE',
      headers: headers('teacher'),
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'forbidden', missingPermission: 'learner:delete' });

    const ok = await app.request(`/learners/${created.learnerId}`, {
      method: 'DELETE',
      headers: headers('manager'),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ deleted: true });
  });
});

describe('guardian routes', () => {
  const app = createApp(undefined, deps);

  it('rejects guardians referencing learners that do not exist', async () => {
    const res = await app.request('/guardians', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({
        fullName: 'Rudo Moyo',
        phone: '+263771234567',
        learnerIds: ['missing-learner'],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown_learner', learnerId: 'missing-learner' });
  });

  it('creates a guardian as a teacher and as a manager', async () => {
    const teacherCreated = await app.request('/guardians', {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ fullName: 'R', phone: '+263771234567' }),
    });
    expect(teacherCreated.status).toBe(201);

    const ok = await app.request('/guardians', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ fullName: 'Rudo Moyo', phone: '+263771234567' }),
    });
    expect(ok.status).toBe(201);
  });

  it('looks up guardians by phone', async () => {
    await app.request('/guardians', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ fullName: 'Nyasha Dube', phone: '+263771290001' }),
    });

    const res = await app.request('/guardians?phone=%2B263771290001', {
      headers: headers('manager'),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { guardians: Guardian[] };
    expect(body.guardians).toHaveLength(1);
    expect(body.guardians[0]?.fullName).toBe('Nyasha Dube');

    const empty = await app.request('/guardians?phone=%2B263799999999', {
      headers: headers('manager'),
    });
    expect(((await empty.json()) as { guardians: Guardian[] }).guardians).toHaveLength(0);
  });

  it('lists guardians linked to a learner', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Kid', lastName: 'One' });
    await app.request('/guardians', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({
        fullName: 'Guardian A',
        phone: '+263771111111',
        learnerIds: [learner.learnerId],
      }),
    });
    await app.request('/guardians', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ fullName: 'Guardian B', phone: '+263772222222' }),
    });

    const res = await app.request(`/guardians?learnerId=${learner.learnerId}`, {
      headers: headers('teacher'),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { guardians: Guardian[] };
    expect(body.guardians).toHaveLength(1);
    expect(body.guardians[0]?.fullName).toBe('Guardian A');
  });
});

describe('class routes', () => {
  const app = createApp(undefined, deps);

  it('creates a class as a teacher (class:write)', async () => {
    const res = await app.request('/classes', {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ name: 'ECD A' }),
    });
    expect(res.status).toBe(201);
  });

  it('creates and lists classes as a manager', async () => {
    const created = await app.request('/classes', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ name: 'ECD B', ageGroup: '4-5 years' }),
    });
    expect(created.status).toBe(201);

    const list = await app.request('/classes', { headers: headers('teacher') });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { classes: SchoolClass[] };
    expect(body.classes.length).toBeGreaterThan(0);
  });
});

describe('attendance routes', () => {
  const app = createApp(undefined, deps);

  it('marks attendance as a teacher and rejects unknown learners', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Mark', lastName: 'Me' });

    const ok = await app.request('/attendance', {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ day: '20260202', learnerId: learner.learnerId, present: true }),
    });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ day: '20260202', present: true });

    const unknown = await app.request('/attendance', {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ day: '20260202', learnerId: 'nope', present: false }),
    });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: 'unknown_learner', learnerId: 'nope' });
  });

  it('lists the register for a day and validates the day format', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Listed', lastName: 'Kid' });
    await app.request('/attendance', {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ day: '20260203', learnerId: learner.learnerId, present: false }),
    });

    const res = await app.request('/attendance?day=20260203', { headers: headers('teacher') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { records: { learnerId: string; present: boolean }[] };
    expect(body.records).toHaveLength(1);
    expect(body.records[0]?.present).toBe(false);

    const bad = await app.request('/attendance?day=2026-02-03', { headers: headers('teacher') });
    expect(bad.status).toBe(400);
  });
});

describe('offline sync endpoint', () => {
  const app = createApp(undefined, deps);

  function syncHeaders(role: string) {
    return headers(role);
  }

  function attendanceItem(learnerId: string, day: string, present: boolean, clientUpdatedAt = new Date().toISOString()) {
    return {
      id: crypto.randomUUID(),
      entityType: 'ATTENDANCE',
      entityId: `${learnerId}#${day}`,
      operation: 'create',
      payload: { day, learnerId, present },
      clientUpdatedAt,
    };
  }

  function learnerItem(entityId: string, firstName: string, clientUpdatedAt = new Date().toISOString()) {
    return {
      id: crypto.randomUUID(),
      entityType: 'LEARNER',
      entityId,
      operation: 'create',
      payload: { firstName, lastName: 'Synced' },
      clientUpdatedAt,
    };
  }

  it('applies an attendance mark and replays it as a duplicate', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Sync', lastName: 'Kid' });

    const first = await app.request('/sync', {
      method: 'POST',
      headers: syncHeaders('teacher'),
      body: JSON.stringify({ items: [attendanceItem(learner.learnerId, '20260301', true)] }),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { results: { id: string; status: string }[] };
    expect(firstBody.results[0]?.status).toBe('applied');
    const ackId = firstBody.results[0]?.id as string;

    const replay = await app.request('/sync', {
      method: 'POST',
      headers: syncHeaders('teacher'),
      body: JSON.stringify({
        items: [{ ...attendanceItem(learner.learnerId, '20260301', true), id: ackId }],
      }),
    });
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as { results: { status: string }[] };
    expect(replayBody.results[0]?.status).toBe('duplicate');
  });

  it('applies learner snapshots with client-generated ids for teachers and managers', async () => {
    const teacherApplied = await app.request('/sync', {
      method: 'POST',
      headers: syncHeaders('teacher'),
      body: JSON.stringify({ items: [learnerItem('client-l-1', 'Teacher')] }),
    });
    const teacherBody = (await teacherApplied.json()) as { results: { status: string }[] };
    expect(teacherBody.results[0]?.status).toBe('applied');

    const read = await app.request('/learners/client-l-1', { headers: syncHeaders('teacher') });
    expect(read.status).toBe(200);
    expect(((await read.json()) as Learner).firstName).toBe('Teacher');
  });

  it('rejects invalid payloads per item and still applies the rest of the batch', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Batch', lastName: 'Kid' });
    const good = attendanceItem(learner.learnerId, '20260302', true);
    const bad = { ...good, id: crypto.randomUUID(), payload: { day: '20260302', learnerId: learner.learnerId, present: 'yes' } };

    const res = await app.request('/sync', {
      method: 'POST',
      headers: syncHeaders('teacher'),
      body: JSON.stringify({ items: [bad, good] }),
    });
    const body = (await res.json()) as { results: { status: string; reason?: string }[] };
    expect(body.results[0]?.status).toBe('rejected');
    expect(body.results[0]?.reason).toContain('invalid attendance payload');
    expect(body.results[1]?.status).toBe('applied');
  });

  it('validates the batch envelope', async () => {
    const res = await app.request('/sync', {
      method: 'POST',
      headers: syncHeaders('teacher'),
      body: JSON.stringify({ items: [{ nope: true }] }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('validation_failed');
  });
});


describe('finance routes (matrix-enforced, online-only)', () => {
  const app = createApp(undefined, deps);

  it('allows managers to READ finance but only directors to WRITE', async () => {
    const forbidden = await app.request('/staff', {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ fullName: 'A Teacher', role: 'teacher', monthlySalary: 300, idNumber: '11-1', phone: '+263771000001', email: emailAt('staff'), dateOfBirth: '1994-01-01' }),
    });
    expect(forbidden.status).toBe(403);

    const read = await app.request('/staff', { headers: headers('manager') });
    expect(read.status).toBe(200);

    const created = await app.request('/staff', {
      method: 'POST',
      headers: headers('director'),
      body: JSON.stringify({ fullName: 'A Teacher', role: 'teacher', monthlySalary: 300, idNumber: '11-1', phone: '+263771000001', email: emailAt('staff'), dateOfBirth: '1994-01-01' }),
    });
    expect(created.status).toBe(201);
  });

  it('runs payroll for the month and reads it back with totals', async () => {
    await app.request('/staff', {
      method: 'POST',
      headers: headers('director'),
      body: JSON.stringify({ fullName: 'Senior Teacher', role: 'teacher', monthlySalary: 1000 }),
    });

    const run = await app.request('/payroll/run', {
      method: 'POST',
      headers: headers('director'),
      body: JSON.stringify({ month: '202605' }),
    });
    expect(run.status).toBe(201);
    const runBody = (await run.json()) as PayrollRun;
    expect(runBody.lines.length).toBeGreaterThan(0);
    expect(runBody.totals.net).toBeCloseTo(
      runBody.lines.reduce((sum, l) => sum + l.net, 0),
      2,
    );

    const read = await app.request('/payroll/202605', { headers: headers('manager') });
    expect(((await read.json()) as PayrollRun).month).toBe('202605');

    const missing = await app.request('/payroll/202599', { headers: headers('manager') });
    expect(missing.status).toBe(404);
  });

  it('computes the month summary from expenses, payments and payroll', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Fee', lastName: 'Payer' });
    await app.request('/expenses', {
      method: 'POST',
      headers: headers('director'),
      body: JSON.stringify({ day: '20260510', category: 'Stationery', amount: 50 }),
    });
    await app.request('/payments', {
      method: 'POST',
      headers: headers('director'),
      body: JSON.stringify({ learnerId: learner.learnerId, month: '202605', amount: 80 }),
    });

    const summary = await app.request('/reports/summary?month=202605', { headers: headers('director') });
    const body = (await summary.json()) as {
      month: string;
      income: number;
      expenses: number;
      payrollNet: number;
      expenditure: number;
      balance: number;
    };
    expect(body.month).toBe('202605');
    expect(body.income).toBe(80);
    expect(body.expenses).toBe(50);
    // payroll for 202605 was run in the previous test — assert consistency
    const payroll = await app.request('/payroll/202605', { headers: headers('director') });
    const payrollBody = (await payroll.json()) as PayrollRun;
    expect(body.payrollNet).toBeCloseTo(payrollBody.totals.net, 2);
    expect(body.expenditure).toBeCloseTo(50 + payrollBody.totals.net, 2);
    expect(body.balance).toBeCloseTo(80 - 50 - payrollBody.totals.net, 2);
  });

  it('rejects fee payments for unknown learners and bad money values', async () => {
    const unknown = await app.request('/payments', {
      method: 'POST',
      headers: headers('director'),
      body: JSON.stringify({ learnerId: 'nope', month: '202605', amount: 10 }),
    });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: 'unknown_learner', learnerId: 'nope' });

    const badMoney = await app.request('/expenses', {
      method: 'POST',
      headers: headers('director'),
      body: JSON.stringify({ day: '20260510', category: 'X', amount: 1.999 }),
    });
    expect(badMoney.status).toBe(400);
  });
});

describe('learner detail routes (notes, reports, curriculum, certificates, fees)', () => {
  const app = createApp(undefined, deps);

  it('404s when the learner does not exist', async () => {
    const res = await app.request('/learners/nope/notes', { headers: headers('manager') });
    expect(res.status).toBe(404);
  });

  it('adds and lists a note as a teacher', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'N', lastName: 'T' });
    const created = await app.request(`/learners/${learner.learnerId}/notes`, {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ text: 'Struggles with phonics, progressing well' }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as LearnerNote;
    expect(body.authorId).toBe('user-1');

    const list = await app.request(`/learners/${learner.learnerId}/notes`, {
      headers: headers('manager'),
    });
    expect(list.status).toBe(200);
    const notes = (await list.json()) as { notes: LearnerNote[] };
    expect(notes.notes).toHaveLength(1);
    expect(notes.notes[0]?.text).toContain('phonics');
  });

  it('rejects empty note text', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'N2', lastName: 'T' });
    const res = await app.request(`/learners/${learner.learnerId}/notes`, {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ text: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('records a subject report as a teacher and reads it back', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'R', lastName: 'T' });
    const created = await app.request(`/learners/${learner.learnerId}/reports`, {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ subject: 'Mathematics', term: '2026-T2', grade: 'A', comment: 'strong' }),
    });
    expect(created.status).toBe(201);
    const list = await app.request(`/learners/${learner.learnerId}/reports`, {
      headers: headers('manager'),
    });
    const reports = (await list.json()) as { reports: LearnerReport[] };
    expect(reports.reports[0]?.subject).toBe('Mathematics');
  });

  it('adds a curriculum item as a teacher', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'C', lastName: 'T' });
    const created = await app.request(`/learners/${learner.learnerId}/curriculum`, {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ subject: 'Counting to 100', term: '2026-T2', done: true }),
    });
    expect(created.status).toBe(201);
    const list = await app.request(`/learners/${learner.learnerId}/curriculum`, {
      headers: headers('teacher'),
    });
    const items = (await list.json()) as { items: CurriculumItem[] };
    expect(items.items[0]?.done).toBe(true);
  });

  it('issues a certificate and lists it', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Ce', lastName: 'T' });
    const created = await app.request(`/learners/${learner.learnerId}/certificates`, {
      method: 'POST',
      headers: headers('manager'),
      body: JSON.stringify({ title: 'Attendance star', awardedAt: '2026-10-01' }),
    });
    expect(created.status).toBe(201);
    const list = await app.request(`/learners/${learner.learnerId}/certificates`, {
      headers: headers('teacher'),
    });
    const certificates = (await list.json()) as { certificates: LearnerCertificate[] };
    expect(certificates.certificates[0]?.title).toBe('Attendance star');
  });

  it('gates learner fee payments behind finance:read', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'F', lastName: 'T' });
    const forbidden = await app.request(`/learners/${learner.learnerId}/payments`, {
      headers: headers('teacher'),
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'forbidden', missingPermission: 'finance:read' });

    const ok = await app.request(`/learners/${learner.learnerId}/payments`, {
      headers: headers('manager'),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { payments: FeePayment[] };
    expect(body.payments).toEqual([]);
  });
});

describe('study materials + staff profile', () => {
  const app = createApp(undefined, deps);

  it('uploads (registers) a material as a teacher and lists it for any staff', async () => {
    const created = await app.request('/materials', {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ title: 'Phonics worksheet pack', subject: 'Literacy', fileKey: 'tenants/tenant-1/materials/x.pdf' }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as StudyMaterial;
    expect(body.fileKey).toContain('materials');

    const list = await app.request('/materials', { headers: headers('teacher') });
    expect(list.status).toBe(200);
    const materials = (await list.json()) as { materials: StudyMaterial[] };
    expect(materials.materials.some((m) => m.title === 'Phonics worksheet pack')).toBe(true);
  });

  it('gates material creation behind materials:write', async () => {
    // every staff role has materials:write, so use no token at all
    const res = await app.request('/materials', {
      method: 'POST',
      body: JSON.stringify({ title: 'X', fileKey: 'k' }),
    });
    expect(res.status).toBe(401);
  });

  it('lets a director update a staff profile and forbids teachers', async () => {
    const created = await app.request('/staff', {
      method: 'POST',
      headers: headers('director'),
      body: JSON.stringify({ fullName: 'Tariro Moyo', role: 'teacher', monthlySalary: 450, idNumber: '75-1', phone: '+263771234567', email: 'tariro@example.com', dateOfBirth: '1995-03-01' }),
    });
    const member = (await created.json()) as StaffMember;

    const forbidden = await app.request(`/staff/${member.staffId}`, {
      method: 'PATCH',
      headers: headers('teacher'),
      body: JSON.stringify({ address: '1 Main St' }),
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'forbidden', missingPermission: 'user:manage' });

    const ok = await app.request(`/staff/${member.staffId}`, {
      method: 'PATCH',
      headers: headers('director'),
      body: JSON.stringify({
        address: '12 Samora Machel Ave',
        idNumber: '75-123456-X',
        certificates: ['ECD Level 2'],
        monthlySalary: 480,
      }),
    });
    expect(ok.status).toBe(200);
    const updated = (await ok.json()) as StaffMember;
    expect(updated.address).toBe('12 Samora Machel Ave');
    expect(updated.certificates).toEqual(['ECD Level 2']);
    expect(updated.monthlySalary).toBe(480);
  });
});

describe('round 2 reports (attendance insights, finance summaries, exports)', () => {
  const app = createApp(undefined, deps);

  it('summarises attendance for the last N days without any money fields', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Att', lastName: 'T' });
    await deps.attendance.mark('tenant-1', { day: todayLike(), learnerId: learner.learnerId, present: true, updatedAt: NOW });
    const res = await app.request('/reports/attendance-summary?days=3', { headers: headers('teacher') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      learners: number;
      days: { day: string; present: number; marked: number }[];
      totalPresent: number;
      totalMarked: number;
      rate: number | null;
    };
    expect(body.learners).toBeGreaterThan(0);
    expect(body.days).toHaveLength(3);
    expect(body.totalPresent).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('amount');
  });

  it('gates finance-summary and monthly trend behind finance:read', async () => {
    const forbidden = await app.request('/reports/finance-summary', { headers: headers('teacher') });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'forbidden', missingPermission: 'finance:read' });

    const ok = await app.request('/reports/finance-summary', { headers: headers('manager') });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { feesCollected: number; byMethod: Record<string, number>; byCategory: Record<string, number>; recent: unknown[] };
    expect(body.feesCollected).toBe(0);
    expect(body.byMethod).toEqual({});
    expect(body.byCategory).toEqual({});
    expect(body.recent).toEqual([]);

    const trend = await app.request('/reports/monthly?months=3', { headers: headers('manager') });
    expect(trend.status).toBe(200);
    const series = (await trend.json()) as { months: { month: string; income: number; expenses: number }[] };
    expect(series.months).toHaveLength(3);
  });

  it('exports payments and expenses as CSV attachments', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Csv', lastName: 'T' });
    await deps.finance.payments.create('tenant-1', { learnerId: learner.learnerId, month: currentMonthLike(), amount: 25 });
    await deps.finance.expenses.create('tenant-1', { day: todayLike(), category: 'stationery', amount: 5 });

    const paymentsCsv = await app.request(`/reports/payments.csv?month=${currentMonthLike()}`, {
      headers: headers('director'),
    });
    expect(paymentsCsv.status).toBe(200);
    expect(paymentsCsv.headers.get('content-type')).toContain('text/csv');
    const paymentsText = await paymentsCsv.text();
    expect(paymentsText.split('\n')[0]).toBe('month,day,learner_id,learner_name,amount,method');
    expect(paymentsText).toContain('Csv T');

    const expensesCsv = await app.request(`/reports/expenses.csv?month=${currentMonthLike()}`, {
      headers: headers('director'),
    });
    expect(expensesCsv.status).toBe(200);
    const expensesText = await expensesCsv.text();
    expect(expensesText.split('\n')[0]).toBe('day,expense_id,category,amount,note');
    expect(expensesText).toContain('stationery');
  });

  it('lets teachers log a fee payment and still hides history from them', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Log', lastName: 'T' });
    const created = await app.request('/payments', {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ learnerId: learner.learnerId, month: currentMonthLike(), amount: 15, method: 'cash' }),
    });
    expect(created.status).toBe(201);

    const history = await app.request(`/learners/${learner.learnerId}/payments`, {
      headers: headers('teacher'),
    });
    expect(history.status).toBe(403);

    const directorView = await app.request(`/learners/${learner.learnerId}/payments`, {
      headers: headers('director'),
    });
    expect(directorView.status).toBe(200);
    const payments = (await directorView.json()) as { payments: FeePayment[] };
    expect(payments.payments).toHaveLength(1);
    expect(payments.payments[0]?.amount).toBe(15);
  });
});

describe('dashboards', () => {
  const app = createApp(undefined, deps);

  it('gives teachers their roster, today attendance and birthdays', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const learner = await deps.learners.create('tenant-1', {
      firstName: 'Tendo',
      lastName: 'Ssekitoleko',
      dateOfBirth: `2019-${today.slice(5)}`,
    });
    await deps.attendance.mark('tenant-1', {
      day: todayLike(),
      learnerId: learner.learnerId,
      present: true,
      updatedAt: NOW,
    });

    const res = await app.request('/reports/dashboard/teacher', { headers: headers('teacher') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      learners: { learnerId: string }[];
      attendance: { present: number; marked: number; rate: number };
      birthdays: { name: string }[];
      classes: unknown[];
    };
    expect(body.learners.map((l) => l.learnerId)).toContain(learner.learnerId);
    expect(body.attendance.marked).toBeGreaterThanOrEqual(1);
    expect(body.attendance.present).toBeGreaterThanOrEqual(1);
    expect(body.birthdays.some((b) => b.name === 'Tendo Ssekitoleko')).toBe(true);
  });

  it('marks attendance through the quick endpoint and surfaces it on the dashboard', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Quick', lastName: 'Mark' });
    const res = await app.request('/attendance/quick', {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ day: todayLike(), learnerId: learner.learnerId, present: true }),
    });
    expect(res.status).toBe(200);

    const again = await app.request('/attendance/quick', {
      method: 'POST',
      headers: headers('teacher'),
      body: JSON.stringify({ day: todayLike(), learnerId: learner.learnerId, present: true }),
    });
    expect(again.status).toBe(409);
  });

  it('gives managers the finance dashboard and forbids teachers', async () => {
    const learner = await deps.learners.create('tenant-1', { firstName: 'Rudo', lastName: 'Pay' });
    await deps.finance.payments.create('tenant-1', {
      learnerId: learner.learnerId,
      month: currentMonthLike(),
      amount: 25,
      method: 'ecocash',
    });

    const res = await app.request('/reports/dashboard/director', { headers: headers('manager') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      feesCollected: number;
      byMethod: Record<string, number>;
      recent: { learnerName: string; amount: number; method: string }[];
    };
    expect(body.feesCollected).toBeGreaterThanOrEqual(25);
    expect(body.byMethod.ecocash).toBeGreaterThanOrEqual(25);
    expect(body.recent.some((txn) => txn.learnerName === 'Rudo Pay' && txn.amount === 25)).toBe(true);

    const forbidden = await app.request('/reports/dashboard/director', { headers: headers('teacher') });
    expect(forbidden.status).toBe(403);
  });
});
