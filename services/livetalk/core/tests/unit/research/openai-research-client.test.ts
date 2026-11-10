import OpenAI from 'openai';
import { logger } from '@nagiyu/common';
import {
  OpenAIResearchClient,
  RESEARCH_ERROR_MESSAGES,
} from '../../../src/research/openai-research-client.js';
import { WEB_SEARCH_USAGE_LOG_MESSAGE } from '../../../src/research/web-search-usage.js';
import { LLM_REASONING_EFFORT } from '../../../src/llm-client/models.js';
import type { CharacterDefinition } from '../../../src/characters/types.js';

/** OpenAI エラー生成用ヘルパー */
const headersLike = { get: () => null } as unknown as Headers;

const character: CharacterDefinition = {
  id: 'hiyori',
  displayName: '桃瀬ひより',
  // notificationName は通知タイトル用のカジュアル名（必須フィールド）
  notificationName: 'ひより',
  personality: {
    basePrompt: '',
    speechStyle: '優しい口調',
    preferences: { likes: ['コーヒー'], dislikes: [] },
  },
  voiceConfig: { provider: 'voicevox' as const, speakerId: 14 },
  license: { displayText: '', creditName: '' },
};

describe('OpenAIResearchClient', () => {
  it('apiKey なしで初期化すると例外', () => {
    expect(() => new OpenAIResearchClient({})).toThrow(RESEARCH_ERROR_MESSAGES.EMPTY_API_KEY);
  });

  it('client 注入で初期化できる', () => {
    const mockClient = {} as OpenAI;
    expect(() => new OpenAIResearchClient({ client: mockClient })).not.toThrow();
  });

  it('output_parsed が null の場合 INVALID_RESPONSE を throw する', async () => {
    const mockParse = jest.fn().mockResolvedValue({ output_parsed: null });
    const mockClient = {
      responses: { parse: mockParse },
    } as unknown as OpenAI;

    const researchClient = new OpenAIResearchClient({ client: mockClient });
    await expect(researchClient.research('テスト', character)).rejects.toThrow(
      RESEARCH_ERROR_MESSAGES.INVALID_RESPONSE
    );
  });

  it('output_parsed が null で INVALID_RESPONSE を throw する場合でも、throw より前に usage ログは出ている', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const usage = {
      input_tokens: 300,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 0,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 300,
    };
    const mockParse = jest.fn().mockResolvedValue({ output_parsed: null, usage });
    const mockClient = {
      responses: { parse: mockParse },
    } as unknown as OpenAI;

    const researchClient = new OpenAIResearchClient({ client: mockClient });
    await expect(researchClient.research('テスト', character)).rejects.toThrow(
      RESEARCH_ERROR_MESSAGES.INVALID_RESPONSE
    );

    // throw する前に usage ログが出ていることを固定する
    // （誰かが logLLMUsage を throw の後ろへ動かしてもこのテストで検知できる）
    expect(infoSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        service: 'livetalk',
        purpose: 'research',
        inputTokens: 300,
        totalTokens: 300,
      })
    );

    infoSpy.mockRestore();
  });

  it('正常ケースで ResearchResult が返る', async () => {
    const expected = {
      topic: 'コーヒー',
      summary: 'コーヒーの説明。'.repeat(10),
      sourceUrls: ['https://example.com'],
      rawComment: 'コメント',
    };
    const mockParse = jest.fn().mockResolvedValue({ output_parsed: expected });
    const mockClient = { responses: { parse: mockParse } } as unknown as OpenAI;

    const researchClient = new OpenAIResearchClient({ client: mockClient });
    const result = await researchClient.research('コーヒー', character);

    expect(result).toEqual({
      ...expected,
      webSearchCalls: { total: 0, search: 0, openPage: 0, findInPage: 0, other: 0 },
    });
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{ type: 'web_search' }],
        tool_choice: 'required',
        reasoning: { effort: LLM_REASONING_EFFORT.research },
      })
    );
    expect(LLM_REASONING_EFFORT.research).toBe('low');
  });

  it('effort 上書き指定が SDK 呼び出しに反映される', async () => {
    const expected = {
      topic: 'コーヒー',
      summary: 'コーヒーの説明。'.repeat(10),
      sourceUrls: ['https://example.com'],
      rawComment: 'コメント',
    };
    const mockParse = jest.fn().mockResolvedValue({ output_parsed: expected });
    const mockClient = { responses: { parse: mockParse } } as unknown as OpenAI;

    const researchClient = new OpenAIResearchClient({ client: mockClient, effort: 'high' });
    await researchClient.research('コーヒー', character);

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning: { effort: 'high' } })
    );
  });

  it('service=livetalk / purpose=research で usage ログを出力する', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const expected = {
      topic: 'コーヒー',
      summary: 'コーヒーの説明。'.repeat(10),
      sourceUrls: ['https://example.com'],
      rawComment: 'コメント',
    };
    const usage = {
      input_tokens: 200,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 80,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 280,
    };
    const mockParse = jest.fn().mockResolvedValue({ output_parsed: expected, usage });
    const mockClient = { responses: { parse: mockParse } } as unknown as OpenAI;

    const researchClient = new OpenAIResearchClient({ client: mockClient });
    await researchClient.research('コーヒー', character);

    expect(infoSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        service: 'livetalk',
        purpose: 'research',
        reasoningEffort: LLM_REASONING_EFFORT.research,
        inputTokens: 200,
        outputTokens: 80,
        totalTokens: 280,
      })
    );

    infoSpy.mockRestore();
  });

  describe('Web 検索回数の計測', () => {
    const expected = {
      topic: 'コーヒー',
      summary: 'コーヒーの説明。'.repeat(10),
      sourceUrls: ['https://example.com'],
      rawComment: 'コメント',
    };
    const output = [
      { type: 'reasoning', id: 'r1', summary: [] },
      { type: 'web_search_call', id: 'w1', status: 'completed', action: { type: 'search' } },
      { type: 'web_search_call', id: 'w2', status: 'completed', action: { type: 'search' } },
      { type: 'web_search_call', id: 'w3', status: 'completed', action: { type: 'open_page' } },
      { type: 'web_search_call', id: 'w4', status: 'completed', action: { type: 'find_in_page' } },
      { type: 'web_search_call', id: 'w5', status: 'completed', action: { type: 'unknown_new' } },
      { type: 'web_search_call', id: 'w6', status: 'completed' },
      { type: 'message', id: 'm1', role: 'assistant', content: [] },
    ];

    it('web_search_call を action 別に数えて戻り値に載せる', async () => {
      const mockParse = jest.fn().mockResolvedValue({ output_parsed: expected, output });
      const mockClient = { responses: { parse: mockParse } } as unknown as OpenAI;

      const result = await new OpenAIResearchClient({ client: mockClient }).research(
        'コーヒー',
        character
      );

      expect(result.webSearchCalls).toEqual({
        total: 6,
        search: 2,
        openPage: 1,
        findInPage: 1,
        other: 2,
      });
    });

    it('usage ログと突き合わせられるキーで回数ログを出す', async () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const mockParse = jest
        .fn()
        .mockResolvedValue({ output_parsed: expected, output, status: 'completed' });
      const mockClient = { responses: { parse: mockParse } } as unknown as OpenAI;

      await new OpenAIResearchClient({ client: mockClient, model: 'gpt-test' }).research(
        'コーヒー',
        character
      );

      expect(infoSpy).toHaveBeenCalledWith(WEB_SEARCH_USAGE_LOG_MESSAGE, {
        service: 'livetalk',
        purpose: 'research',
        model: 'gpt-test',
        reasoningEffort: LLM_REASONING_EFFORT.research,
        outcome: 'completed',
        webSearchCalls: 6,
        webSearchSearch: 2,
        webSearchOpenPage: 1,
        webSearchFindInPage: 1,
        webSearchOther: 2,
      });
      infoSpy.mockRestore();
    });

    it('output_parsed が null で throw する場合でも、回数ログは throw より前に出ている', async () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const mockParse = jest.fn().mockResolvedValue({ output_parsed: null, output });
      const mockClient = { responses: { parse: mockParse } } as unknown as OpenAI;

      await expect(
        new OpenAIResearchClient({ client: mockClient }).research('コーヒー', character)
      ).rejects.toThrow(RESEARCH_ERROR_MESSAGES.INVALID_RESPONSE);

      expect(infoSpy).toHaveBeenCalledWith(
        WEB_SEARCH_USAGE_LOG_MESSAGE,
        expect.objectContaining({ webSearchCalls: 6 })
      );
      infoSpy.mockRestore();
    });

    it('output が無くても 0 件として扱い throw しない', async () => {
      const mockParse = jest.fn().mockResolvedValue({ output_parsed: expected });
      const mockClient = { responses: { parse: mockParse } } as unknown as OpenAI;

      const result = await new OpenAIResearchClient({ client: mockClient }).research(
        'コーヒー',
        character
      );

      expect(result.webSearchCalls?.total).toBe(0);
    });
  });

  describe('リトライ動作', () => {
    it('429 エラー後に成功すれば ResearchResult を返す（一過性エラーはリトライされる）', async () => {
      jest.useFakeTimers();
      try {
        const rateLimitError = new OpenAI.RateLimitError(429, {}, 'rate limit', headersLike);
        const expected = {
          topic: 'コーヒー',
          summary: 'コーヒーの説明。'.repeat(10),
          sourceUrls: ['https://example.com'],
          rawComment: 'コメント',
        };
        const mockParse = jest
          .fn()
          .mockRejectedValueOnce(rateLimitError)
          .mockResolvedValue({ output_parsed: expected });
        const mockClient = { responses: { parse: mockParse } } as unknown as OpenAI;

        const researchClient = new OpenAIResearchClient({ client: mockClient });
        const resultPromise = researchClient.research('コーヒー', character);
        await jest.runAllTimersAsync();
        const result = await resultPromise;

        expect(result).toMatchObject(expected);
        expect(mockParse).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('恒久的エラー（401）は即時 throw（リトライしない）', async () => {
      const authError = new OpenAI.AuthenticationError(401, {}, 'unauthorized', headersLike);
      const mockParse = jest.fn().mockRejectedValue(authError);
      const mockClient = { responses: { parse: mockParse } } as unknown as OpenAI;

      const researchClient = new OpenAIResearchClient({ client: mockClient });
      await expect(researchClient.research('テスト', character)).rejects.toThrow(authError);
      expect(mockParse).toHaveBeenCalledTimes(1);
    });
  });
});
