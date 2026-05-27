import OpenAI from 'openai';
import {
  OpenAIEmbeddingClient,
  OPENAI_EMBEDDING_MODEL,
  OPENAI_EMBEDDING_ERROR_MESSAGES,
} from '../../../src/llm-client/openai-client.js';

function makeMockOpenAI(): { client: OpenAI; create: jest.Mock } {
  const create = jest.fn();
  const client = {
    embeddings: { create },
  } as unknown as OpenAI;
  return { client, create };
}

describe('OpenAIEmbeddingClient', () => {
  describe('constructor', () => {
    it('client 注入のみで生成できる', () => {
      const { client } = makeMockOpenAI();
      expect(() => new OpenAIEmbeddingClient({ client })).not.toThrow();
    });

    it('apiKey も client も無ければエラーを投げる', () => {
      expect(() => new OpenAIEmbeddingClient({})).toThrow(
        OPENAI_EMBEDDING_ERROR_MESSAGES.EMPTY_API_KEY
      );
    });
  });

  describe('embed', () => {
    it('テキストを送ると embedding ベクトルを返す', async () => {
      const { client, create } = makeMockOpenAI();
      const mockVec = Array.from({ length: 3 }, (_, i) => i * 0.1);
      create.mockResolvedValue({ data: [{ embedding: mockVec }] });

      const cli = new OpenAIEmbeddingClient({ client });
      const result = await cli.embed('コーヒーが好き');

      expect(result).toEqual(mockVec);
      const args = create.mock.calls[0][0];
      expect(args.model).toBe(OPENAI_EMBEDDING_MODEL);
      expect(args.input).toBe('コーヒーが好き');
    });

    it('model 上書きが反映される', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue({ data: [{ embedding: [0.1] }] });

      const cli = new OpenAIEmbeddingClient({ client, model: 'text-embedding-custom' });
      await cli.embed('test');

      expect(create.mock.calls[0][0].model).toBe('text-embedding-custom');
    });

    it('空文字を渡すと EMPTY_TEXT エラーを投げる', async () => {
      const { client } = makeMockOpenAI();
      const cli = new OpenAIEmbeddingClient({ client });

      await expect(cli.embed('  ')).rejects.toThrow(OPENAI_EMBEDDING_ERROR_MESSAGES.EMPTY_TEXT);
    });

    it('前後の空白はトリムして送る', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue({ data: [{ embedding: [0.5] }] });

      const cli = new OpenAIEmbeddingClient({ client });
      await cli.embed('  テスト  ');

      expect(create.mock.calls[0][0].input).toBe('テスト');
    });
  });
});
