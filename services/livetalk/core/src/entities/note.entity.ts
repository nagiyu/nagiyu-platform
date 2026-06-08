/**
 * キャラがユーザーへ「プレゼント」として渡すノート。
 *
 * Phase 5c（#3345）勉強バッチのノート生成ステップが、KNOWLEDGE のうち
 * 高品質なものを昇格して書き込む。一覧 + 詳細閲覧のみ（編集なし）。
 * DynamoDB SK: `CHAR#<charId>#NOTE#<ulid>`
 */
export interface NoteEntity {
  UserID: string;
  CharacterID: string;
  /** ULID（時系列ソート可能） */
  NoteID: string;
  /** ノートのタイトル */
  Title: string;
  /** ノート本文 */
  Body: string;
  /** 昇格元の Knowledge ID 一覧 */
  RelatedKnowledgeIds: string[];
  /** 紐付く興味カテゴリ名 */
  RelatedCategory: string;
  CreatedAt: number;
  UpdatedAt: number;
  /**
   * 既読日時（Unix ms）。未読なら undefined。
   * Phase 5c では定義のみ（既読化 API は作らない）。Push 連携（#5d）で利用予定。
   */
  ReadAt?: number;
}

export interface NoteKey {
  userId: string;
  characterId: string;
  noteId: string;
}

export type CreateNoteInput = Omit<NoteEntity, 'CreatedAt' | 'UpdatedAt'>;
