import OpenAI from 'openai';
import {
  OpenAIResearchClient,
  RESEARCH_ERROR_MESSAGES,
} from '../../../src/research/openai-research-client.js';
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

    expect(result).toEqual(expected);
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{ type: 'web_search' }],
        tool_choice: 'required',
      })
    );
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

        expect(result).toEqual(expected);
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
