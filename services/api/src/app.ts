import type { OutboxItem, Permission } from '@dzidzo/core';
import {
  attendanceMarkSchema,
  classCreateSchema,
  expenseCreateSchema,
  guardianCreateSchema,
  guardianUpdateSchema,
  learnerCreateSchema,
  learnerUpdateSchema,
  paymentCreateSchema,
  payrollRunSchema,
  staffCreateSchema,
  staffUpdateSchema,
  certificateCreateSchema,
  curriculumCreateSchema,
  materialCreateSchema,
  noteCreateSchema,
  reportCreateSchema,
  summarizeMonth,
  syncRequestSchema,
  toClassCreateInput,
  uploadRequestSchema,
  toExpenseCreateInput,
  toGuardianCreateInput,
  toGuardianUpdateInput,
  toLearnerCreateInput,
  toLearnerUpdateInput,
  toPaymentCreateInput,
  zodIssues,
} from '@dzidzo/core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDb, UnknownLearnerError, type ApiData } from './db';
import type { MarkInput } from './db/attendance';
import type { AppEnv } from './env';
import {
  authMiddleware,
  developmentVerifier,
  requirePermission,
  type TokenVerifier,
} from './middleware/auth';
import { applySyncItem } from './sync/apply';
import { presignDownload, presignUpload } from './uploads';

export const API_VERSION = '0.2.0';

/** Aggregated month finance data shared by the finance-summary, monthly
 * trend and dashboard routes. */
async function monthFinanceInsights(data: ApiData, tenantId: string, month: string) {
  const [payments, expenses, payroll] = await Promise.all([
    data.finance.payments.listForMonth(tenantId, month),
    data.finance.expenses.listForMonth(tenantId, month),
    data.finance.payroll.get(tenantId, month),
  ]);
  const feesCollected = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  const byMethod: Record<string, number> = {};
  for (const payment of payments) {
    const method = payment.method ?? 'unspecified';
    byMethod[method] = Math.round(((byMethod[method] ?? 0) + payment.amount) * 100) / 100;
  }
  const byCategory: Record<string, number> = {};
  for (const expense of expenses) {
    byCategory[expense.category] = Math.round(((byCategory[expense.category] ?? 0) + expense.amount) * 100) / 100;
  }
  return { payments, expenses, payroll, feesCollected, byMethod, byCategory };
}

export function createApp(verify: TokenVerifier = developmentVerifier, data: ApiData = createDb()) {
  const app = new Hono<AppEnv>();

  /**
   * CORS response headers. API Gateway's generated OPTIONS preflight carries
   * these headers, but the Lambda's own responses must too — without them the
   * browser blocks every response ("Failed to fetch") even when the request
   * succeeded. Origins come from CORS_ORIGINS (comma-separated) so production
   * can add the CloudFront distribution without code changes.
   */
  app.use(
    '*',
    cors({
      origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value !== ''),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );

  app.get('/health', (c) => c.json({ status: 'ok', service: 'dzidzo-api', version: API_VERSION }));

  /** auth + permission check as one chain */
  const guarded = (permission: Permission) =>
    [authMiddleware(verify), requirePermission(permission)] as const;

  // ---------- learners ----------
  app.post('/learners', ...guarded('learner:write'), async (c) => {
    const parsed = learnerCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    if (parsed.data.classId) {
      const schoolClass = await data.classes.get(tenantId, parsed.data.classId);
      if (!schoolClass) {
        return c.json({ error: 'unknown_class', classId: parsed.data.classId }, 400);
      }
    }
    const learner = await data.learners.create(tenantId, toLearnerCreateInput(parsed.data));
    return c.json(learner, 201);
  });

  app.get('/learners/:learnerId', authMiddleware(verify), async (c) => {
    const learner = await data.learners.get(c.get('auth').tenantId, c.req.param('learnerId'));
    return learner ? c.json(learner) : c.json({ error: 'not_found' }, 404);
  });

  /** Learner list — reports-level read. Optional classId filters to one roster. */
  app.get('/learners', ...guarded('reports:read'), async (c) => {
    const classId = c.req.query('classId');
    const tenantId = c.get('auth').tenantId;
    if (classId) {
      const learners = await data.learners.listByClass(tenantId, classId);
      return c.json({ classId, learners });
    }
    const learners = await data.learners.listAll(tenantId);
    return c.json({ learners });
  });

  // ---------- learner detail: notes, reports, curriculum, certificates, fees ----------
  async function requireLearner(tenantId: string, learnerId: string) {
    return data.learners.get(tenantId, learnerId);
  }

  app.get('/learners/:learnerId/notes', authMiddleware(verify), async (c) => {
    const tenantId = c.get('auth').tenantId;
    const learnerId = c.req.param('learnerId');
    if (!(await requireLearner(tenantId, learnerId))) {
      return c.json({ error: 'not_found' }, 404);
    }
    const notes = await data.notes.listByLearner(tenantId, learnerId);
    return c.json({ notes });
  });

  app.post('/learners/:learnerId/notes', authMiddleware(verify), async (c) => {
    const parsed = noteCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    const learnerId = c.req.param('learnerId');
    if (!(await requireLearner(tenantId, learnerId))) {
      return c.json({ error: 'not_found' }, 404);
    }
    const note = await data.notes.create(tenantId, learnerId, parsed.data, c.get('auth').userId);
    return c.json(note, 201);
  });

  app.delete('/learners/:learnerId/notes/:noteId', authMiddleware(verify), async (c) => {
    const tenantId = c.get('auth').tenantId;
    await data.notes.remove(tenantId, c.req.param('learnerId'), c.req.param('noteId'));
    return c.json({ deleted: true });
  });

  app.get('/learners/:learnerId/reports', ...guarded('reports:read'), async (c) => {
    const tenantId = c.get('auth').tenantId;
    const learnerId = c.req.param('learnerId');
    if (!(await requireLearner(tenantId, learnerId))) {
      return c.json({ error: 'not_found' }, 404);
    }
    const reports = await data.progress.listReports(tenantId, learnerId);
    return c.json({ reports });
  });

  app.post('/learners/:learnerId/reports', ...guarded('assessment:write'), async (c) => {
    const parsed = reportCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    const learnerId = c.req.param('learnerId');
    if (!(await requireLearner(tenantId, learnerId))) {
      return c.json({ error: 'not_found' }, 404);
    }
    const { subject, term, grade, comment } = parsed.data;
    const report = await data.progress.createReport(
      tenantId,
      learnerId,
      { subject, term, grade, ...(comment !== undefined ? { comment } : {}) },
      c.get('auth').userId,
    );
    return c.json(report, 201);
  });

  app.get('/learners/:learnerId/curriculum', ...guarded('reports:read'), async (c) => {
    const tenantId = c.get('auth').tenantId;
    const learnerId = c.req.param('learnerId');
    if (!(await requireLearner(tenantId, learnerId))) {
      return c.json({ error: 'not_found' }, 404);
    }
    const items = await data.progress.listCurriculum(tenantId, learnerId);
    return c.json({ items });
  });

  app.post('/learners/:learnerId/curriculum', ...guarded('assessment:write'), async (c) => {
    const parsed = curriculumCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    const learnerId = c.req.param('learnerId');
    if (!(await requireLearner(tenantId, learnerId))) {
      return c.json({ error: 'not_found' }, 404);
    }
    const { subject, term, done } = parsed.data;
    const item = await data.progress.addCurriculumItem(
      tenantId,
      learnerId,
      { subject, done, ...(term !== undefined ? { term } : {}) },
    );
    return c.json(item, 201);
  });

  app.get('/learners/:learnerId/certificates', ...guarded('reports:read'), async (c) => {
    const tenantId = c.get('auth').tenantId;
    const learnerId = c.req.param('learnerId');
    if (!(await requireLearner(tenantId, learnerId))) {
      return c.json({ error: 'not_found' }, 404);
    }
    const certificates = await data.progress.listCertificates(tenantId, learnerId);
    return c.json({ certificates });
  });

  app.post('/learners/:learnerId/certificates', ...guarded('learner:write'), async (c) => {
    const parsed = certificateCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    const learnerId = c.req.param('learnerId');
    if (!(await requireLearner(tenantId, learnerId))) {
      return c.json({ error: 'not_found' }, 404);
    }
    const { title, awardedAt, fileKey } = parsed.data;
    const certificate = await data.progress.createCertificate(
      tenantId,
      learnerId,
      {
        title,
        ...(awardedAt !== undefined ? { awardedAt } : {}),
        ...(fileKey !== undefined ? { fileKey } : {}),
      },
    );
    return c.json(certificate, 201);
  });

  /** Fee payments for one learner — manager/director only (finance:read). */
  app.get('/learners/:learnerId/payments', ...guarded('finance:read'), async (c) => {
    const tenantId = c.get('auth').tenantId;
    const learnerId = c.req.param('learnerId');
    if (!(await requireLearner(tenantId, learnerId))) {
      return c.json({ error: 'not_found' }, 404);
    }
    const payments = await data.finance.payments.listForLearner(tenantId, learnerId);
    return c.json({ payments });
  });

  app.patch('/learners/:learnerId', ...guarded('learner:write'), async (c) => {
    const parsed = learnerUpdateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    if (parsed.data.classId) {
      const schoolClass = await data.classes.get(tenantId, parsed.data.classId);
      if (!schoolClass) {
        return c.json({ error: 'unknown_class', classId: parsed.data.classId }, 400);
      }
    }
    const learner = await data.learners.update(
      tenantId,
      c.req.param('learnerId'),
      toLearnerUpdateInput(parsed.data),
    );
    return learner ? c.json(learner) : c.json({ error: 'not_found' }, 404);
  });

  app.delete('/learners/:learnerId', ...guarded('learner:delete'), async (c) => {
    const tenantId = c.get('auth').tenantId;
    const existing = await data.learners.get(tenantId, c.req.param('learnerId'));
    if (!existing) {
      return c.json({ error: 'not_found' }, 404);
    }
    await data.learners.remove(tenantId, c.req.param('learnerId'));
    return c.json({ deleted: true });
  });

  // ---------- guardians ----------
  app.post('/guardians', ...guarded('guardian:write'), async (c) => {
    const parsed = guardianCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    try {
      const guardian = await data.guardians.create(
        c.get('auth').tenantId,
        toGuardianCreateInput(parsed.data),
      );
      return c.json(guardian, 201);
    } catch (error) {
      if (error instanceof UnknownLearnerError) {
        return c.json({ error: 'unknown_learner', learnerId: error.learnerId }, 400);
      }
      throw error;
    }
  });

  app.get('/guardians/:guardianId', authMiddleware(verify), async (c) => {
    const guardian = await data.guardians.get(c.get('auth').tenantId, c.req.param('guardianId'));
    return guardian ? c.json(guardian) : c.json({ error: 'not_found' }, 404);
  });

  app.get('/guardians', authMiddleware(verify), async (c) => {
    const phone = c.req.query('phone');
    const learnerId = c.req.query('learnerId');
    if (phone) {
      const guardians = await data.guardians.findByPhone(c.get('auth').tenantId, phone);
      return c.json({ phone, guardians });
    }
    if (learnerId) {
      const guardians = await data.guardians.listByLearner(c.get('auth').tenantId, learnerId);
      return c.json({ learnerId, guardians });
    }
    return c.json({ error: 'phone or learnerId query parameter is required' }, 400);
  });

  app.patch('/guardians/:guardianId', ...guarded('guardian:write'), async (c) => {
    const parsed = guardianUpdateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    try {
      const guardian = await data.guardians.update(
        c.get('auth').tenantId,
        c.req.param('guardianId'),
        toGuardianUpdateInput(parsed.data),
      );
      return guardian ? c.json(guardian) : c.json({ error: 'not_found' }, 404);
    } catch (error) {
      if (error instanceof UnknownLearnerError) {
        return c.json({ error: 'unknown_learner', learnerId: error.learnerId }, 400);
      }
      throw error;
    }
  });

  // ---------- classes ----------
  app.post('/classes', ...guarded('class:write'), async (c) => {
    const parsed = classCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const schoolClass = await data.classes.create(
      c.get('auth').tenantId,
      toClassCreateInput(parsed.data),
    );
    return c.json(schoolClass, 201);
  });

  app.get('/classes', authMiddleware(verify), async (c) => {
    const classes = await data.classes.list(c.get('auth').tenantId);
    return c.json({ classes });
  });

  app.get('/classes/:classId', authMiddleware(verify), async (c) => {
    const schoolClass = await data.classes.get(c.get('auth').tenantId, c.req.param('classId'));
    return schoolClass ? c.json(schoolClass) : c.json({ error: 'not_found' }, 404);
  });

  // ---------- attendance ----------
  app.post('/attendance', ...guarded('attendance:write'), async (c) => {
    const parsed = attendanceMarkSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    const learner = await data.learners.get(tenantId, parsed.data.learnerId);
    if (!learner) {
      return c.json({ error: 'unknown_learner', learnerId: parsed.data.learnerId }, 400);
    }
    const mark: MarkInput = {
      day: parsed.data.day,
      learnerId: parsed.data.learnerId,
      present: parsed.data.present,
      updatedAt: new Date().toISOString(),
    };
    if (parsed.data.markedBy !== undefined) {
      mark.markedBy = parsed.data.markedBy;
    }
    const record = await data.attendance.mark(tenantId, mark);
    return c.json(record, 201);
  });

  app.get('/attendance', authMiddleware(verify), async (c) => {
    const day = c.req.query('day');
    if (!day || !/^\d{8}$/.test(day)) {
      return c.json({ error: 'day query parameter must be formatted as yyyymmdd' }, 400);
    }
    const records = await data.attendance.getForDay(c.get('auth').tenantId, day);
    return c.json({ day, records });
  });

  // ---------- file uploads (assets bucket) ----------
  /** Presign a direct browser PUT. Avatars now; certificates/materials later. */
  app.post('/uploads', ...guarded('learner:write'), async (c) => {
    const parsed = uploadRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    try {
      const result = await presignUpload(
        c.get('auth').tenantId,
        parsed.data.kind,
        parsed.data.filename,
        parsed.data.contentType,
      );
      return c.json({ key: result.key, uploadUrl: result.uploadUrl }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'upload presign failed';
      if (message.includes('ASSETS_BUCKET_NAME')) {
        return c.json({ error: 'uploads_not_configured' }, 503);
      }
      if (message.includes('outside the tenant prefix')) {
        return c.json({ error: 'forbidden' }, 403);
      }
      return c.json({ error: 'upload_presign_failed' }, 500);
    }
  });

  /** Short-lived signed URL for any object in the caller's tenant prefix. */
  app.get('/files/*', authMiddleware(verify), async (c) => {
    const key = c.req.path.slice('/files/'.length);
    if (key === '' || key.includes('..')) {
      return c.json({ error: 'invalid_key' }, 400);
    }
    try {
      const url = await presignDownload(c.get('auth').tenantId, decodeURIComponent(key));
      /** JSON, not a redirect: fetch()-based reads must not chase a
       * cross-origin redirect whose S3 response carries no CORS headers.
       * <img>/<a> consumers use the URL directly — navigation needs none. */
      return c.json({ url });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'file lookup failed';
      if (message.includes('outside the tenant prefix')) {
        return c.json({ error: 'forbidden' }, 403);
      }
      if (message.includes('ASSETS_BUCKET_NAME')) {
        return c.json({ error: 'uploads_not_configured' }, 503);
      }
      return c.json({ error: 'not_found' }, 404);
    }
  });

  /** Attendance CSV export — defaults to the last three months. */
  app.get('/attendance/export', ...guarded('reports:read'), async (c) => {
    const yyyymmdd = (value: string | undefined) =>
      value && /^\d{8}$/.test(value) ? value : undefined;
    const toDate = yyyymmdd(c.req.query('to')) ?? new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const fromDate =
      yyyymmdd(c.req.query('from')) ??
      new Date(Date.now() - 92 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll('-', '');
    if (fromDate > toDate) {
      return c.json({ error: 'from must be on or before to' }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    const learners = await data.learners.listAll(tenantId);
    const nameByLearner = new Map(
      learners.map((learner) => [learner.learnerId, `${learner.firstName} ${learner.lastName}`]),
    );
    const rows: string[] = ['day,learner_id,learner_name,present,marked_by'];
    const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
    for (let t = toUtc(fromDate); t <= toUtc(toDate); t += 24 * 60 * 60 * 1000) {
      const day = new Date(t).toISOString().slice(0, 10).replaceAll('-', '');
      for (const record of await data.attendance.getForDay(tenantId, day)) {
        const cells = [
          record.day,
          record.learnerId,
          `"${(nameByLearner.get(record.learnerId) ?? 'unknown').replaceAll('"', '""')}"`,
          String(record.present),
          record.markedBy ?? '',
        ];
        rows.push(cells.join(','));
      }
    }
    const csv = `${rows.join('\n')}\n`;
    const filename = `attendance-${fromDate}-${toDate}.csv`;
    return c.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
  });

  /** Attendance insights — per-day present/marked plus weekly totals (no money). */
  app.get('/reports/attendance-summary', ...guarded('reports:read'), async (c) => {
    const days = Math.min(Math.max(Number(c.req.query('days') ?? 7), 1), 92);
    const tenantId = c.get('auth').tenantId;
    const learners = await data.learners.listAll(tenantId);
    const perDay: { day: string; present: number; marked: number }[] = [];
    let totalPresent = 0;
    let totalMarked = 0;
    for (let i = days - 1; i >= 0; i -= 1) {
      const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
        .replaceAll('-', '');
      const records = await data.attendance.getForDay(tenantId, day);
      const present = records.filter((r) => r.present).length;
      perDay.push({ day, present, marked: records.length });
      totalPresent += present;
      totalMarked += records.length;
    }
    const rate = totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : null;
    return c.json({
      learners: learners.length,
      days: perDay,
      totalPresent,
      totalMarked,
      rate,
    });
  });

  /** Director finance insights: fees collected, method split, category breakdown. */
  app.get('/reports/finance-summary', ...guarded('finance:read'), async (c) => {
    const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7).replaceAll('-', '');
    if (!/^\d{6}$/.test(month)) {
      return c.json({ error: 'month query parameter must be formatted as yyyymm' }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    const insights = await monthFinanceInsights(data, tenantId, month);
    const recent = [...insights.payments]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);
    return c.json({
      month,
      feesCollected: insights.feesCollected,
      paymentCount: insights.payments.length,
      byMethod: insights.byMethod,
      byCategory: insights.byCategory,
      recent,
      payrollNet: insights.payroll?.totals.net ?? null,
      payrollRun: insights.payroll !== undefined,
    });
  });

  /** CSV exports for the director. */
  app.get('/reports/payments.csv', ...guarded('finance:read'), async (c) => {
    const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7).replaceAll('-', '');
    if (!/^\d{6}$/.test(month)) {
      return c.json({ error: 'month query parameter must be formatted as yyyymm' }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    const [payments, learners] = await Promise.all([
      data.finance.payments.listForMonth(tenantId, month),
      data.learners.listAll(tenantId),
    ]);
    const nameByLearner = new Map(learners.map((l) => [l.learnerId, `${l.firstName} ${l.lastName}`]));
    const rows = ['month,day,learner_id,learner_name,amount,method'];
    for (const p of payments) {
      rows.push(
        [
          p.month,
          p.createdAt.slice(0, 10).replaceAll('-', ''),
          p.learnerId,
          `"${(nameByLearner.get(p.learnerId) ?? 'unknown').replaceAll('"', '""')}"`,
          p.amount.toFixed(2),
          p.method ?? '',
        ].join(','),
      );
    }
    return c.body(`${rows.join('\n')}\n`, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payments-${month}.csv"`,
    });
  });

  app.get('/reports/expenses.csv', ...guarded('finance:read'), async (c) => {
    const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7).replaceAll('-', '');
    if (!/^\d{6}$/.test(month)) {
      return c.json({ error: 'month query parameter must be formatted as yyyymm' }, 400);
    }
    const expenses = await data.finance.expenses.listForMonth(c.get('auth').tenantId, month);
    const rows = ['day,expense_id,category,amount,note'];
    for (const e of expenses) {
      rows.push(
        [
          e.day,
          e.expenseId,
          `"${e.category.replaceAll('"', '""')}"`,
          e.amount.toFixed(2),
          `"${(e.note ?? '').replaceAll('"', '""')}"`,
        ].join(','),
      );
    }
    return c.body(`${rows.join('\n')}\n`, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="expenses-${month}.csv"`,
    });
  });

  // ---------- study materials library ----------
  app.get('/materials', authMiddleware(verify), async (c) => {
    const materials = await data.materials.list(c.get('auth').tenantId);
    return c.json({ materials });
  });

  app.post('/materials', ...guarded('materials:write'), async (c) => {
    const parsed = materialCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const { title, subject, description, fileKey } = parsed.data;
    const material = await data.materials.create(
      c.get('auth').tenantId,
      { title, fileKey, ...(subject !== undefined ? { subject } : {}), ...(description !== undefined ? { description } : {}) },
      c.get('auth').userId,
    );
    return c.json(material, 201);
  });

  app.delete('/materials/:materialId', ...guarded('materials:write'), async (c) => {
    await data.materials.remove(c.get('auth').tenantId, c.req.param('materialId'));
    return c.json({ deleted: true });
  });

  // ---------- offline sync ----------
  app.post('/sync', authMiddleware(verify), async (c) => {
    const auth = c.get('auth');
    const parsed = syncRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const results = [];
    for (const item of parsed.data.items) {
      results.push(
        await applySyncItem({
          tenantId: auth.tenantId,
          role: auth.role,
          item: item as OutboxItem,
          deps: {
            learners: data.learners,
            attendance: data.attendance,
            syncAck: data.syncAck,
          },
        }),
      );
    }
    return c.json({ results });
  });

  // ---------- finance ----------
  app.post('/staff', ...guarded('finance:write'), async (c) => {
    const parsed = staffCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const { fullName, role, monthlySalary, idNumber, phone, email, dateOfBirth, ...optional } =
      parsed.data;
    const member = await data.finance.staff.create(c.get('auth').tenantId, {
      fullName,
      role,
      monthlySalary,
      idNumber,
      phone,
      email,
      dateOfBirth,
      ...(optional.address !== undefined ? { address: optional.address } : {}),
      ...(optional.avatarKey !== undefined ? { avatarKey: optional.avatarKey } : {}),
      ...(optional.certificates !== undefined ? { certificates: optional.certificates } : {}),
    });
    return c.json(member, 201);
  });

  app.patch('/staff/:staffId', ...guarded('user:manage'), async (c) => {
    const parsed = staffUpdateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const patch = parsed.data;
    const member = await data.finance.staff.update(c.get('auth').tenantId, c.req.param('staffId'), {
      ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.monthlySalary !== undefined ? { monthlySalary: patch.monthlySalary } : {}),
      ...(patch.idNumber !== undefined ? { idNumber: patch.idNumber } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.dateOfBirth !== undefined ? { dateOfBirth: patch.dateOfBirth } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.avatarKey !== undefined ? { avatarKey: patch.avatarKey } : {}),
      ...(patch.certificates !== undefined ? { certificates: patch.certificates } : {}),
    });
    if (!member) {
      return c.json({ error: 'not_found' }, 404);
    }
    return c.json(member);
  });

  app.get('/staff', ...guarded('finance:read'), async (c) => {
    const staff = await data.finance.staff.list(c.get('auth').tenantId);
    return c.json({ staff });
  });

  app.post('/payroll/run', ...guarded('finance:write'), async (c) => {
    const parsed = payrollRunSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const run = await data.finance.payroll.run(c.get('auth').tenantId, parsed.data.month);
    return c.json(run, 201);
  });

  app.get('/payroll/:month', ...guarded('finance:read'), async (c) => {
    const run = await data.finance.payroll.get(c.get('auth').tenantId, c.req.param('month'));
    return run ? c.json(run) : c.json({ error: 'not_found' }, 404);
  });

  app.post('/expenses', ...guarded('finance:write'), async (c) => {
    const parsed = expenseCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const expense = await data.finance.expenses.create(
      c.get('auth').tenantId,
      toExpenseCreateInput(parsed.data),
    );
    return c.json(expense, 201);
  });

  app.get('/expenses', ...guarded('finance:read'), async (c) => {
    const month = c.req.query('month');
    if (!month || !/^\d{6}$/.test(month)) {
      return c.json({ error: 'month query parameter must be formatted as yyyymm' }, 400);
    }
    const expenses = await data.finance.expenses.listForMonth(c.get('auth').tenantId, month);
    return c.json({ month, expenses });
  });

  app.post('/payments', ...guarded('payments:log'), async (c) => {
    const parsed = paymentCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    const learner = await data.learners.get(tenantId, parsed.data.learnerId);
    if (!learner) {
      return c.json({ error: 'unknown_learner', learnerId: parsed.data.learnerId }, 400);
    }
    const payment = await data.finance.payments.create(
      tenantId,
      toPaymentCreateInput(parsed.data),
    );
    return c.json(payment, 201);
  });

  app.get('/payments', ...guarded('finance:read'), async (c) => {
    const month = c.req.query('month');
    if (!month || !/^\d{6}$/.test(month)) {
      return c.json({ error: 'month query parameter must be formatted as yyyymm' }, 400);
    }
    const payments = await data.finance.payments.listForMonth(c.get('auth').tenantId, month);
    return c.json({ month, payments });
  });

  app.get('/reports/summary', ...guarded('finance:read'), async (c) => {
    const month = c.req.query('month');
    if (!month || !/^\d{6}$/.test(month)) {
      return c.json({ error: 'month query parameter must be formatted as yyyymm' }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    const [payroll, expenses, payments] = await Promise.all([
      data.finance.payroll.get(tenantId, month),
      data.finance.expenses.listForMonth(tenantId, month),
      data.finance.payments.listForMonth(tenantId, month),
    ]);
    const summary = summarizeMonth({ month, payments, expenses, ...(payroll ? { payroll } : {}) });
    return c.json(summary);
  });

  app.get('/reports/monthly', ...guarded('finance:read'), async (c) => {
    const months = Math.min(Math.max(Number(c.req.query('months') ?? 6), 1), 24);
    const tenantId = c.get('auth').tenantId;
    const series: { month: string; income: number; expenses: number; payrollNet: number | null }[] = [];
    for (let i = months - 1; i >= 0; i -= 1) {
      const ref = new Date();
      ref.setUTCDate(1);
      ref.setUTCMonth(ref.getUTCMonth() - i);
      const month = ref.toISOString().slice(0, 7).replaceAll('-', '');
      const insights = await monthFinanceInsights(data, tenantId, month);
      series.push({
        month,
        income: insights.feesCollected,
        expenses: Math.round(insights.expenses.reduce((sum, e) => sum + e.amount, 0) * 100) / 100,
        payrollNet: insights.payroll?.totals.net ?? null,
      });
    }
    return c.json({ months: series });
  });

  /** Teacher quick attendance marking */
  app.post('/attendance/quick', ...guarded('attendance:write'), async (c) => {
    const parsed = attendanceMarkSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'validation_failed', issues: zodIssues(parsed.error) }, 400);
    }
    const tenantId = c.get('auth').tenantId;
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const existing = (await data.attendance.getForDay(tenantId, day)).find(
      (r) => r.learnerId === parsed.data.learnerId,
    );
    if (existing) {
      return c.json({ error: 'already_marked' }, 409);
    }
    await data.attendance.mark(tenantId, {
      day,
      learnerId: parsed.data.learnerId,
      present: parsed.data.present,
      markedBy: c.get('auth').userId,
      updatedAt: new Date().toISOString(),
    });
    return c.json({ marked: true });
  });

  /** Teacher dashboard — class roster, today's attendance and birthdays. */
  app.get('/reports/dashboard/teacher', ...guarded('reports:read'), async (c) => {
    const tenantId = c.get('auth').tenantId;
    const now = new Date().toISOString();
    const [learners, classes, attendance] = await Promise.all([
      data.learners.listAll(tenantId),
      data.classes.list(tenantId),
      data.attendance.getForDay(tenantId, now.slice(0, 10).replaceAll('-', '')),
    ]);
    const present = attendance.filter((r) => r.present).length;
    const marked = attendance.length;
    const rate = marked > 0 ? Math.round((present / marked) * 100) : 0;
    const birthdays = learners
      .filter((l) => l.dateOfBirth?.slice(5) === now.slice(5, 10))
      .map((l) => ({ name: `${l.firstName} ${l.lastName}`, class: l.classId ?? '' }));
    return c.json({ learners, attendance: { present, marked, rate }, birthdays, classes });
  });

  /** Director dashboard — fees, expenses, payroll and recent payments. */
  app.get('/reports/dashboard/director', ...guarded('finance:read'), async (c) => {
    const tenantId = c.get('auth').tenantId;
    const month = new Date().toISOString().slice(0, 7).replaceAll('-', '');
    const [insights, learners] = await Promise.all([
      monthFinanceInsights(data, tenantId, month),
      data.learners.listAll(tenantId),
    ]);
    const learnerNames = new Map(learners.map((l) => [l.learnerId, `${l.firstName} ${l.lastName}`]));
    const recent = [...insights.payments]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((p) => ({
        id: p.paymentId,
        date: p.createdAt.slice(0, 10),
        amount: p.amount,
        method: p.method ?? 'unspecified',
        learnerName: learnerNames.get(p.learnerId) ?? 'Unknown learner',
      }));
    return c.json({
      feesCollected: insights.feesCollected,
      byMethod: insights.byMethod,
      byCategory: insights.byCategory,
      recent,
      payrollNet: insights.payroll?.totals.net ?? null,
      payrollRun: insights.payroll !== undefined,
    });
  });

  // ---------- auth-context demo routes ----------
  app.use('/me', authMiddleware(verify));
  app.get('/me', (c) => c.json(c.get('auth')));

  return app;
}

export const app = createApp();
