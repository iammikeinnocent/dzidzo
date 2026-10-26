import {
  ENTITY,
  materialKey,
  tenantPk,
  type StudyMaterial,
  type StudyMaterialCreateInput,
} from '@dzidzo/core';
import { DataIntegrityError, type SingleTableRepository, type TableItem } from './repository';

function materialToItem(material: StudyMaterial): TableItem {
  const key = materialKey(material.tenantId, material.materialId);
  const item: TableItem = {
    entityType: ENTITY.MATERIAL,
    pk: key.pk,
    sk: key.sk,
    tenantId: material.tenantId,
    materialId: material.materialId,
    title: material.title,
    fileKey: material.fileKey,
    authorId: material.authorId,
    createdAt: material.createdAt,
  };
  if (material.subject !== undefined) {
    item.subject = material.subject;
  }
  if (material.description !== undefined) {
    item.description = material.description;
  }
  return item;
}

function materialFromItem(item: TableItem): StudyMaterial {
  if (item.entityType !== ENTITY.MATERIAL) {
    throw new DataIntegrityError('item is not a study material');
  }
  const material: StudyMaterial = {
    tenantId: String(item.tenantId),
    materialId: String(item.materialId),
    title: String(item.title),
    fileKey: String(item.fileKey),
    authorId: String(item.authorId),
    createdAt: String(item.createdAt),
  };
  if (typeof item.subject === 'string' && item.subject !== '') {
    material.subject = item.subject;
  }
  if (typeof item.description === 'string' && item.description !== '') {
    material.description = item.description;
  }
  return material;
}

export class MaterialRepository {
  constructor(private readonly repo: SingleTableRepository) {}

  async create(
    tenantId: string,
    input: StudyMaterialCreateInput,
    authorId: string,
  ): Promise<StudyMaterial> {
    const material: StudyMaterial = {
      materialId: crypto.randomUUID(),
      tenantId,
      title: input.title,
      fileKey: input.fileKey,
      authorId,
      createdAt: new Date().toISOString(),
    };
    if (input.subject !== undefined) {
      material.subject = input.subject;
    }
    if (input.description !== undefined) {
      material.description = input.description;
    }
    await this.repo.put(materialToItem(material));
    return material;
  }

  /** Newest first — the whole school's library. */
  async list(tenantId: string): Promise<StudyMaterial[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: `${ENTITY.MATERIAL}#`,
    });
    return items
      .map(materialFromItem)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async remove(tenantId: string, materialId: string): Promise<void> {
    await this.repo.delete(materialKey(tenantId, materialId));
  }
}