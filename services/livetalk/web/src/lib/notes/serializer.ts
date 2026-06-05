import type { NoteEntity } from '@nagiyu/livetalk-core';
import { encodeNoteId } from './note-id';
import type { NoteListItem } from './types';

/**
 * NoteEntity を一覧用 DTO（本文なし）に変換する。
 */
export function toNoteListItem(entity: NoteEntity): NoteListItem {
  return {
    id: encodeNoteId({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      noteId: entity.NoteID,
    }),
    title: entity.Title,
    relatedCategory: entity.RelatedCategory,
    createdAt: entity.CreatedAt,
    readAt: entity.ReadAt,
  };
}

/**
 * NoteEntity を詳細用 DTO（本文あり）に変換する。
 */
export function toNoteDetail(entity: NoteEntity): NoteListItem {
  return {
    ...toNoteListItem(entity),
    body: entity.Body,
  };
}

/**
 * 一覧を作成日時の新しい順で安定ソートする。
 */
export function sortNotes(items: NoteListItem[]): NoteListItem[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt);
}
