import type { NoteEntity } from '@nagiyu/livetalk-core';
import { sortNotes, toNoteDetail, toNoteListItem } from '@/lib/notes/serializer';
import { decodeNoteId } from '@/lib/notes/note-id';

const baseEntity: NoteEntity = {
  UserID: 'user-1',
  CharacterID: 'hiyori',
  NoteID: 'note-001',
  Title: 'コーヒーの効能',
  Body: '本文。\n\nコメント。',
  RelatedKnowledgeIds: ['know-001'],
  RelatedCategory: 'コーヒー',
  CreatedAt: 1_750_000_000_000,
  UpdatedAt: 1_750_000_000_000,
};

describe('toNoteListItem', () => {
  it('一覧 DTO に変換し本文を含めない', () => {
    const item = toNoteListItem(baseEntity);
    expect(item.title).toBe('コーヒーの効能');
    expect(item.relatedCategory).toBe('コーヒー');
    expect(item.createdAt).toBe(1_750_000_000_000);
    expect(item.body).toBeUndefined();
    // id は decode で復元できる
    expect(decodeNoteId(item.id, 'user-1')?.noteId).toBe('note-001');
  });

  it('ReadAt を readAt に写す', () => {
    const item = toNoteListItem({ ...baseEntity, ReadAt: 1_750_100_000_000 });
    expect(item.readAt).toBe(1_750_100_000_000);
  });
});

describe('toNoteDetail', () => {
  it('詳細 DTO は本文を含む', () => {
    const item = toNoteDetail(baseEntity);
    expect(item.body).toBe('本文。\n\nコメント。');
    expect(item.title).toBe('コーヒーの効能');
  });
});

describe('sortNotes', () => {
  it('createdAt 降順に並べ替える', () => {
    const a = { ...toNoteListItem(baseEntity), createdAt: 100 };
    const b = { ...toNoteListItem(baseEntity), createdAt: 300 };
    const c = { ...toNoteListItem(baseEntity), createdAt: 200 };
    const sorted = sortNotes([a, b, c]);
    expect(sorted.map((n) => n.createdAt)).toEqual([300, 200, 100]);
  });
});
