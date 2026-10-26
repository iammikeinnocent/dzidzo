import {
  ENTITY,
  learnerRecordPrefix,
  noteKey,
  tenantPk,
  type LearnerNote,
  type LearnerNoteCreateInput,
} from '@dzidzo/core';
import { DataIntegrityError, type SingleTableRepository, type TableItem } from './repository';

function noteToItem(note: LearnerNote): TableItem {
  const key = noteKey(note.tenantId, note.learnerId, note.noteId);
  return {
    entityType: ENTITY.NOTE,
    pk: key.pk,
    sk: key.sk,
    tenantId: note.tenantId,
    noteId: note.noteId,
    learnerId: note.learnerId,
    text: note.text,
    authorId: note.authorId,
    createdAt: note.createdAt,
  };
}

function noteFromItem(item: TableItem): LearnerNote {
  if (item.entityType !== ENTITY.NOTE) {
    throw new DataIntegrityError('item is not a note');
  }
  return {
    tenantId: String(item.tenantId),
    noteId: String(item.noteId),
    learnerId: String(item.learnerId),
    text: String(item.text),
    authorId: String(item.authorId),
    createdAt: String(item.createdAt),
  };
}

export class NoteRepository {
  constructor(private readonly repo: SingleTableRepository) {}

  async create(
    tenantId: string,
    learnerId: string,
    input: LearnerNoteCreateInput,
    authorId: string,
  ): Promise<LearnerNote> {
    const note: LearnerNote = {
      noteId: crypto.randomUUID(),
      tenantId,
      learnerId,
      text: input.text,
      authorId,
      createdAt: new Date().toISOString(),
    };
    await this.repo.put(noteToItem(note));
    return note;
  }

  /** Newest first. */
  async listByLearner(tenantId: string, learnerId: string): Promise<LearnerNote[]> {
    const items = await this.repo.query(tenantPk(tenantId), {
      skBeginsWith: learnerRecordPrefix(ENTITY.NOTE, learnerId),
    });
    return items
      .map(noteFromItem)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async remove(tenantId: string, learnerId: string, noteId: string): Promise<void> {
    await this.repo.delete(noteKey(tenantId, learnerId, noteId));
  }
}
