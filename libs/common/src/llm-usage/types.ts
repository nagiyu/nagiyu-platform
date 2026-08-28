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
 * usage ログ 1 行の終了状態。
 *
 * ストリーミング（chatStream）・非ストリーミング（chatComplete 等）の両方の呼び出し経路で
 * 共通の語彙として使う。
 *
 * - `completed`: 正常完了（usage を取得できる）
 * - `incomplete`: `max_output_tokens` 到達等により打ち切られた（usage は取得できる。
 *   むしろ最もトークンを消費しているケースなので取りこぼしてはならない）
 * - `failed`: API 側のエラーで応答が失敗した（usage を取得できる場合がある）
 * - `aborted`: ストリーミングの消費側がループを `break` / `return` で中断し、
 *   上記いずれの終了イベントにも到達しなかった。真の usage は原理的に取得不可能なため、
 *   欠測したこと自体だけを記録する
 *
 * @see Issue #3780 "reasoning.effort の用途別チューニング"（Step 1 改修: 取りこぼし対策）
 */
export type LLMUsageOutcome = 'completed' | 'incomplete' | 'failed' | 'aborted';

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
  /** 呼び出しの終了状態。{@link LLMUsageOutcome} 参照。未指定なら省略する */
  outcome?: LLMUsageOutcome;
}
