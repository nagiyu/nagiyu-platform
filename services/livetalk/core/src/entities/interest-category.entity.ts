/**
 * ユーザーの興味カテゴリ。
 *
 * 日次圧縮要約バッチが会話から動的抽出し、重み（言及頻度）を累積する。
 * Phase 5 の Web リサーチがこのデータを参照する。
 *
 * DynamoDB SK: `CHAR#<charId>#INTEREST#<category>`
 */
export interface InterestCategoryEntity {
  UserID: string;
  CharacterID: string;
  /** カテゴリ名（例: "アニメ", "コーヒー"） */
  Category: string;
  /** 累積重み（言及頻度ベース）。バッチ実行ごとに加算される */
  Weight: number;
  CreatedAt: number;
  UpdatedAt: number;
}

export interface InterestCategoryKey {
  userId: string;
  characterId: string;
  category: string;
}

export type CreateInterestCategoryInput = Omit<InterestCategoryEntity, 'CreatedAt' | 'UpdatedAt'>;
