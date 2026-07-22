import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type {
  EasyInputMessage,
  Response,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import type { Stream } from 'openai/streaming';
import { z } from 'zod';
import type {
  ChatMessage,
  ChatOptions,
  IEmbeddingClient,
  ILLMClient,
  PurposeModelMap,
} from './types.js';
import { withLLMRetry } from '../lib/llm-retry.js';
import { LLM_MODELS } from './models.js';

/**
 * OpenAI 実装の用途別既定モデル（GPT-5 系）。
 *
 * モデル名は {@link LLM_MODELS} から導出し、ここで重複定義しない。
 *
 * - conversation: `gpt-5`（会話の応答品質を優先）
 * - summarize / classify: `gpt-5-mini`（コスト最適化、stock-tracker / quick-clip と同じ選択）
 *
 * @see Issue #3248 "用途別モデル振り分けの仕組み"
 * @see Issue #3530 "LLM プロンプト・モデル定数の一元化リファクタ"
 */
export const OPENAI_DEFAULT_MODELS: PurposeModelMap = {
  conversation: LLM_MODELS.conversation,
  summarize: LLM_MODELS.summarize,
  classify: LLM_MODELS.classify,
};

export const OPENAI_ERROR_MESSAGES = {
  EMPTY_MESSAGES: 'メッセージが空です',
  EMPTY_API_KEY: 'OpenAI API キーが指定されていません',
  REFUSAL: 'LLM が応答を拒否しました（refusal）',
} as const;

export interface OpenAIClientOptions {
  /** OpenAI API キー。`client` を渡す場合は不要 */
  apiKey?: string;
  /** 用途別モデルの上書き。指定が無いキーは {@link OPENAI_DEFAULT_MODELS} を使用 */
  models?: Partial<PurposeModelMap>;
  /** テスト・差し替え用に既存の OpenAI クライアントを注入できる */
  client?: OpenAI;
}

/**
 * OpenAI Responses API を {@link ILLMClient} 形にラップする実装。
 *
 * Responses API（`client.responses.create`）を使うのは stock-tracker / quick-clip と同じ
 * パターンに揃えるため。GPT-5 系の最新モデルはこちら推奨。
 *
 * - ストリーミング: `stream: true` で `response.output_text.delta` イベントから text delta を yield
 * - 一括: `response.output_text` をそのまま返す
 *
 * 非ストリーミング呼び出し（`chatComplete` / `chatStructured`）は `withLLMRetry` で一過性エラー
 * （rate limit, timeout 等）をリトライする。ストリーミング（`chatStream`）は出力重複防止のため
 * リトライ対象外とする。SDK 自動リトライは `maxRetries: 0` で無効化し、アプリ側で一元管理する。
 */
export class OpenAIClient implements ILLMClient {
  private readonly client: OpenAI;
  private readonly models: PurposeModelMap;

  constructor(options: OpenAIClientOptions = {}) {
    if (options.client) {
      this.client = options.client;
    } else {
      if (!options.apiKey) {
        throw new Error(OPENAI_ERROR_MESSAGES.EMPTY_API_KEY);
      }
      this.client = new OpenAI({ apiKey: options.apiKey, maxRetries: 0 });
    }
    this.models = { ...OPENAI_DEFAULT_MODELS, ...options.models };
  }

  public async *chatStream(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): AsyncIterable<string> {
    this.assertMessages(messages);
    const stream = (await this.client.responses.create({
      model: this.resolveModel(options),
      stream: true,
      input: messages.map(toEasyInputMessage),
      temperature: options.temperature,
      max_output_tokens: options.maxTokens,
    })) as Stream<ResponseStreamEvent>;

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta' && event.delta.length > 0) {
        yield event.delta;
      }
    }
  }

  public async chatComplete(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    this.assertMessages(messages);
    const response = (await withLLMRetry(() =>
      this.client.responses.create({
        model: this.resolveModel(options),
        stream: false,
        input: messages.map(toEasyInputMessage),
        temperature: options.temperature,
        max_output_tokens: options.maxTokens,
      })
    )) as Response;
    return response.output_text ?? '';
  }

  public async chatStructured<T extends z.ZodType>(
    messages: ChatMessage[],
    schema: T,
    options: ChatOptions = {}
  ): Promise<z.infer<T>> {
    this.assertMessages(messages);
    const response = await withLLMRetry(() =>
      this.client.responses.parse({
        model: this.resolveModel(options),
        stream: false,
        input: messages.map(toEasyInputMessage),
        temperature: options.temperature,
        max_output_tokens: options.maxTokens,
        text: { format: zodTextFormat(schema, 'structured_output') },
      })
    );

    if (response.output_parsed === null || response.output_parsed === undefined) {
      throw new Error(OPENAI_ERROR_MESSAGES.REFUSAL);
    }

    return response.output_parsed as z.infer<T>;
  }

  private assertMessages(messages: ChatMessage[]): void {
    if (messages.length === 0) {
      throw new Error(OPENAI_ERROR_MESSAGES.EMPTY_MESSAGES);
    }
  }

  private resolveModel(options: ChatOptions): string {
    if (options.model) {
      return options.model;
    }
    const purpose = options.purpose ?? 'conversation';
    return this.models[purpose];
  }
}

function toEasyInputMessage(msg: ChatMessage): EasyInputMessage {
  return { role: msg.role, content: msg.content, type: 'message' };
}

/** OpenAI embedding API で使用するモデル。{@link LLM_MODELS.embedding} から導出する。 */
export const OPENAI_EMBEDDING_MODEL = LLM_MODELS.embedding;

export const OPENAI_EMBEDDING_ERROR_MESSAGES = {
  EMPTY_API_KEY: 'OpenAI API キーが指定されていません',
  EMPTY_TEXT: 'テキストが空です',
} as const;

export interface OpenAIEmbeddingClientOptions {
  apiKey?: string;
  model?: string;
  client?: OpenAI;
}

/**
 * OpenAI Embeddings API を {@link IEmbeddingClient} 形にラップする実装。
 *
 * `text-embedding-3-small`（1536 次元）を既定として使用する。
 */
export class OpenAIEmbeddingClient implements IEmbeddingClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIEmbeddingClientOptions = {}) {
    if (options.client) {
      this.client = options.client;
    } else {
      if (!options.apiKey) {
        throw new Error(OPENAI_EMBEDDING_ERROR_MESSAGES.EMPTY_API_KEY);
      }
      this.client = new OpenAI({ apiKey: options.apiKey, maxRetries: 0 });
    }
    this.model = options.model ?? OPENAI_EMBEDDING_MODEL;
  }

  public async embed(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error(OPENAI_EMBEDDING_ERROR_MESSAGES.EMPTY_TEXT);
    }
    const response = await withLLMRetry(() =>
      this.client.embeddings.create({
        model: this.model,
        input: trimmed,
      })
    );
    return response.data[0].embedding;
  }
}
