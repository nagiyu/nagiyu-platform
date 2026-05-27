/**
 * LLM クライアント抽象化レイヤーの型定義。
 *
 * Phase 2b 時点では実装は OpenAI のみだが、Provider 切替を前提にした抽象 API を
 * 揃えることで Phase 2c 以降の利用コードが Provider 実装に縛られないようにしておく。
 *
 * @see tasks/livetalk/design.md §4.4
 * @see Issue #3248
 */

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
 *
 * ネットワークエラー・rate limit 等は Error として throw される（Provider のエラーをそのまま伝播）。
 * リトライは呼び出し側の責務。
 */
export interface ILLMClient {
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;
  chatComplete(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}

/**
 * 用途別モデルマップ。Provider 実装側で既定値を持ち、コンストラクタで上書き可能。
 */
export type PurposeModelMap = Record<ChatPurpose, string>;

/**
 * Embedding クライアントの抽象インターフェース。
 *
 * テキストを数値ベクトルに変換する。retrieval などの類似度計算に使う。
 */
export interface IEmbeddingClient {
  embed(text: string): Promise<number[]>;
}
