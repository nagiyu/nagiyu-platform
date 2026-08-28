import OpenAI from 'openai';
import { logger } from '@nagiyu/common';
import {
  OpenAIClient,
  OPENAI_DEFAULT_MODELS,
  OPENAI_DEFAULT_REASONING_EFFORT,
  OPENAI_ERROR_MESSAGES,
} from '../../../src/llm-client/openai-client.js';
import type { ChatMessage } from '../../../src/llm-client/types.js';
import { z } from 'zod';

/** OpenAI エラー生成用ヘルパー */
const headersLike = { get: () => null } as unknown as Headers;

const SAMPLE_USAGE = {
  input_tokens: 100,
  input_tokens_details: { cached_tokens: 10 },
  output_tokens: 50,
  output_tokens_details: { reasoning_tokens: 5 },
  total_tokens: 150,
};

/** ストリーミングの終了イベント種別。'none' は終了イベントを一切送らない（中断相当）。 */
type StreamEndKind = 'completed' | 'incomplete' | 'failed' | 'none';

function makeStreamEvents(
  deltas: Array<string | null>,
  options: { end?: StreamEndKind } = {}
): AsyncIterable<unknown> {
  const end = options.end ?? 'none';
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
      if (end !== 'none') {
        yield {
          type: `response.${end}`,
          sequence_number: 99,
          response: { usage: SAMPLE_USAGE },
        };
      }
    },
  };
}

function makeMockOpenAI(): {
  client: OpenAI;
  create: jest.Mock;
  parse: jest.Mock;
} {
  const create = jest.fn();
  const parse = jest.fn();
  const client = {
    responses: { create, parse },
  } as unknown as OpenAI;
  return { client, create, parse };
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

    it('purpose=summarize は gpt-5.6-luna モデルにフォールバックする', async () => {
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

    it('purpose 既定の reasoning.effort を SDK 呼び出しに渡す（conversation=low）', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents([]));

      const livetalk = new OpenAIClient({ client });
      for await (const chunk of livetalk.chatStream(messages)) {
        void chunk;
      }

      expect(create.mock.calls[0][0].reasoning).toEqual({
        effort: OPENAI_DEFAULT_REASONING_EFFORT.conversation,
      });
      expect(OPENAI_DEFAULT_REASONING_EFFORT.conversation).toBe('low');
    });

    it('purpose=classify の reasoning.effort は none になる', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents([]));

      const livetalk = new OpenAIClient({ client });
      for await (const chunk of livetalk.chatStream(messages, { purpose: 'classify' })) {
        void chunk;
      }

      expect(create.mock.calls[0][0].reasoning).toEqual({ effort: 'none' });
      expect(OPENAI_DEFAULT_REASONING_EFFORT.classify).toBe('none');
    });

    it('purpose=summarize の reasoning.effort は low になる', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents([]));

      const livetalk = new OpenAIClient({ client });
      for await (const chunk of livetalk.chatStream(messages, { purpose: 'summarize' })) {
        void chunk;
      }

      expect(create.mock.calls[0][0].reasoning).toEqual({ effort: 'low' });
      expect(OPENAI_DEFAULT_REASONING_EFFORT.summarize).toBe('low');
    });

    it('effort 上書き指定が反映される', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents([]));

      const livetalk = new OpenAIClient({
        client,
        effort: { conversation: 'high' },
      });
      for await (const chunk of livetalk.chatStream(messages)) {
        void chunk;
      }

      expect(create.mock.calls[0][0].reasoning).toEqual({ effort: 'high' });
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

    it('maxTokens を SDK の max_output_tokens に受け渡す', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents([]));

      const livetalk = new OpenAIClient({ client });
      for await (const chunk of livetalk.chatStream(messages, {
        maxTokens: 256,
      })) {
        void chunk;
      }

      const args = create.mock.calls[0][0];
      expect(args.max_output_tokens).toBe(256);
    });

    it('messages が空なら EMPTY_MESSAGES を投げる', async () => {
      const { client } = makeMockOpenAI();
      const livetalk = new OpenAIClient({ client });

      const iterator = livetalk.chatStream([])[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(OPENAI_ERROR_MESSAGES.EMPTY_MESSAGES);
    });

    it('429 エラーでもリトライしない（ストリーミングはリトライ対象外）', async () => {
      const { client, create } = makeMockOpenAI();
      const rateLimitError = new OpenAI.RateLimitError(429, {}, 'rate limit', headersLike);
      create.mockRejectedValue(rateLimitError);

      const livetalk = new OpenAIClient({ client });
      const iterator = livetalk.chatStream(messages)[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(rateLimitError);
      // ストリーミングはリトライしないため 1 回だけ呼ばれる
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('response.completed イベントから usage ログを出力する（outcome=completed）', async () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents(['こん', 'にちは'], { end: 'completed' }));

      const livetalk = new OpenAIClient({ client });
      for await (const chunk of livetalk.chatStream(messages)) {
        void chunk;
      }

      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          service: 'livetalk',
          purpose: 'conversation',
          model: OPENAI_DEFAULT_MODELS.conversation,
          reasoningEffort: OPENAI_DEFAULT_REASONING_EFFORT.conversation,
          outcome: 'completed',
          inputTokens: 100,
          cachedInputTokens: 10,
          outputTokens: 50,
          reasoningTokens: 5,
          totalTokens: 150,
        })
      );

      infoSpy.mockRestore();
    });

    it('response.incomplete イベント（max_output_tokens 到達等）からも usage ログを出力する（取りこぼし対策）', async () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents(['こん', 'にちは'], { end: 'incomplete' }));

      const livetalk = new OpenAIClient({ client });
      for await (const chunk of livetalk.chatStream(messages)) {
        void chunk;
      }

      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          service: 'livetalk',
          purpose: 'conversation',
          model: OPENAI_DEFAULT_MODELS.conversation,
          outcome: 'incomplete',
          inputTokens: 100,
          cachedInputTokens: 10,
          outputTokens: 50,
          reasoningTokens: 5,
          totalTokens: 150,
        })
      );

      infoSpy.mockRestore();
    });

    it('response.failed イベントからも usage ログを出力する（取りこぼし対策）', async () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents(['こん'], { end: 'failed' }));

      const livetalk = new OpenAIClient({ client });
      for await (const chunk of livetalk.chatStream(messages)) {
        void chunk;
      }

      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          service: 'livetalk',
          purpose: 'conversation',
          model: OPENAI_DEFAULT_MODELS.conversation,
          outcome: 'failed',
          inputTokens: 100,
          totalTokens: 150,
        })
      );

      infoSpy.mockRestore();
    });

    it('response.completed 等に到達する前に消費側が break すると、usage 未取得の中断ログ（outcome=aborted）が1行だけ出る', async () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue(makeStreamEvents(['こん', 'にちは'], { end: 'completed' }));

      const livetalk = new OpenAIClient({ client });
      const chunks: string[] = [];
      for await (const chunk of livetalk.chatStream(messages)) {
        chunks.push(chunk);
        break;
      }

      // break 直前までは delta が届いている
      expect(chunks).toEqual(['こん']);

      // response.completed には到達していない（正常系の usage ログは出ない）が、
      // 代わりに「usage 未取得のまま終了した」ことを示す 1 行だけが出る。
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          service: 'livetalk',
          purpose: 'conversation',
          model: OPENAI_DEFAULT_MODELS.conversation,
          outcome: 'aborted',
          inputTokens: undefined,
          cachedInputTokens: undefined,
          outputTokens: undefined,
          reasoningTokens: undefined,
          totalTokens: undefined,
        })
      );
      // aborted は意図した欠測なのでカナリア警告は出ない
      expect(warnSpy).not.toHaveBeenCalled();

      infoSpy.mockRestore();
      warnSpy.mockRestore();
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

    it('purpose 既定の reasoning.effort を SDK 呼び出しに渡す', async () => {
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue({ output_text: 'ok' });

      const livetalk = new OpenAIClient({ client });
      await livetalk.chatComplete(messages, { purpose: 'classify' });

      expect(create.mock.calls[0][0].reasoning).toEqual({ effort: 'none' });
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

    it('response.status が incomplete の場合、usage ログの outcome にも incomplete が入る（非ストリーミングでも取りこぼさない）', async () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue({
        output_text: '途中まで',
        status: 'incomplete',
        usage: SAMPLE_USAGE,
      });

      const livetalk = new OpenAIClient({ client });
      await livetalk.chatComplete(messages);

      expect(infoSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ outcome: 'incomplete', totalTokens: 150 })
      );

      infoSpy.mockRestore();
    });

    it('response.usage から usage ログを出力する', async () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue({ output_text: 'こんにちは！', usage: SAMPLE_USAGE });

      const livetalk = new OpenAIClient({ client });
      await livetalk.chatComplete(messages, { purpose: 'classify' });

      expect(infoSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          service: 'livetalk',
          purpose: 'classify',
          model: OPENAI_DEFAULT_MODELS.classify,
          reasoningEffort: OPENAI_DEFAULT_REASONING_EFFORT.classify,
          inputTokens: 100,
          cachedInputTokens: 10,
          outputTokens: 50,
          reasoningTokens: 5,
          totalTokens: 150,
        })
      );

      infoSpy.mockRestore();
    });

    it('options.model 明示指定時も purpose を記録する', async () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const { client, create } = makeMockOpenAI();
      create.mockResolvedValue({ output_text: 'ok', usage: SAMPLE_USAGE });

      const livetalk = new OpenAIClient({ client });
      await livetalk.chatComplete(messages, { model: 'gpt-explicit', purpose: 'summarize' });

      expect(infoSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'gpt-explicit', purpose: 'summarize' })
      );

      infoSpy.mockRestore();
    });

    describe('リトライ動作', () => {
      it('429 エラー後に成功すれば値を返す（一過性エラーはリトライされる）', async () => {
        jest.useFakeTimers();
        try {
          const { client, create } = makeMockOpenAI();
          const rateLimitError = new OpenAI.RateLimitError(429, {}, 'rate limit', headersLike);
          create
            .mockRejectedValueOnce(rateLimitError)
            .mockResolvedValue({ output_text: 'リトライ成功' });

          const livetalk = new OpenAIClient({ client });
          const resultPromise = livetalk.chatComplete(messages);
          await jest.runAllTimersAsync();
          const result = await resultPromise;

          expect(result).toBe('リトライ成功');
          expect(create).toHaveBeenCalledTimes(2);
        } finally {
          jest.useRealTimers();
        }
      });

      it('400 エラーは即時 throw（恒久的エラーはリトライしない）', async () => {
        const { client, create } = makeMockOpenAI();
        const badRequestError = new OpenAI.BadRequestError(400, {}, 'bad request', headersLike);
        create.mockRejectedValue(badRequestError);

        const livetalk = new OpenAIClient({ client });
        await expect(livetalk.chatComplete(messages)).rejects.toThrow(badRequestError);
        expect(create).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('chatStructured', () => {
    const testSchema = z.object({ value: z.string(), count: z.number() });

    it('parse の output_parsed を返す', async () => {
      const { client, parse } = makeMockOpenAI();
      parse.mockResolvedValue({ output_parsed: { value: 'テスト', count: 3 } });

      const livetalk = new OpenAIClient({ client });
      const result = await livetalk.chatStructured(messages, testSchema);

      expect(result).toEqual({ value: 'テスト', count: 3 });
      expect(parse).toHaveBeenCalledWith(
        expect.objectContaining({ model: OPENAI_DEFAULT_MODELS.conversation })
      );
    });

    it('purpose=classify は gpt-5.6-luna モデルを使用する', async () => {
      const { client, parse } = makeMockOpenAI();
      parse.mockResolvedValue({ output_parsed: { value: 'ok', count: 0 } });

      const livetalk = new OpenAIClient({ client });
      await livetalk.chatStructured(messages, testSchema, { purpose: 'classify' });

      expect(parse.mock.calls[0][0].model).toBe(OPENAI_DEFAULT_MODELS.classify);
    });

    it('purpose 既定の reasoning.effort を SDK 呼び出しに渡す', async () => {
      const { client, parse } = makeMockOpenAI();
      parse.mockResolvedValue({ output_parsed: { value: 'ok', count: 0 } });

      const livetalk = new OpenAIClient({ client });
      await livetalk.chatStructured(messages, testSchema, { purpose: 'classify' });

      expect(parse.mock.calls[0][0].reasoning).toEqual({ effort: 'none' });
    });

    it('output_parsed が null の場合 REFUSAL エラーを投げる', async () => {
      const { client, parse } = makeMockOpenAI();
      parse.mockResolvedValue({ output_parsed: null });

      const livetalk = new OpenAIClient({ client });

      await expect(livetalk.chatStructured(messages, testSchema)).rejects.toThrow(
        OPENAI_ERROR_MESSAGES.REFUSAL
      );
    });

    it('messages が空なら EMPTY_MESSAGES を投げる', async () => {
      const { client } = makeMockOpenAI();
      const livetalk = new OpenAIClient({ client });

      await expect(livetalk.chatStructured([], testSchema)).rejects.toThrow(
        OPENAI_ERROR_MESSAGES.EMPTY_MESSAGES
      );
    });

    it('response.usage から usage ログを出力する', async () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const { client, parse } = makeMockOpenAI();
      parse.mockResolvedValue({ output_parsed: { value: 'ok', count: 0 }, usage: SAMPLE_USAGE });

      const livetalk = new OpenAIClient({ client });
      await livetalk.chatStructured(messages, testSchema);

      expect(infoSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          service: 'livetalk',
          purpose: 'conversation',
          model: OPENAI_DEFAULT_MODELS.conversation,
          reasoningEffort: OPENAI_DEFAULT_REASONING_EFFORT.conversation,
          inputTokens: 100,
          cachedInputTokens: 10,
          outputTokens: 50,
          reasoningTokens: 5,
          totalTokens: 150,
        })
      );

      infoSpy.mockRestore();
    });

    describe('リトライ動作', () => {
      it('429 エラー後に成功すれば output_parsed を返す（一過性エラーはリトライされる）', async () => {
        jest.useFakeTimers();
        try {
          const { client, parse } = makeMockOpenAI();
          const rateLimitError = new OpenAI.RateLimitError(429, {}, 'rate limit', headersLike);
          parse
            .mockRejectedValueOnce(rateLimitError)
            .mockResolvedValue({ output_parsed: { value: 'リトライ成功', count: 1 } });

          const livetalk = new OpenAIClient({ client });
          const resultPromise = livetalk.chatStructured(messages, testSchema);
          await jest.runAllTimersAsync();
          const result = await resultPromise;

          expect(result).toEqual({ value: 'リトライ成功', count: 1 });
          expect(parse).toHaveBeenCalledTimes(2);
        } finally {
          jest.useRealTimers();
        }
      });
    });
  });
});
