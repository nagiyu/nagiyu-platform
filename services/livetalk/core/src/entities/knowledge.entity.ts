/**
 * キャラが Web リサーチで獲得した知識。
 *
 * Phase 5a（#3343）勉強バッチが書き込む。
 * DynamoDB SK: `CHAR#<charId>#KNOWLEDGE#<ulid>`
 */
export interface KnowledgeEntity {
  UserID: string;
  CharacterID: string;
  /** ULID（時系列ソート可能） */
  KnowledgeID: string;
  /** 検索トピック */
  Topic: string;
  /** キャラ目線の要約 */
  Summary: string;
  /** 参照した URL 一覧 */
  SourceUrls: string[];
  /** キャラのコメント（短い一言） */
  RawComment: string;
  /** 紐付く興味カテゴリ名 */
  RelatedCategory: string;
  CreatedAt: number;
  UpdatedAt: number;
  /** 任意 TTL（Unix 秒）。未設定なら永続 */
  Ttl?: number;
}

export interface KnowledgeKey {
  userId: string;
  characterId: string;
  knowledgeId: string;
}

export type CreateKnowledgeInput = Omit<KnowledgeEntity, 'CreatedAt' | 'UpdatedAt'>;
