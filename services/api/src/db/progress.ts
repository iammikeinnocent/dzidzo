import {
  certificateKey,
  curriculumKey,
  ENTITY,
  learnerAssessmentKey,
  learnerRecordPrefix,
  tenantPk,
  type CurriculumItem,
  type LearnerCertificate,
  type LearnerCertificateCreateInput,
  type LearnerReport,
  type LearnerReportCreateInput,
} from '@dzidzo/core';
import { DataIntegrityError, type SingleTableRepository, type TableItem } from './repository';

function reportToItem(report: LearnerReport): TableItem {
  const key = learnerAssessmentKey(report.tenantId, report.learnerId, report.reportId);
  const item: TableItem = {
    entityType: ENTITY.ASSESSMENT,
    pk: key.pk,
    sk: key.sk,
    tenantId: report.tenantId,
    reportId: report.reportId,
    learnerId: report.learnerId,
    subject: report.subject,
    term: report.term,
    grade: report.grade,
    authorId: report.authorId,
    createdAt: report.createdAt,
  };
  if (report.comment !== undefined) {
    item.comment = report.comment;
  }
  return item;
}

function reportFromItem(item: TableItem): LearnerReport {
  if (item.entityType !== ENTITY.ASSESSMENT) {
    throw new DataIntegrityError('item is not a learner report');
  }
  const report: LearnerReport = {
    tenantId: String(item.tenantId),
    reportId: String(item.reportId),
    learnerId: String(item.learnerId),
    subject: String(item.subject),
    term: String(item.term),
    grade: String(item.grade),
    authorId: String(item.authorId),
    createdAt: String(item.createdAt),
  };
  if (typeof item.comment === 'string' && item.comment !== '') {
    report.comment = item.comment;
  }
  return report;
}

function curriculumToItem(item2: CurriculumItem): TableItem {
  const key = curriculumKey(item2.tenantId, item2.learnerId, item2.itemId);
  const item: TableItem = {
    entityType: ENTITY.CURRICULUM,
    pk: key.pk,
    sk: key.sk,
    tenantId: item2.tenantId,
    itemId: item2.itemId,
    learnerId: item2.learnerId,
    subject: item2.subject,
    done: item2.done,
    createdAt: item2.createdAt,
  };
  if (item2.term !== undefined) {
    item.term = item2.term;
  }
  return item;
}

function curriculumFromItem(item: TableItem): CurriculumItem {
  if (item.entityType !== ENTITY.CURRICULUM) {
    throw new DataIntegrityError('item is not a curriculum entry');
  }
  const entry: CurriculumItem = {
    tenantId: String(item.tenantId),
    itemId: String(item.itemId),
    learnerId: String(item.learnerId),
    subject: String(item.subject),
    done: item.done === true,
    createdAt: String(item.createdAt),
  };
  if (typeof item.term === 'string' && item.term !== '') {
    entry.term = item.term;
  }
  return entry;
}

function certificateToItem(certificate: LearnerCertificate): TableItem {
  const key = certificateKey(certificate.tenantId, certificate.learnerId, certificate.certificateId);
  const item: TableItem = {
    entityType: ENTITY.CERTIFICATE,
    pk: key.pk,
    sk: key.sk,
    tenantId: certificate.tenantId,
    certificateId: certificate.certificateId,
    learnerId: certificate.learnerId,
    title: certificate.title,
    createdAt: certificate.createdAt,
  };
  if (certificate.awardedAt !== undefined) {
    item.awardedAt = certificate.awardedAt;
  }
  if (certificate.fileKey !== undefined) {
    item.fileKey = certificate.fileKey;
  }
  return item;
}

function certificateFromItem(item: TableItem): LearnerCertificate {
  if (item.entityType !== ENTITY.CERTIFICATE) {
    throw new DataIntegrityError('item is not a certificate');
  }
  const certificate: LearnerCertificate = {
    tenantId: String(item.tenantId),
    certificateId: String(item.certificateId),
    learnerId: String(item.learnerId),
    title: String(item.title),
    createdAt: String(item.createdAt),
  };
  if (typeof item.awardedAt === 'string' && item.awardedAt !== '') {
    certificate.awardedAt = item.awardedAt;
  }
  if (typeof item.fileKey === 'string' && item.fileKey !== '') {
    certificate.fileKey = item.fileKey;
  }
  return certificate;
}

/** Reports (assessments), curriculum items and certificates for one learner. */
export class ProgressRepository {
  constructor(private readonly repo: SingleTableRepository) {}

  async createReport(
    tenantId: string,
    learnerId: string,
    input: LearnerReportCreateInput,
    authorId: string,
  ): Promise<LearnerReport> {
    const report: LearnerReport = {
      reportId: crypto.randomUUID(),
      tenantId,
      learnerId,
      subject: input.subject,
      term: input.term,
      grade: input.grade,
      authorId,
      createdAt: new Date().toISOString(),
    };
    if (input.comment !== undefined) {
      report.comment = input.comment;
    }
    await this.repo.put(reportToItem(report));
    return report;
  }

  async listReports(tenantId: string, learnerId: string): Promise<LearnerReport[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: learnerRecordPrefix(ENTITY.ASSESSMENT, learnerId),
    });
    return items
      .map(reportFromItem)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addCurriculumItem(
    tenantId: string,
    learnerId: string,
    input: { subject: string; term?: string; done: boolean },
  ): Promise<CurriculumItem> {
    const entry: CurriculumItem = {
      itemId: crypto.randomUUID(),
      tenantId,
      learnerId,
      subject: input.subject,
      done: input.done,
      createdAt: new Date().toISOString(),
    };
    if (input.term !== undefined) {
      entry.term = input.term;
    }
    await this.repo.put(curriculumToItem(entry));
    return entry;
  }

  async listCurriculum(tenantId: string, learnerId: string): Promise<CurriculumItem[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: learnerRecordPrefix(ENTITY.CURRICULUM, learnerId),
    });
    return items
      .map(curriculumFromItem)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createCertificate(
    tenantId: string,
    learnerId: string,
    input: LearnerCertificateCreateInput,
  ): Promise<LearnerCertificate> {
    const certificate: LearnerCertificate = {
      certificateId: crypto.randomUUID(),
      tenantId,
      learnerId,
      title: input.title,
      createdAt: new Date().toISOString(),
    };
    if (input.awardedAt !== undefined) {
      certificate.awardedAt = input.awardedAt;
    }
    if (input.fileKey !== undefined) {
      certificate.fileKey = input.fileKey;
    }
    await this.repo.put(certificateToItem(certificate));
    return certificate;
  }

  async listCertificates(tenantId: string, learnerId: string): Promise<LearnerCertificate[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: learnerRecordPrefix(ENTITY.CERTIFICATE, learnerId),
    });
    return items
      .map(certificateFromItem)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}