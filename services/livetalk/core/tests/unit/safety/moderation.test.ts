import OpenAI from 'openai';
import {
  OpenAIModerationClient,
  NoOpModerationClient,
  MODERATION_ERROR_MESSAGES,
} from '../../../src/safety/moderation.js';

// OpenAI クライアントのモック
function makeOpenAIClient(flagged: boolean, categories: Record<string, boolean> = {}): OpenAI {
  return {
    moderations: {
      create: jest.fn().mockResolvedValue({
        results: [
          {
            flagged,
            categories: {
              'self-harm': false,
              'self-harm/intent': false,
              violence: false,
              sexual: false,
              ...categories,
            },
          },
        ],
      }),
    },
  } as unknown as OpenAI;
}

describe('OpenAIModerationClient', () => {
  describe('コンストラクタ', () => {
    it('apiKey なしで client も未指定なら例外', () => {
      expect(() => new OpenAIModerationClient({})).toThrow(MODERATION_ERROR_MESSAGES.EMPTY_API_KEY);
    });

    it('client を注入すれば apiKey 不要', () => {
      const client = makeOpenAIClient(false);
      expect(() => new OpenAIModerationClient({ client })).not.toThrow();
    });

    it('apiKey を渡せば生成できる', () => {
      expect(() => new OpenAIModerationClient({ apiKey: 'test-key' })).not.toThrow();
    });
  });

  describe('check()', () => {
    it('flagged=false のとき ModerationResult.flagged=false を返す', async () => {
      const client = makeOpenAIClient(false);
      const mod = new OpenAIModerationClient({ client });
      const result = await mod.check('こんにちは');
      expect(result.flagged).toBe(false);
    });

    it('flagged=true のとき ModerationResult.flagged=true を返す', async () => {
      const client = makeOpenAIClient(true, { 'self-harm': true });
      const mod = new OpenAIModerationClient({ client });
      const result = await mod.check('自傷の説明');
      expect(result.flagged).toBe(true);
      expect(result.categories['self-harm']).toBe(true);
    });

    it('空文字列は例外を投げる', async () => {
      const client = makeOpenAIClient(false);
      const mod = new OpenAIModerationClient({ client });
      await expect(mod.check('')).rejects.toThrow(MODERATION_ERROR_MESSAGES.EMPTY_TEXT);
    });

    it('API がエラーを返したとき例外が伝播する', async () => {
      const failingClient = {
        moderations: {
          create: jest.fn().mockRejectedValue(new Error('API 障害')),
        },
      } as unknown as OpenAI;
      const mod = new OpenAIModerationClient({ client: failingClient });
      await expect(mod.check('テスト')).rejects.toThrow('API 障害');
    });

    it('results が空のとき例外を投げる', async () => {
      const emptyClient = {
        moderations: {
          create: jest.fn().mockResolvedValue({ results: [] }),
        },
      } as unknown as OpenAI;
      const mod = new OpenAIModerationClient({ client: emptyClient });
      await expect(mod.check('テスト')).rejects.toThrow(MODERATION_ERROR_MESSAGES.API_FAILED);
    });
  });
});

describe('NoOpModerationClient', () => {
  it('常に flagged=false を返す', async () => {
    const mod = new NoOpModerationClient();
    const result = await mod.check('自殺したい');
    expect(result.flagged).toBe(false);
  });

  it('categories が空オブジェクト', async () => {
    const mod = new NoOpModerationClient();
    const result = await mod.check('テスト');
    expect(result.categories).toEqual({});
  });
});
