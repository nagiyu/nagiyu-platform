import type { NoteEntity, TopicBundle } from '@nagiyu/livetalk-core';
import { encodeNoteId } from './note-id';
import type { NoteListItem } from './types';

/**
 * NoteEntity を一覧用 DTO（headline/webFacts/sources なし）に変換する。
 * Subject は贈った瞬間のスナップショットのため Topic 参照は不要（N+1 回避）。
 */
export function toNoteListItem(entity: NoteEntity): NoteListItem {
  return {
    id: encodeNoteId({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      noteId: entity.NoteID,
    }),
    subject: entity.Subject,
    sharedAt: entity.CreatedAt,
  };
}

/**
 * NoteEntity を詳細用 DTO に変換する。
 *
 * `headline` は贈った瞬間の不変記録（entity.Headline）をそのまま返す。
 * `webFacts`/`sources` は参照先 Topic の最新状態（`bundle`）から都度組み立てるため、
 * 中身は生きる（詳細を開くたびに最新の調べた内容・出典を反映する）。
 * `bundle` が null（Topic 取得失敗・Topic 削除済み等）でも headline のみ返す（fail-soft）。
 */
export function toNoteDetail(entity: NoteEntity, bundle: TopicBundle | null): NoteListItem {
  const item: NoteListItem = {
    ...toNoteListItem(entity),
    headline: entity.Headline,
  };

  if (!bundle) {
    return item;
  }

  item.webFacts = bundle.webFacts.map((fact) => fact.Text);
  item.sources = Array.from(new Set(bundle.webFacts.flatMap((fact) => fact.SourceUrls)));
  return item;
}

/**
 * 一覧を贈った瞬間（sharedAt）の新しい順で安定ソートする。
 */
export function sortNotes(items: NoteListItem[]): NoteListItem[] {
  return [...items].sort((a, b) => b.sharedAt - a.sharedAt);
}
