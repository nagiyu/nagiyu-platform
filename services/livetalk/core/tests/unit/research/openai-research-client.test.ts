import OpenAI from 'openai';
import { OpenAIResearchClient, RESEARCH_ERROR_MESSAGES } from '../../../src/research/openai-research-client.js';
import type { CharacterDefinition } from '../../../src/characters/types.js';

const character: CharacterDefinition = {
  id: 'hiyori',
  displayName: '桃瀬ひより',
  personality: {
    basePrompt: '',
    speechStyle: '優しい口調',
    preferences: { likes: ['コーヒー'], dislikes: [] },
  },
  voiceConfig: { speakerId: 14 },
  license: { displayText: '', creditName: '' },
};

describe('OpenAIResearchClient', () => {
  it('apiKey なしで初期化すると例外', () => {
    expect(() => new OpenAIResearchClient({})).toThrow(
      RESEARCH_ERROR_MESSAGES.EMPTY_API_KEY
    );
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
});
