/**
 * キャラがユーザーへ「プレゼント」として渡すノート
 * （リブトーク知識・記憶再設計 P4「ノート（ギフト化）」）。
 *
 * 旧 Note（Knowledge 由来の Title/Body、勉強バッチが KNOWLEDGE を昇格する方式）を廃止し、
 * Topic を参照する ShareLog に置き換える。ノート生成は consolidate バッチの後段で
 * Topic から行い、SELF フック（なぜ調べたか）＋ WEB 中身を LLM で合成した手紙文
 * （Headline）を不変記録する。中身（出典・最新の調べた内容）は詳細画面で参照先 Topic の
 * 最新を反映する（贈った瞬間は不変・中身は生きる）。
 *
 * DynamoDB SK: `CHAR#<charId>#NOTE#<ulid>`
 */
export interface NoteEntity {
  UserID: string;
  CharacterID: string;
  /** ULID（時系列ソート可能） */
  NoteID: string;
  /** 参照する Topic の ID */
  TopicID: string;
  /**
   * 贈った瞬間の Topic subject スナップショット（一覧「△△を調べたよ」用）。
   * Topic が後で削除・改名されてもノート一覧の表示が壊れないようにするための複製。
   */
  Subject: string;
  /** SELF フック＋WEB を合成した不変の手紙文面 */
  Headline: string;
  /** 感想連携（任意・後から付与）。ユーザーの感想をキャラが憶えておくための保存先 */
  Reaction?: string;
  /** = 贈った瞬間（sharedAt）。不変・新着順ソート基準 */
  CreatedAt: number;
  UpdatedAt: number;
}

export interface NoteKey {
  userId: string;
  characterId: string;
  noteId: string;
}

/**
 * ノート作成入力。`CreatedAt`/`UpdatedAt` はリポジトリ側で付与する。
 * `Reaction` は生成時には付けない（感想連携で後から `updateReaction` により設定する）。
 */
export type CreateNoteInput = Omit<NoteEntity, 'CreatedAt' | 'UpdatedAt' | 'Reaction'>;
