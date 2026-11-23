import OpenAI from 'openai';
import {
  OpenAIVoiceClient,
  OPENAI_VOICE_ERROR_MESSAGES,
  READ_ALOUD_INSTRUCTIONS,
} from '../../../src/openai-voice/openai-voice-client.js';
import type { RealtimeConnection } from '../../../src/openai-voice/types.js';

type Listener = (...args: never[]) => void;

/** Realtime 接続のモック。open 後の送信内容を記録し、サーバーイベントを手動で流せる。 */
function makeConnection(onSent?: (conn: FakeConnection) => void) {
  const conn = {
    sent: [] as Array<Record<string, unknown>>,
    closed: 0,
    opened: false,
    listeners: {} as Record<string, Listener>,
    send: jest.fn((event: Record<string, unknown>) => {
      conn.sent.push(event);
      if (event.type === 'response.create') onSent?.(conn);
    }),
    close: jest.fn(() => {
      conn.closed += 1;
    }),
    onOpen: (l: Listener) => {
      conn.listeners.open = l;
      if (conn.opened) (l as () => void)();
    },
    onEvent: (l: Listener) => (conn.listeners.event = l),
    onError: (l: Listener) => (conn.listeners.error = l),
    onClose: (l: Listener) => (conn.listeners.close = l),
    emit: (event: Record<string, unknown>) => (conn.listeners.event as (e: unknown) => void)(event),
    open: () => {
      conn.opened = true;
      (conn.listeners.open as (() => void) | undefined)?.();
    },
  };
  return conn;
}
type FakeConnection = ReturnType<typeof makeConnection>;

const delta = (bytes: number[]) => ({
  type: 'response.output_audio.delta',
  delta: Buffer.from(bytes).toString('base64'),
});
const done = (status: string, status_details?: unknown) => ({
  type: 'response.done',
  response: { status, status_details },
});

/** open 後に既定で成功応答（PCM 4 バイト）を流す接続を作る。 */
function successConnection(): FakeConnection {
  return makeConnection((c) => {
    c.emit(delta([1, 2]));
    c.emit(delta([3, 4]));
    c.emit(done('completed'));
  });
}

function makeClient(connections: FakeConnection[]) {
  const connector = jest.fn(async () => {
    const next = connections.shift();
    if (!next) throw new Error('接続が足りません');
    queueMicrotask(() => next.open());
    return next as unknown as RealtimeConnection;
  });
  return { client: new OpenAIVoiceClient({ connector }), connector };
}

describe('OpenAIVoiceClient', () => {
  describe('コンストラクタ', () => {
    it('apiKey を指定して生成できる', () => {
      expect(() => new OpenAIVoiceClient({ apiKey: 'sk-test' })).not.toThrow();
    });

    it('client を注入して生成できる（apiKey 不要）', () => {
      expect(() => new OpenAIVoiceClient({ client: {} as unknown as OpenAI })).not.toThrow();
    });

    it('connector を注入して生成できる（apiKey 不要）', () => {
      expect(() => new OpenAIVoiceClient({ connector: jest.fn() })).not.toThrow();
    });

    it('apiKey も client も無い場合は EMPTY_API_KEY を投げる', () => {
      expect(() => new OpenAIVoiceClient({})).toThrow(OPENAI_VOICE_ERROR_MESSAGES.EMPTY_API_KEY);
    });
  });

  describe('synthesize', () => {
    it('集めた PCM に WAV ヘッダを付けた ArrayBuffer を返す', async () => {
      const { client } = makeClient([successConnection()]);

      const result = await client.synthesize('こんにちは');

      const bytes = new Uint8Array(result);
      expect(bytes.byteLength).toBe(44 + 4);
      expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
      expect(Array.from(bytes.slice(44))).toEqual([1, 2, 3, 4]);
      expect(new DataView(result).getUint32(24, true)).toBe(24000);
    });

    it('空文字は EMPTY_TEXT で reject され、接続も作らない', async () => {
      const { client, connector } = makeClient([]);

      await expect(client.synthesize('  ')).rejects.toThrow(OPENAI_VOICE_ERROR_MESSAGES.EMPTY_TEXT);
      expect(connector).not.toHaveBeenCalled();
    });

    it('session.update と response.create を順に送る', async () => {
      const conn = successConnection();
      const { client } = makeClient([conn]);

      await client.synthesize('  テスト  ');

      expect(conn.sent).toHaveLength(2);
      expect(conn.sent[0]).toEqual({
        type: 'session.update',
        session: {
          type: 'realtime',
          output_modalities: ['audio'],
          audio: { output: { voice: 'marin', format: { type: 'audio/pcm', rate: 24000 } } },
          instructions: READ_ALOUD_INSTRUCTIONS,
        },
      });
      expect(conn.sent[1]).toEqual({
        type: 'response.create',
        response: {
          conversation: 'none',
          output_modalities: ['audio'],
          input: [
            { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'テスト' }] },
          ],
        },
      });
    });

    it('成功時は接続を閉じる', async () => {
      const conn = successConnection();
      const { client } = makeClient([conn]);

      await client.synthesize('テスト');

      expect(conn.closed).toBe(1);
    });

    describe('voice パラメータの解決', () => {
      const sessionOf = (conn: FakeConnection) =>
        conn.sent[0].session as { instructions: string; audio: { output: { voice: string } } };

      it('provider === openai の場合、voice / model を使い、instructions を読み上げ指示の後ろに足す', async () => {
        const conn = successConnection();
        const { client, connector } = makeClient([conn]);

        await client.synthesize('テスト', {
          provider: 'openai',
          voice: 'cedar',
          model: 'gpt-realtime-custom',
          instructions: 'ゆっくり話してください',
        });

        expect(connector).toHaveBeenCalledWith('gpt-realtime-custom');
        expect(sessionOf(conn).audio.output.voice).toBe('cedar');
        expect(sessionOf(conn).instructions).toBe(
          `${READ_ALOUD_INSTRUCTIONS}\n\nゆっくり話してください`
        );
      });

      it('instructions なしなら読み上げ指示だけを渡す', async () => {
        const conn = successConnection();
        const { client } = makeClient([conn]);

        await client.synthesize('テスト', { provider: 'openai', voice: 'coral' });

        expect(sessionOf(conn).instructions).toBe(READ_ALOUD_INSTRUCTIONS);
      });

      it('model 省略時は defaultModel を使う', async () => {
        const connector = jest.fn(async () => {
          const c = successConnection();
          queueMicrotask(() => c.open());
          return c as unknown as RealtimeConnection;
        });
        const client = new OpenAIVoiceClient({ connector, defaultModel: 'custom-model' });

        await client.synthesize('テスト', { provider: 'openai', voice: 'alloy' });

        expect(connector).toHaveBeenCalledWith('custom-model');
      });

      it('voice 省略時は defaultVoice / defaultModel を使う', async () => {
        const conn = successConnection();
        const connector = jest.fn(async () => {
          queueMicrotask(() => conn.open());
          return conn as unknown as RealtimeConnection;
        });
        const client = new OpenAIVoiceClient({
          connector,
          defaultVoice: 'cedar',
          defaultModel: 'custom-model',
        });

        await client.synthesize('テスト');

        expect(connector).toHaveBeenCalledWith('custom-model');
        expect(sessionOf(conn).audio.output.voice).toBe('cedar');
      });

      it('provider === voicevox の場合は既定値で合成する（寛容な振る舞い）', async () => {
        const conn = successConnection();
        const { client, connector } = makeClient([conn]);

        await client.synthesize('テスト', { provider: 'voicevox', speakerId: 14 });

        expect(connector).toHaveBeenCalledWith('gpt-realtime-2.1-mini');
        expect(sessionOf(conn).audio.output.voice).toBe('marin');
      });
    });

    describe('エラーハンドリング', () => {
      const failWith = (events: Array<Record<string, unknown>>) =>
        makeConnection((c) => events.forEach((e) => c.emit(e)));

      it('error イベントは SYNTHESIS_FAILED で包み、cause に元のエラーを持つ', async () => {
        const conn = failWith([
          { type: 'error', error: { type: 'invalid_request_error', message: '不正' } },
        ]);
        const { client } = makeClient([conn]);

        const error = await client.synthesize('テスト').catch((e: Error) => e);

        expect((error as Error).message).toBe(OPENAI_VOICE_ERROR_MESSAGES.SYNTHESIS_FAILED);
        expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(OpenAI.APIError);
      });

      it('response.done の status が completed 以外なら失敗し、接続を閉じる', async () => {
        const conn = failWith([done('incomplete', { reason: 'content_filter' })]);
        const { client } = makeClient([conn]);

        await expect(client.synthesize('テスト')).rejects.toThrow(
          OPENAI_VOICE_ERROR_MESSAGES.SYNTHESIS_FAILED
        );
        expect(conn.closed).toBe(1);
      });

      it('失敗が非一過性（不正な要求）ならリトライせず 1 回で諦める', async () => {
        const { client, connector } = makeClient([
          failWith([{ type: 'error', error: { type: 'invalid_request_error', message: 'x' } }]),
          successConnection(),
        ]);

        await expect(client.synthesize('テスト')).rejects.toThrow();
        expect(connector).toHaveBeenCalledTimes(1);
      });

      it('認証エラーはリトライしない', async () => {
        const { client, connector } = makeClient([
          failWith([{ type: 'error', error: { type: 'authentication_error', message: 'x' } }]),
          successConnection(),
        ]);

        await expect(client.synthesize('テスト')).rejects.toThrow();
        expect(connector).toHaveBeenCalledTimes(1);
      });

      it('completed でも音声が空なら失敗する', async () => {
        jest.useFakeTimers();
        try {
          const { client } = makeClient([
            failWith([done('completed')]),
            failWith([done('completed')]),
            failWith([done('completed')]),
            failWith([done('completed')]),
          ]);
          const result = client.synthesize('テスト').catch((e: Error) => e);
          await jest.runAllTimersAsync();

          const error = (await result) as Error & { cause?: Error };
          expect(error.message).toBe(OPENAI_VOICE_ERROR_MESSAGES.SYNTHESIS_FAILED);
          expect(error.cause?.message).toContain(OPENAI_VOICE_ERROR_MESSAGES.EMPTY_AUDIO);
        } finally {
          jest.useRealTimers();
        }
      });

      it('応答完了前に接続が閉じられたら失敗する', async () => {
        jest.useFakeTimers();
        try {
          const closing = () => makeConnection((c) => (c.listeners.close as () => void)());
          const { client, connector } = makeClient([closing(), closing(), closing(), closing()]);
          const result = client.synthesize('テスト').catch((e: Error) => e);
          await jest.runAllTimersAsync();

          const error = (await result) as Error & { cause?: Error };
          expect(error.cause).toBeInstanceOf(OpenAI.APIConnectionError);
          expect(connector).toHaveBeenCalledTimes(4);
        } finally {
          jest.useRealTimers();
        }
      });

      it('settle 後に届いたイベントは無視する', async () => {
        const conn = makeConnection((c) => {
          c.emit(delta([1, 2]));
          c.emit(done('completed'));
          c.emit(delta([9, 9]));
          c.emit({ type: 'error', error: { type: 'server_error' } });
        });
        const { client } = makeClient([conn]);

        const result = await client.synthesize('テスト');

        expect(result.byteLength).toBe(44 + 2);
      });
    });

    describe('リトライ動作', () => {
      it('rate limit エラー後に成功すれば WAV を返す', async () => {
        jest.useFakeTimers();
        try {
          const rateLimited = makeConnection((c) =>
            c.emit({ type: 'error', error: { type: 'rate_limit_error', message: '混雑' } })
          );
          const { client, connector } = makeClient([rateLimited, successConnection()]);
          const result = client.synthesize('テスト');
          await jest.runAllTimersAsync();

          expect((await result).byteLength).toBe(48);
          expect(connector).toHaveBeenCalledTimes(2);
          expect(rateLimited.closed).toBe(1);
        } finally {
          jest.useRealTimers();
        }
      });

      it('server_error はリトライされる', async () => {
        jest.useFakeTimers();
        try {
          const broken = makeConnection((c) =>
            c.emit({ type: 'error', error: { type: 'server_error', message: '障害' } })
          );
          const { client, connector } = makeClient([broken, successConnection()]);
          const result = client.synthesize('テスト');
          await jest.runAllTimersAsync();

          await result;
          expect(connector).toHaveBeenCalledTimes(2);
        } finally {
          jest.useRealTimers();
        }
      });

      it('status failed の response.done はリトライされる', async () => {
        jest.useFakeTimers();
        try {
          const failed = makeConnection((c) => c.emit(done('failed', { error: {} })));
          const { client, connector } = makeClient([failed, successConnection()]);
          const result = client.synthesize('テスト');
          await jest.runAllTimersAsync();

          await result;
          expect(connector).toHaveBeenCalledTimes(2);
        } finally {
          jest.useRealTimers();
        }
      });

      it('接続エラー（onError）後に成功すれば WAV を返す', async () => {
        jest.useFakeTimers();
        try {
          const broken = makeConnection((c) =>
            (c.listeners.error as (e: Error) => void)(new Error('ECONNRESET'))
          );
          const { client, connector } = makeClient([broken, successConnection()]);
          const result = client.synthesize('テスト');
          await jest.runAllTimersAsync();

          await result;
          expect(connector).toHaveBeenCalledTimes(2);
        } finally {
          jest.useRealTimers();
        }
      });

      it('接続の確立自体が失敗した場合もリトライされ、全敗で SYNTHESIS_FAILED になる', async () => {
        jest.useFakeTimers();
        try {
          const connector = jest
            .fn()
            .mockRejectedValue(new OpenAI.APIConnectionError({ message: '接続失敗' }));
          const client = new OpenAIVoiceClient({ connector });
          const result = client.synthesize('テスト').catch((e: Error) => e);
          await jest.runAllTimersAsync();

          expect(((await result) as Error).message).toBe(
            OPENAI_VOICE_ERROR_MESSAGES.SYNTHESIS_FAILED
          );
          expect(connector).toHaveBeenCalledTimes(4);
        } finally {
          jest.useRealTimers();
        }
      });
    });

    describe('タイムアウト', () => {
      it('応答が来なければタイムアウトし、接続を閉じてリトライする', async () => {
        jest.useFakeTimers();
        try {
          const silent = () => makeConnection();
          const conns = [silent(), silent(), silent(), silent()];
          const connector = jest.fn(async () => {
            const c = conns.shift() as FakeConnection;
            queueMicrotask(() => c.open());
            return c as unknown as RealtimeConnection;
          });
          const client = new OpenAIVoiceClient({ connector, timeoutMs: 1000 });
          const result = client.synthesize('テスト').catch((e: Error) => e);
          await jest.runAllTimersAsync();

          const error = (await result) as Error & { cause?: Error };
          expect(error.message).toBe(OPENAI_VOICE_ERROR_MESSAGES.SYNTHESIS_FAILED);
          expect(error.cause?.name).toBe('LLMTimeoutError');
          expect(connector).toHaveBeenCalledTimes(4);
        } finally {
          jest.useRealTimers();
        }
      });
    });
  });
});
