/**
 * セーフティ機能の型定義（Phase 2d / Issue #3250）。
 */

/** 検出カテゴリ */
export type SafetyCategory =
  | 'suicidal_ideation' // 自殺念慮（死にたい、消えたい等）
  | 'self_harm' // 自傷行為（リスカ、自傷等）
  | 'hopelessness' // 希死念慮・絶望（生きる意味がない等）
  | 'crisis_method' // 自殺方法への言及（首を吊る、飛び降り等）
  | 'crisis_state'; // 危機的精神状態（もう終わりにしたい等）

/** セーフティイベントの発生源 */
export type SafetyTrigger = 'input_keyword' | 'output_moderation';

/** キーワード検出結果 */
export interface SafetyDetection {
  category: SafetyCategory;
  matchedText: string;
  patternDescription: string;
}

/** OpenAI Moderation API の結果 */
export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores?: Record<string, number>;
}

/** 日本の相談リソース 1 件 */
export interface SafetyResource {
  name: string;
  description: string;
  phone: string;
  url: string | null;
}

/** Moderation クライアントの抽象インターフェース */
export interface IModerationClient {
  check(text: string): Promise<ModerationResult>;
}
