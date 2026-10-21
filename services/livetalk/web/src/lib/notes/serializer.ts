import type { NoteEntity, TopicBundle } from '@nagiyu/livetalk-core';
import { encodeNoteId } from './note-id';
import type { NoteListItem } from './types';

/**
 * NoteEntity を一覧用 DTO（headline/webFacts/sources なし）に変換する。
 * subject は贈った瞬間のスナップショットのため Topic 参照は不要（N+1 回避）。
 */
export function toNoteListItem(entity: NoteEntity): NoteListItem {
  return {
    id: encodeNoteId({
      userId: entity.userId,
      characterId: entity.characterId,
      noteId: entity.noteId,
    }),
    subject: entity.subject,
    sharedAt: entity.createdAt,
  };
}

/**
 * NoteEntity を詳細用 DTO に変換する。
 *
 * `headline` は贈った瞬間の不変記録（entity.headline）をそのまま返す。
 * `webFacts`/`sources` は参照先 Topic の最新状態（`bundle`）から都度組み立てるため、
 * 中身は生きる（詳細を開くたびに最新の調べた内容・出典を反映する）。
 * `bundle` が null（Topic 取得失敗・Topic 削除済み等）でも headline のみ返す（fail-soft）。
 */
export function toNoteDetail(entity: NoteEntity, bundle: TopicBundle | null): NoteListItem {
  const item: NoteListItem = {
    ...toNoteListItem(entity),
    headline: entity.headline,
  };

  if (!bundle) {
    return item;
  }

  item.webFacts = bundle.webFacts.map((fact) => fact.text);
  // 出典はリンク化するため、http(s) スキームのみ許可する（`javascript:` 等を弾く）。
  // SourceUrls はリサーチ結果由来でユーザー入力ではないが、詳細画面で href に渡すため念のため防御する。
  item.sources = Array.from(new Set(bundle.webFacts.flatMap((fact) => fact.sourceUrls))).filter(
    (url) => /^https?:\/\//i.test(url)
  );
  return item;
}

/**
 * 一覧を贈った瞬間（sharedAt）の新しい順で安定ソートする。
 */
export function sortNotes(items: NoteListItem[]): NoteListItem[] {
  return [...items].sort((a, b) => b.sharedAt - a.sharedAt);
}
