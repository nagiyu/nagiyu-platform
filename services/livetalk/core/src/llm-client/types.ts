/**
 * LLM クライアント抽象化レイヤーの型定義。
 *
 * Phase 2b 時点では実装は OpenAI のみだが、Provider 切替を前提にした抽象 API を
 * 揃えることで Phase 2c 以降の利用コードが Provider 実装に縛られないようにしておく。
 *
 * @see tasks/livetalk/design.md §4.4
 * @see Issue #3248
 * @see Issue #3316 (Structured Outputs 化)
 */

import type { z } from 'zod';

/**
 * チャットメッセージ 1 件。
 *
 * 抽象 API は OpenAI の messages 仕様に合わせており、`system` も messages 配列に含める。
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 用途。用途別モデル振り分けに使う。
 */
export type ChatPurpose = 'conversation' | 'summarize' | 'classify';

/**
 * チャット呼び出しオプション。
 *
 * `model` 明示指定が無い場合は `purpose`（既定 `conversation`）から
 * Provider ごとの既定モデルを引く。
 */
export interface ChatOptions {
  /** モデルを明示指定する場合。指定が無ければ `purpose` から導出する */
  model?: string;
  /** 用途。既定: `conversation`（会話）。要約・分類は安価なモデルへ振り分ける */
  purpose?: ChatPurpose;
  /** temperature。Provider 側の既定にそのまま投げる場合は省略 */
  temperature?: number;
  /** 上限トークン数。Provider 側の既定にそのまま投げる場合は省略 */
  maxTokens?: number;
}

/**
 * LLM クライアントの抽象インターフェース。
 *
 * - `chatStream`: ストリーミング応答。`AsyncIterable<string>` でテキスト delta を逐次返す
 * - `chatComplete`: 一括応答。完成したテキストを返す
 * - `summarize`: 会話圧縮要約。既存要約と新着メッセージをマージして新要約 + 記憶候補を返す
 *
 * ネットワークエラー・rate limit 等は Error として throw される（Provider のエラーをそのまま伝播）。
 * リトライは呼び出し側の責務。
 */
export interface ILLMClient {
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;
  chatComplete(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  /**
   * Structured Outputs によるスキーマ保証付き呼び出し。
   *
   * Provider が Structured Outputs をネイティブサポートする場合はデコーダレベルで保証し、
   * そうでない場合は `chatComplete` + JSON.parse にフォールバックしてよい。
   * refusal が発生した場合は Error を throw する。
   */
  chatStructured<T extends z.ZodType>(
    messages: ChatMessage[],
    schema: T,
    options?: ChatOptions
  ): Promise<z.infer<T>>;
  summarize(input: SummarizeInput): Promise<SummarizeResult>;
}

/**
 * 用途別モデルマップ。Provider 実装側で既定値を持ち、コンストラクタで上書き可能。
 */
export type PurposeModelMap = Record<ChatPurpose, string>;

/**
 * `ILLMClient.summarize` の入力。
 */
export interface SummarizeInput {
  existingSummary: string | undefined;
  newMessages: Array<{ role: 'user' | 'assistant'; text: string }>;
  characterName: string;
  /**
   * 既存の興味カテゴリ名一覧（Issue #3325 / #3326）。
   *
   * LLM に粒度ガイドと共に渡すことで、同義カテゴリの再表記揺れ・過剰な細分化を抑制する。
   * 未指定時は LLM 任せ（旧挙動）。
   */
  existingInterestCategories?: string[];
}

/**
 * 抽出された新規記憶候補（Tier C として保存される）。
 */
export interface MemoryCandidate {
  category: string;
  content: string;
}

/**
 * `ILLMClient.summarize` の出力。
 *
 * `interestCategories` と `bidirectionalityScore` は Phase 3f で追加した optional フィールド。
 * 後方互換のため省略可能。既存実装が返さない場合もある。
 */
export interface SummarizeResult {
  mergedSummary: string;
  newMemoryCandidates: MemoryCandidate[];
  /** 会話から抽出した興味カテゴリ一覧（Phase 3f）。未取得時は undefined */
  interestCategories?: Array<{ category: string; weight: number }>;
  /**
   * ユーザーがキャラの発話に反応・問い返した率（0〜1）（Phase 3f）。
   * 日次バッチで測定する双方向性スコア。未取得時は undefined。
   */
  bidirectionalityScore?: number;
}

/**
 * Embedding クライアントの抽象インターフェース。
 *
 * テキストを数値ベクトルに変換する。retrieval などの類似度計算に使う。
 */
export interface IEmbeddingClient {
  embed(text: string): Promise<number[]>;
}
