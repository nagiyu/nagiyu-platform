import OpenAI from 'openai';
import {
  OpenAIClient,
  OPENAI_DEFAULT_MODELS,
  OPENAI_ERROR_MESSAGES,
  parseSummarizeResult,
} from '../../../src/llm-client/openai-client.js';
import type { ChatMessage, SummarizeInput } from '../../../src/llm-client/types.js';

function makeStreamEvents(deltas: Array<string | null>): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const delta of deltas) {
        if (delta === null) {
          // 関係ないイベント（フィルタされるべき）
          yield { type: 'response.created', sequence_number: 0 };
        } else {
          yield {
            type: 'response.output_text.delta',
            delta,
            content_index: 0,
            item_id: 'msg_test',
            logprobs: [],
            output_index: 0,
            sequence_number: 1,
          };
        }
      }
    },
  };
}

function makeMockOpenAI(): {
  client: OpenAI;
  create: jest.Mock;
} {
  const create = jest.fn();
  const client = {
    responses: { create },
  } as unknown as OpenAI;
  return { client, create };
}

const messages: ChatMessage[] = [
  { role: 'system', content: 'あなたは桃瀬ひより' },
  { role: 'user', content: 'おはよう' },
];

describe('OpenAIClient', () => {
  describe('constructor', () => {
    it('client 注入のみで生成できる', () => {
      const { client } = makeMockOpenAI();
      expect(() => new OpenAIClient({ client })).not.toThrow();
    });

    it('apiKey も client も無ければ EMPTY_API_KEY を投げる', () => {
      expect(() => new OpenAIClient({})).toThrow(OPENAI_ERROR_MESSAGES.EMPTY_API_KEY);
    });

    it('apiKey 指定時は OpenAI SDK を内部生成する', () => {
      const livetalk = new OpenAIClient({ apiKey: 'sk-test' });
      expect(livetalk).toBeInstanceOf(OpenAIClient);
    });
  });

  describe('chatStream', () => {
    it('response.output_text.delta イベントから text delta を yield する', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents(['こん', null, 'にちは', '！']));

      const livetalk = new OpenAIClient({ client });
      const chunks: string[] = [];
      for await (const piece of livetalk.chatStream(messages)) {
        chunks.push(piece);
      }

      expect(chunks).toEqual(['こん', 'にちは', '！']);
      const args = create.mock.calls[0][0];
      expect(args.stream).toBe(true);
      expect(args.model).toBe(OPENAI_DEFAULT_MODELS.conversation);
      expect(args.input).toEqual([
        { role: 'system', content: 'あなたは桃瀬ひより', type: 'message' },
        { role: 'user', content: 'おはよう', type: 'message' },
      ]);
    });

    it('空文字 delta はスキップする', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents(['a', '', 'b']));

      const livetalk = new OpenAIClient({ client });
      const chunks: string[] = [];
      for await (const piece of livetalk.chatStream(messages)) {
        chunks.push(piece);
      }

      expect(chunks).toEqual(['a', 'b']);
    });

    it('purpose=summarize は gpt-5-mini モデルにフォールバックする', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents([]));

      const livetalk = new OpenAIClient({ client });
      for await (const chunk of livetalk.chatStream(messages, { purpose: 'summarize' })) {
        void chunk;
      }

      expect(create.mock.calls[0][0].model).toBe(OPENAI_DEFAULT_MODELS.summarize);
    });

    it('models 上書き指定が反映される', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents([]));

      const livetalk = new OpenAIClient({
        client,
        models: { conversation: 'gpt-x-custom' },
      });
      for await (const chunk of livetalk.chatStream(messages)) {
        void chunk;
      }

      expect(create.mock.calls[0][0].model).toBe('gpt-x-custom');
    });

    it('options.model 明示指定が purpose より優先される', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents([]));

      const livetalk = new OpenAIClient({ client });
      for await (const chunk of livetalk.chatStream(messages, {
        model: 'gpt-explicit',
        purpose: 'classify',
      })) {
        void chunk;
      }

      expect(create.mock.calls[0][0].model).toBe('gpt-explicit');
    });

    it('temperature / maxTokens を SDK の max_output_tokens に受け渡す', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents([]));

      const livetalk = new OpenAIClient({ client });
      for await (const chunk of livetalk.chatStream(messages, {
        temperature: 0.3,
        maxTokens: 256,
      })) {
        void chunk;
      }

      const args = create.mock.calls[0][0];
      expect(args.temperature).toBe(0.3);
      expect(args.max_output_tokens).toBe(256);
    });

    it('messages が空なら EMPTY_MESSAGES を投げる', async () => {
      const { client } = makeMockOpenAI();
      const livetalk = new OpenAIClient({ client });

      const iterator = livetalk.chatStream([])[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(OPENAI_ERROR_MESSAGES.EMPTY_MESSAGES);
    });
  });

  describe('chatComplete', () => {
    it('response.output_text を返す', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue({ output_text: 'こんにちは！' });

      const livetalk = new OpenAIClient({ client });
      const result = await livetalk.chatComplete(messages);

      expect(result).toBe('こんにちは！');
      expect(create.mock.calls[0][0].stream).toBe(false);
    });

    it('output_text が undefined なら空文字を返す', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue({});

      const livetalk = new OpenAIClient({ client });
      const result = await livetalk.chatComplete(messages);

      expect(result).toBe('');
    });

    it('messages が空なら EMPTY_MESSAGES を投げる', async () => {
      const { client } = makeMockOpenAI();
      const livetalk = new OpenAIClient({ client });

      await expect(livetalk.chatComplete([])).rejects.toThrow(OPENAI_ERROR_MESSAGES.EMPTY_MESSAGES);
    });
  });

  describe('summarize', () => {
    const baseInput: SummarizeInput = {
      existingSummary: 'コーヒーが好き',
      newMessages: [
        { role: 'user', text: 'ケーキも好きだよ' },
        { role: 'assistant', text: 'そうなんだね！' },
      ],
      characterName: 'ひより',
    };

    it('chatComplete を purpose=summarize で呼び出す', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue({
        output_text: '{"mergedSummary":"テスト","newMemoryCandidates":[]}',
      });
      const livetalk = new OpenAIClient({ client });
      await livetalk.summarize(baseInput);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ model: OPENAI_DEFAULT_MODELS.summarize })
      );
    });

    it('JSON レスポンスを SummarizeResult に変換する', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue({
        output_text: JSON.stringify({
          mergedSummary: 'コーヒーとケーキが好き',
          newMemoryCandidates: [{ category: 'food', content: 'ケーキが好き' }],
        }),
      });
      const livetalk = new OpenAIClient({ client });
      const result = await livetalk.summarize(baseInput);
      expect(result.mergedSummary).toBe('コーヒーとケーキが好き');
      expect(result.newMemoryCandidates).toHaveLength(1);
      expect(result.newMemoryCandidates[0].category).toBe('food');
    });

    it('existingSummary が undefined のとき「既存の要約：なし」をプロンプトに含める', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue({ output_text: '{"mergedSummary":"","newMemoryCandidates":[]}' });
      const livetalk = new OpenAIClient({ client });
      await livetalk.summarize({ ...baseInput, existingSummary: undefined });
      const calledMessages = (create.mock.calls[0] as [{ input: Array<{ content: string }> }])[0]
        .input;
      expect(calledMessages[0].content).toContain('既存の要約：なし');
    });
  });
});

describe('parseSummarizeResult', () => {
  it('正常な JSON をパースする', () => {
    const raw = JSON.stringify({
      mergedSummary: 'まとめ',
      newMemoryCandidates: [{ category: 'hobby', content: '映画好き' }],
    });
    const result = parseSummarizeResult(raw);
    expect(result.mergedSummary).toBe('まとめ');
    expect(result.newMemoryCandidates).toHaveLength(1);
  });

  it('```json コードブロックを除去してパースする', () => {
    const raw = '```json\n{"mergedSummary":"テスト","newMemoryCandidates":[]}\n```';
    const result = parseSummarizeResult(raw);
    expect(result.mergedSummary).toBe('テスト');
  });

  it('JSON パース失敗時は rawText を mergedSummary に、candidates を空配列にする', () => {
    const result = parseSummarizeResult('これは JSON ではない');
    expect(result.mergedSummary).toBe('これは JSON ではない');
    expect(result.newMemoryCandidates).toEqual([]);
  });

  it('newMemoryCandidates が配列でない場合は空配列にする', () => {
    const raw = JSON.stringify({ mergedSummary: 'ok', newMemoryCandidates: 'bad' });
    const result = parseSummarizeResult(raw);
    expect(result.newMemoryCandidates).toEqual([]);
  });

  it('content が空の候補は除外する', () => {
    const raw = JSON.stringify({
      mergedSummary: 'ok',
      newMemoryCandidates: [
        { category: 'a', content: '' },
        { category: 'b', content: '有効' },
      ],
    });
    const result = parseSummarizeResult(raw);
    expect(result.newMemoryCandidates).toHaveLength(1);
    expect(result.newMemoryCandidates[0].content).toBe('有効');
  });

  it('category が文字列でない場合は "general" にフォールバックする', () => {
    const raw = JSON.stringify({
      mergedSummary: 'ok',
      newMemoryCandidates: [{ category: 123, content: 'test' }],
    });
    const result = parseSummarizeResult(raw);
    expect(result.newMemoryCandidates[0].category).toBe('general');
  });

  it('interestCategories をパースする', () => {
    const raw = JSON.stringify({
      mergedSummary: 'ok',
      newMemoryCandidates: [],
      interestCategories: [
        { category: 'アニメ', weight: 2 },
        { category: 'コーヒー', weight: 1 },
      ],
    });
    const result = parseSummarizeResult(raw);
    expect(result.interestCategories).toHaveLength(2);
    expect(result.interestCategories?.[0].category).toBe('アニメ');
    expect(result.interestCategories?.[0].weight).toBe(2);
  });

  it('interestCategories が空の場合は undefined を返す', () => {
    const raw = JSON.stringify({
      mergedSummary: 'ok',
      newMemoryCandidates: [],
      interestCategories: [],
    });
    const result = parseSummarizeResult(raw);
    expect(result.interestCategories).toBeUndefined();
  });

  it('interestCategories がない場合は undefined を返す', () => {
    const raw = JSON.stringify({ mergedSummary: 'ok', newMemoryCandidates: [] });
    const result = parseSummarizeResult(raw);
    expect(result.interestCategories).toBeUndefined();
  });

  it('interestCategories の category が空文字の要素を除外する', () => {
    const raw = JSON.stringify({
      mergedSummary: 'ok',
      newMemoryCandidates: [],
      interestCategories: [
        { category: '', weight: 1 },
        { category: '有効', weight: 1 },
      ],
    });
    const result = parseSummarizeResult(raw);
    expect(result.interestCategories).toHaveLength(1);
    expect(result.interestCategories?.[0].category).toBe('有効');
  });

  it('bidirectionalityScore をパースして 0〜1 にクランプする', () => {
    expect(parseSummarizeResult(JSON.stringify({
      mergedSummary: '', newMemoryCandidates: [], bidirectionalityScore: 0.7,
    })).bidirectionalityScore).toBeCloseTo(0.7);

    expect(parseSummarizeResult(JSON.stringify({
      mergedSummary: '', newMemoryCandidates: [], bidirectionalityScore: 1.5,
    })).bidirectionalityScore).toBe(1);

    expect(parseSummarizeResult(JSON.stringify({
      mergedSummary: '', newMemoryCandidates: [], bidirectionalityScore: -0.3,
    })).bidirectionalityScore).toBe(0);
  });

  it('bidirectionalityScore がない場合は undefined を返す', () => {
    const raw = JSON.stringify({ mergedSummary: 'ok', newMemoryCandidates: [] });
    const result = parseSummarizeResult(raw);
    expect(result.bidirectionalityScore).toBeUndefined();
  });
});
