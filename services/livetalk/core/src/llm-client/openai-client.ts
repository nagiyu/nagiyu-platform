import OpenAI from 'openai';
import type {
  EasyInputMessage,
  Response,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import type { Stream } from 'openai/streaming';
import type {
  ChatMessage,
  ChatOptions,
  IEmbeddingClient,
  ILLMClient,
  MemoryCandidate,
  PurposeModelMap,
  SummarizeInput,
  SummarizeResult,
} from './types.js';

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

  public async summarize(input: SummarizeInput): Promise<SummarizeResult> {
    const { existingSummary, newMessages, characterName } = input;

    const existingSection = existingSummary
      ? `既存の要約：\n${existingSummary}`
      : '既存の要約：なし';

    const messagesSection = newMessages
      .map((m) => `${m.role === 'user' ? 'ユーザー' : characterName}: ${m.text}`)
      .join('\n');

    const prompt = `以下は ${characterName} とユーザーとの会話です。

${existingSection}

新しい会話：
${messagesSection}

以下の JSON を返してください（余分なテキストなし）：
{
  "mergedSummary": "既存と新規をマージした最新要約（日本語）",
  "newMemoryCandidates": [
    { "category": "カテゴリ名", "content": "記憶の内容（日本語）" }
  ],
  "interestCategories": [
    { "category": "ユーザーが興味を示したカテゴリ（日本語、例: アニメ・コーヒー）", "weight": 1 }
  ],
  "bidirectionalityScore": 0.0
}

bidirectionalityScore の算出方法：
- ユーザーが ${characterName} の発話に対して反応・深掘り・質問返しをした割合を 0.0〜1.0 で示す
- キャラ発信の話題にユーザーが乗った場合、キャラへの質問を返した場合は高く（0.7〜1.0）
- ユーザーが一方的に話し続けた場合や短い返答のみの場合は低く（0.0〜0.3）
- 会話が存在する場合のみ算出し、新しい会話が空の場合は 0.0 とする`;

    const rawText = await this.chatComplete([{ role: 'user', content: prompt }], {
      purpose: 'summarize',
    });

    return parseSummarizeResult(rawText);
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

export function parseSummarizeResult(rawText: string): SummarizeResult {
  let json: Record<string, unknown>;
  try {
    // LLM が ```json ... ``` で囲む場合を考慮して、コードブロックを除去する
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    json = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return { mergedSummary: rawText.trim(), newMemoryCandidates: [] };
  }

  const mergedSummary = typeof json.mergedSummary === 'string' ? json.mergedSummary : '';

  const candidates = Array.isArray(json.newMemoryCandidates) ? json.newMemoryCandidates : [];
  const newMemoryCandidates: MemoryCandidate[] = candidates
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({
      category: typeof c.category === 'string' ? c.category : 'general',
      content: typeof c.content === 'string' ? c.content : '',
    }))
    .filter((c) => c.content.length > 0);

  const rawCategories = Array.isArray(json.interestCategories) ? json.interestCategories : [];
  const interestCategories = rawCategories
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({
      category: typeof c.category === 'string' ? c.category : '',
      weight: typeof c.weight === 'number' && c.weight > 0 ? c.weight : 1,
    }))
    .filter((c) => c.category.length > 0);

  const bidirectionalityScore =
    typeof json.bidirectionalityScore === 'number'
      ? Math.min(1, Math.max(0, json.bidirectionalityScore))
      : undefined;

  return {
    mergedSummary,
    newMemoryCandidates,
    interestCategories: interestCategories.length > 0 ? interestCategories : undefined,
    bidirectionalityScore,
  };
}

/** OpenAI embedding API で使用するモデル。軽量・高速・低コスト。 */
export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

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
    const response = await this.client.embeddings.create({
      model: this.model,
      input: trimmed,
    });
    return response.data[0].embedding;
  }
}
