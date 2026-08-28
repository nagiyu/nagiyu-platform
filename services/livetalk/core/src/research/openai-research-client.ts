import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ReasoningEffort } from 'openai/resources/shared';
import { z } from 'zod';
import {
  extractOpenAIResponsesUsage,
  logLLMUsage,
  resolveOpenAIResponsesOutcome,
} from '@nagiyu/common';
import type { CharacterDefinition } from '../characters/types.js';
import type { IResearchClient, ResearchResult } from './types.js';
import { withLLMRetry, withLLMTimeout } from '../lib/llm-retry.js';
import { LLM_MODELS, LLM_REASONING_EFFORT } from '../llm-client/models.js';
import { buildResearchPrompt } from './research.prompt.js';

const RESEARCH_MODEL = LLM_MODELS.research;
/**
 * リサーチ用の既定 reasoning.effort。値は {@link LLM_REASONING_EFFORT.research} から導出する。
 *
 * @see Issue #3780 "reasoning.effort の用途別チューニング"（Step 2: 実測にもとづく effort 設定）
 */
const RESEARCH_REASONING_EFFORT: ReasoningEffort = LLM_REASONING_EFFORT.research;
const REQUEST_TIMEOUT_MS = 120_000;
const LLM_USAGE_SERVICE = 'livetalk';
const LLM_USAGE_PURPOSE = 'research';

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
  /** reasoning.effort の上書き。指定が無ければ {@link RESEARCH_REASONING_EFFORT} を使用 */
  effort?: ReasoningEffort;
}

export class OpenAIResearchClient implements IResearchClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly effort: ReasoningEffort;

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
    this.effort = options.effort ?? RESEARCH_REASONING_EFFORT;
  }

  public async research(query: string, character: CharacterDefinition): Promise<ResearchResult> {
    const response = await withLLMRetry(() =>
      withLLMTimeout(
        this.client.responses.parse({
          model: this.model,
          stream: false,
          reasoning: { effort: this.effort },
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

    logLLMUsage({
      service: LLM_USAGE_SERVICE,
      purpose: LLM_USAGE_PURPOSE,
      model: this.model,
      reasoningEffort: this.effort ?? undefined,
      outcome: resolveOpenAIResponsesOutcome(response.status),
      ...extractOpenAIResponsesUsage(response.usage),
    });

    if (!response.output_parsed) {
      throw new Error(RESEARCH_ERROR_MESSAGES.INVALID_RESPONSE);
    }

    return response.output_parsed;
  }
}
