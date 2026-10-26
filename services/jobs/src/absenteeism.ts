import type { AttendanceRecord, Guardian, Learner, SchoolClass } from '@dzidzo/core';
import { TENANTS_PARTITION } from '@dzidzo/core';
import type { ScheduledHandler } from 'aws-lambda';
import type { DbConfig } from '@dzidzo/api';
import {
  createDb,
  createDocumentClient,
  SingleTableRepository,
} from '@dzidzo/api';
import { smsProviderFromEnv, type SmsProvider } from './sms';

export interface AbsenteeismDeps {
  listTenants(): Promise<string[]>;
  listClasses(tenantId: string): Promise<SchoolClass[]>;
  rosterForClass(tenantId: string, classId: string): Promise<Learner[]>;
  attendanceForDay(tenantId: string, day: string): Promise<AttendanceRecord[]>;
  guardiansForLearner(tenantId: string, learnerId: string): Promise<Guardian[]>;
  sms: SmsProvider;
}

export interface TenantSummary {
  tenantId: string;
  absentees: number;
  messages: number;
  skippedClasses: number;
}

export interface AbsenteeismSummary {
  day: string;
  tenants: TenantSummary[];
  totalMessages: number;
}

/**
 * Daily absenteeism alerts.
 *
 * Policy: only learners explicitly marked ABSENT trigger an SMS — an
 * unmarked register is treated as "not taken yet", not as absence, so a
 * teacher running late never spams parents.
 */
export async function runAbsenteeism(args: {
  day: string;
  deps: AbsenteeismDeps;
}): Promise<AbsenteeismSummary> {
  const { day, deps } = args;
  const tenantIds = await deps.listTenants();
  const tenants: TenantSummary[] = [];
  let totalMessages = 0;

  for (const tenantId of tenantIds) {
    const classes = await deps.listClasses(tenantId);
    const attendance = await deps.attendanceForDay(tenantId, day);
    const absentIds = new Set(
      attendance.filter((record) => record.present === false).map((record) => record.learnerId),
    );

    let absentees = 0;
    let messages = 0;
    let skippedClasses = 0;

    for (const schoolClass of classes) {
      const roster = await deps.rosterForClass(tenantId, schoolClass.classId);
      if (roster.length === 0) {
        skippedClasses += 1;
        continue;
      }
      for (const learner of roster) {
        if (!absentIds.has(learner.learnerId)) {
          continue;
        }
        absentees += 1;
        const guardians = await deps.guardiansForLearner(tenantId, learner.learnerId);
        for (const guardian of guardians) {
          await deps.sms.send(
            guardian.phone,
            `Dzidzo: ${learner.firstName} was marked absent at school today (${day}). Please contact the school if this is unexpected.`,
          );
          messages += 1;
        }
      }
    }

    tenants.push({ tenantId, absentees, messages, skippedClasses });
    totalMessages += messages;
  }

  return { day, tenants, totalMessages };
}

/** Registry-partition readers — tenants self-register when their first class is created. */
export function absenteeismDepsFrom(dbConfig: DbConfig, sms: SmsProvider): AbsenteeismDeps {
  const repo = new SingleTableRepository(createDocumentClient(dbConfig), dbConfig.tableName);
  const db = createDb(dbConfig);
  return {
    async listTenants() {
      const items = await repo.query(TENANTS_PARTITION);
      return items
        .map((item) => String(item.sk))
        .filter((sk) => sk.startsWith('META#TENANT#'))
        .map((sk) => sk.slice('META#TENANT#'.length));
    },
    listClasses: (tenantId) => db.classes.list(tenantId),
    rosterForClass: (tenantId, classId) => db.learners.listByClass(tenantId, classId),
    attendanceForDay: (tenantId, day) => db.attendance.getForDay(tenantId, day),
    guardiansForLearner: (tenantId, learnerId) => db.guardians.listByLearner(tenantId, learnerId),
    sms,
  };
}

function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

/**
 * Lambda entry for the EventBridge daily schedule. Runs for today's UTC day
 * (07:00 SAST) unless DAY is pinned — useful for manual replays.
 */
export const handler: ScheduledHandler = async () => {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('TABLE_NAME is required');
  }
  const dbConfig = { region: process.env.AWS_REGION ?? 'us-east-1', tableName };
  const deps = absenteeismDepsFrom(dbConfig, smsProviderFromEnv());
  const summary = await runAbsenteeism({ day: process.env.DAY ?? todayUtcYmd(), deps });
  console.log(JSON.stringify({ event: 'absenteeism_summary', summary }));
};
