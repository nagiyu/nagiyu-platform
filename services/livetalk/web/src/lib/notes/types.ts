/**
 * ノート UI / API で受け渡しする Note の DTO。
 *
 * DynamoDB の SK（`CHAR#<char>#NOTE#<ulid>`）は URL に乗せにくいため、
 * `id` には base64url エンコードした完全 SK を入れる（`lib/notes/note-id.ts` 参照）。
 */
export interface NoteListItem {
  /** base64url エンコードした完全 SK。API パスの `:id` に使う */
  id: string;
  title: string;
  /** 一覧では undefined、詳細でのみ本文を含む */
  body?: string;
  relatedCategory: string;
  createdAt: number;
  /** 既読日時（Unix ms、未読なら undefined） */
  readAt?: number;
}
