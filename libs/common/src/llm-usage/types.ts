/**
 * LLM usage ログの型定義。
 *
 * `libs/common` はフレームワーク非依存・外部依存なしが原則のため、OpenAI SDK 等の
 * Provider 固有の型には依存しない。usage は素の数値オブジェクトとして扱う。
 *
 * @see Issue #3780 "reasoning.effort の用途別チューニング"（Step 1: 計測基盤）
 */

/**
 * LLM 呼び出し 1 回分のトークン使用量（Provider 非依存）。
 */
export interface LLMTokenUsage {
  /** 入力トークン数 */
  inputTokens?: number;
  /** キャッシュされた入力トークン数（prompt caching ヒット分） */
  cachedInputTokens?: number;
  /** 出力トークン数 */
  outputTokens?: number;
  /** reasoning に消費されたトークン数 */
  reasoningTokens?: number;
  /** 合計トークン数 */
  totalTokens?: number;
}

/**
 * usage ログ 1 行分の入力。
 */
export interface LLMUsageLogInput extends LLMTokenUsage {
  /** サービス識別子（例: 'livetalk'） */
  service: string;
  /** 用途識別子（例: 'conversation' / 'classify' / 'research'） */
  purpose: string;
  /** 実際に呼び出したモデル名 */
  model: string;
  /** 指定した reasoning.effort。未指定（＝API 既定）なら省略する */
  reasoningEffort?: string;
}
