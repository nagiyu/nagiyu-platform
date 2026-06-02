import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { withRetry } from '@nagiyu/common';
import type { CharacterDefinition } from '../characters/types.js';
import type { IResearchClient, ResearchResult } from './types.js';

const RESEARCH_MODEL = 'gpt-5-mini';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 120_000;

export const RESEARCH_ERROR_MESSAGES = {
  EMPTY_API_KEY: 'OpenAI API キーが指定されていません',
  INVALID_RESPONSE: 'Web リサーチの応答が不正です',
  TIMEOUT: 'OpenAI Web リサーチ API がタイムアウトしました',
} as const;

const researchResultSchema = z.object({
  topic: z.string(),
  summary: z.string(),
  sourceUrls: z.array(z.string()),
  rawComment: z.string(),
});

export interface OpenAIResearchClientOptions {
  apiKey?: string;
  client?: OpenAI;
  model?: string;
}

export class OpenAIResearchClient implements IResearchClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIResearchClientOptions = {}) {
    if (options.client) {
      this.client = options.client;
    } else {
      if (!options.apiKey) {
        throw new Error(RESEARCH_ERROR_MESSAGES.EMPTY_API_KEY);
      }
      this.client = new OpenAI({ apiKey: options.apiKey, maxRetries: 0 });
    }
    this.model = options.model ?? RESEARCH_MODEL;
  }

  public async research(query: string, character: CharacterDefinition): Promise<ResearchResult> {
    const response = await withRetry(
      async () =>
        withTimeout(
          this.client.responses.parse({
            model: this.model,
            stream: false,
            tools: [{ type: 'web_search' }],
            tool_choice: 'required',
            text: { format: zodTextFormat(researchResultSchema, 'livetalk_research') },
            input: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: buildPrompt(query, character),
                  },
                ],
              },
            ],
          }),
          REQUEST_TIMEOUT_MS
        ),
      { maxRetries: MAX_RETRIES }
    );

    if (!response.output_parsed) {
      throw new Error(RESEARCH_ERROR_MESSAGES.INVALID_RESPONSE);
    }

    return response.output_parsed;
  }
}

function buildPrompt(query: string, character: CharacterDefinition): string {
  const likes = character.personality.preferences.likes.join('、');
  return [
    `あなたは「${character.displayName}」です。`,
    `口調・性格：${character.personality.speechStyle}`,
    `好きなもの：${likes}`,
    '',
    `「${query}」について必ず Web 検索し、${character.displayName} らしい視点で内容を要約してください。`,
    '',
    '返す項目（JSON）:',
    '- topic: 検索したトピックの短い名詞句（5〜15 文字程度、例: 飲み物の新作、超かぐや姫）。説明文ではなく固有名詞や短い語句にすること',
    '- summary: キャラクター目線の要約（200 文字以上）。topic の詳細説明はここに書く',
    '- sourceUrls: 参照した URL のリスト（空の場合は空配列）',
    `- rawComment: ${character.displayName} として一言コメント（50〜100 文字、上記の口調で）`,
  ].join('\n');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(RESEARCH_ERROR_MESSAGES.TIMEOUT));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
