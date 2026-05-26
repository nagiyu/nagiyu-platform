import OpenAI from 'openai';
import type {
  EasyInputMessage,
  Response,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import type { Stream } from 'openai/streaming';
import type { ChatMessage, ChatOptions, ILLMClient, PurposeModelMap } from './types.js';

/**
 * OpenAI 実装の用途別既定モデル（GPT-5 系）。
 *
 * - conversation: `gpt-5`（会話の応答品質を優先）
 * - summarize / classify: `gpt-5-mini`（コスト最適化、stock-tracker / quick-clip と同じ選択）
 *
 * @see Issue #3248 "用途別モデル振り分けの仕組み"
 */
export const OPENAI_DEFAULT_MODELS: PurposeModelMap = {
  conversation: 'gpt-5',
  summarize: 'gpt-5-mini',
  classify: 'gpt-5-mini',
};

export const OPENAI_ERROR_MESSAGES = {
  EMPTY_MESSAGES: 'メッセージが空です',
  EMPTY_API_KEY: 'OpenAI API キーが指定されていません',
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
 * リトライは行わない（呼び出し側の責務）。`new OpenAI` 既定のリトライも `maxRetries: 0` で無効化する。
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
    const response = (await this.client.responses.create({
      model: this.resolveModel(options),
      stream: false,
      input: messages.map(toEasyInputMessage),
      temperature: options.temperature,
      max_output_tokens: options.maxTokens,
    })) as Response;
    return response.output_text ?? '';
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
