/**
 * 旧知識資材（Memory / Knowledge / InterestCategory）→ 新 Topic モデルへの
 * 一回性マイグレーション専用の型定義（throwaway コード）。
 *
 * 移行完了・Issue クローズ後は本ディレクトリ（`migration/`）ごと削除してよい。
 *
 * 旧スキーマの DynamoDB attribute はすべて PascalCase（プラットフォーム共通ルール）。
 * Tier / Confidence（Memory）は新モデルへ引き継がないため保持しない
 * （`consolidate` の B厳格化が Memory→SELF の汚染を吸収するため、Tier/Confidence を
 * 使ったフィルタは新規に実装しない）。
 *
 * DynamoDB SK:
 * - Memory: `CHAR#<c>#MEM#<Tier>#<Category>#<ulid>`
 * - Knowledge: `CHAR#<c>#KNOWLEDGE#<ulid>`
 * - InterestCategory: `CHAR#<c>#INTEREST#<Category>`
 */

/** 旧 Memory（擬似ユーザーメッセージの元データ）。 */
export interface LegacyMemoryEntity {
  /** ユーザーの発話・記憶内容 */
  Content: string;
  /** カテゴリ（care シード時の Category フォールバック一致に使用） */
  Category: string;
  /** 埋め込みベクトル（care シード時の Topic 割り当てに再利用） */
  Embedding: number[];
  /** 参照回数（care シードの重みに正規化して使用） */
  ReferencedCount: number;
}

/** 旧 Knowledge（擬似 Web 生データの元データ）。 */
export interface LegacyKnowledgeEntity {
  /** 検索クエリ相当（擬似 webraw の Query に写像） */
  Topic: string;
  /** 要約（擬似 webraw の RawText の主要素） */
  Summary: string;
  /** 参照元 URL 一覧 */
  SourceUrls: string[];
  /** 生コメント（Summary に併記する補足） */
  RawComment: string;
  /** 関連カテゴリ（本移行では未使用。将来の参照用に保持） */
  RelatedCategory: string;
}

/** 旧 InterestCategory（care シードの重み信号）。 */
export interface LegacyInterestCategoryEntity {
  /** カテゴリ（care シード時の Category フォールバック一致に使用） */
  Category: string;
  /** 重み（care シードの重みに正規化して使用） */
  Weight: number;
  /** 埋め込みベクトル（care シード時の Topic 割り当てに再利用） */
  Embedding: number[];
}

/** `readLegacyData` の返り値。旧 Note・旧 MemorySummary は破棄のため含まない。 */
export interface LegacyReadResult {
  memories: LegacyMemoryEntity[];
  knowledge: LegacyKnowledgeEntity[];
  interests: LegacyInterestCategoryEntity[];
}
