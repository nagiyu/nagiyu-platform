/**
 * メモリ Tier の定義。
 *
 * A: 確定（名前・誕生日等の明示確認済み）
 * B: 嗜好（反復言及・確認済み）
 * C: 観測（一度言及されただけ）
 * D: 一時（今の会話限り）
 */
export type Tier = 'A' | 'B' | 'C' | 'D';

export const TIERS: readonly Tier[] = ['A', 'B', 'C', 'D'] as const;

/**
 * ユーザー記憶を表すビジネスオブジェクト。
 *
 * DynamoDB 属性は PascalCase（プラットフォーム共通ルール）で統一する。
 * Embedding は Phase 3b で実値を投入するため、型フィールドのみ定義。
 */
export interface MemoryEntity {
  /** ユーザー識別子（Google ID） */
  UserID: string;
  /** キャラクター識別子（例: `hiyori`） */
  CharacterID: string;
  /** メモリ ID（ULID） */
  MemoryID: string;
  /** 記憶の階層 */
  Tier: Tier;
  /** カテゴリ（`name`, `food`, `hobby` 等） */
  Category: string;
  /** 記憶の本文 */
  Content: string;
  /** 信頼度スコア（0.0〜1.0） */
  Confidence: number;
  /** 参照回数 */
  ReferencedCount: number;
  /** 最終参照日時（Unix ms、未参照の場合は undefined） */
  LastReferencedAt?: number;
  /** 埋め込みベクトル（Phase 3b で実値投入、現フェーズでは undefined） */
  Embedding?: number[];
  /** 作成日時（Unix ms） */
  CreatedAt: number;
  /** 更新日時（Unix ms） */
  UpdatedAt: number;
}

/**
 * 単一メモリを取得する際のキー。
 */
export interface MemoryKey {
  userId: string;
  characterId: string;
  tier: Tier;
  category: string;
  memoryId: string;
}

/**
 * メモリ作成入力（`MemoryID` / `CreatedAt` / `UpdatedAt` はリポジトリ側で付与）。
 */
export type CreateMemoryInput = Omit<MemoryEntity, 'MemoryID' | 'CreatedAt' | 'UpdatedAt'> & {
  /** 明示的に ULID を指定したい場合のみ渡す（テスト用途） */
  MemoryID?: string;
};

/**
 * メモリ更新入力（Content / Confidence / ReferencedCount / LastReferencedAt / Embedding のみ更新可能）。
 */
export type UpdateMemoryInput = Pick<
  MemoryEntity,
  'UserID' | 'CharacterID' | 'MemoryID' | 'Tier' | 'Category'
> &
  Partial<
    Pick<
      MemoryEntity,
      'Content' | 'Confidence' | 'ReferencedCount' | 'LastReferencedAt' | 'Embedding'
    >
  >;
