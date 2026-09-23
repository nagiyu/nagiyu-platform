/**
 * ノート UI / API で受け渡しする Note の DTO
 * （リブトーク知識・記憶再設計 P4「ノート（ギフト化）」）。
 *
 * DynamoDB の SK（`CHAR#<char>#NOTE#<ulid>`）は URL に乗せにくいため、
 * `id` には base64url エンコードした完全 SK を入れる（`lib/notes/note-id.ts` 参照）。
 *
 * `headline`/`webFacts`/`sources` は詳細取得時のみ含まれる。`webFacts`/`sources` は
 * 参照先 Topic の最新状態を都度反映する（贈った瞬間の `headline` は不変・中身は生きる）。
 */
export interface NoteListItem {
  /** base64url エンコードした完全 SK。API パスの `:id` に使う */
  id: string;
  /** 贈った瞬間の Topic subject スナップショット（一覧「△△を調べたよ」用） */
  subject: string;
  /** 贈った瞬間（Unix ms）。一覧の新着順ソート基準 */
  sharedAt: number;
  /** SELF フック＋WEB を合成した不変の手紙文面（詳細でのみ含む） */
  headline?: string;
  /** 参照先 Topic の最新 WEB fact 本文（詳細でのみ含む） */
  webFacts?: string[];
  /** 参照先 Topic の最新 WEB fact 出典 URL（dedup 済み、詳細でのみ含む） */
  sources?: string[];
}
