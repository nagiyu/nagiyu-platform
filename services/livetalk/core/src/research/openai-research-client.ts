import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { CharacterDefinition } from '../characters/types.js';
import type { IResearchClient, ResearchResult } from './types.js';
import { withLLMRetry, withLLMTimeout } from '../lib/llm-retry.js';
import { LLM_MODELS } from '../llm-client/models.js';
import { buildResearchPrompt } from './research.prompt.js';

const RESEARCH_MODEL = LLM_MODELS.research;
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
    const response = await withLLMRetry(() =>
      withLLMTimeout(
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
                  text: buildResearchPrompt(query, character),
                },
              ],
            },
          ],
        }),
        REQUEST_TIMEOUT_MS,
        RESEARCH_ERROR_MESSAGES.TIMEOUT
      )
    );

    if (!response.output_parsed) {
      throw new Error(RESEARCH_ERROR_MESSAGES.INVALID_RESPONSE);
    }

    return response.output_parsed;
  }
}
