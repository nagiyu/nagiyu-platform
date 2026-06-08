import OpenAI from 'openai';
import {
  OpenAIVoiceClient,
  OPENAI_VOICE_ERROR_MESSAGES,
} from '../../../src/openai-voice/openai-voice-client.js';

/**
 * OpenAI TTS クライアント用モックファクトリ。
 * audio.speech.create の呼び出しを記録し、任意の応答を返す。
 */
function makeMockOpenAI(responseBuffer: ArrayBuffer = new ArrayBuffer(16)): {
  client: OpenAI;
  create: jest.Mock;
} {
  const create = jest.fn().mockResolvedValue({
    arrayBuffer: async () => responseBuffer,
  });
  const client = {
    audio: {
      speech: { create },
    },
  } as unknown as OpenAI;
  return { client, create };
}

describe('OpenAIVoiceClient', () => {
  describe('コンストラクタ', () => {
    it('apiKey を指定して生成できる', () => {
      expect(() => new OpenAIVoiceClient({ apiKey: 'sk-test' })).not.toThrow();
    });

    it('client を注入して生成できる（apiKey 不要）', () => {
      const { client } = makeMockOpenAI();
      expect(() => new OpenAIVoiceClient({ client })).not.toThrow();
    });

    it('apiKey も client も無い場合は EMPTY_API_KEY を投げる', () => {
      expect(() => new OpenAIVoiceClient({})).toThrow(OPENAI_VOICE_ERROR_MESSAGES.EMPTY_API_KEY);
    });
  });

  describe('synthesize', () => {
    it('正常なテキストで ArrayBuffer を返す', async () => {
      const expected = new ArrayBuffer(16);
      const { client } = makeMockOpenAI(expected);
      const ttsClient = new OpenAIVoiceClient({ client });

      const result = await ttsClient.synthesize('こんにちは');

      expect(result).toBe(expected);
    });

    it('空文字は EMPTY_TEXT で reject される', async () => {
      const { client } = makeMockOpenAI();
      const ttsClient = new OpenAIVoiceClient({ client });

      await expect(ttsClient.synthesize('  ')).rejects.toThrow(
        OPENAI_VOICE_ERROR_MESSAGES.EMPTY_TEXT
      );
    });

    it('空文字では create が呼ばれない', async () => {
      const { client, create } = makeMockOpenAI();
      const ttsClient = new OpenAIVoiceClient({ client });

      await expect(ttsClient.synthesize('')).rejects.toThrow();
      expect(create).not.toHaveBeenCalled();
    });

    describe('voice パラメータの解決', () => {
      it('voice.provider === openai の場合、voice.voice / model を渡す', async () => {
        const { client, create } = makeMockOpenAI();
        const ttsClient = new OpenAIVoiceClient({ client });

        await ttsClient.synthesize('テスト', {
          provider: 'openai',
          voice: 'nova',
          model: 'gpt-4o-mini-tts',
        });

        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({
            voice: 'nova',
            model: 'gpt-4o-mini-tts',
            input: 'テスト',
            response_format: 'mp3',
          })
        );
      });

      it('voice.provider === openai かつ instructions あり → instructions を渡す', async () => {
        const { client, create } = makeMockOpenAI();
        const ttsClient = new OpenAIVoiceClient({ client });

        await ttsClient.synthesize('テスト', {
          provider: 'openai',
          voice: 'shimmer',
          instructions: 'ゆっくり話してください',
        });

        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({
            voice: 'shimmer',
            instructions: 'ゆっくり話してください',
          })
        );
      });

      it('voice.provider === openai かつ instructions なし → instructions を渡さない', async () => {
        const { client, create } = makeMockOpenAI();
        const ttsClient = new OpenAIVoiceClient({ client });

        await ttsClient.synthesize('テスト', {
          provider: 'openai',
          voice: 'coral',
        });

        const calledWith = create.mock.calls[0][0] as Record<string, unknown>;
        expect(calledWith.instructions).toBeUndefined();
      });

      it('voice.provider === openai かつ model 省略 → defaultModel を使用する', async () => {
        const { client, create } = makeMockOpenAI();
        const ttsClient = new OpenAIVoiceClient({ client, defaultModel: 'custom-tts-model' });

        await ttsClient.synthesize('テスト', {
          provider: 'openai',
          voice: 'alloy',
        });

        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({
            model: 'custom-tts-model',
          })
        );
      });

      it('voice 省略時は defaultVoice / defaultModel を使用する', async () => {
        const { client, create } = makeMockOpenAI();
        const ttsClient = new OpenAIVoiceClient({
          client,
          defaultVoice: 'onyx',
          defaultModel: 'tts-1',
        });

        await ttsClient.synthesize('テスト');

        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({
            voice: 'onyx',
            model: 'tts-1',
          })
        );
      });

      it('voice.provider === voicevox の場合は既定値で合成する（寛容な振る舞い）', async () => {
        const { client, create } = makeMockOpenAI();
        const ttsClient = new OpenAIVoiceClient({
          client,
          defaultVoice: 'alloy',
          defaultModel: 'gpt-4o-mini-tts',
        });

        await ttsClient.synthesize('テスト', { provider: 'voicevox', speakerId: 14 });

        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({
            voice: 'alloy',
            model: 'gpt-4o-mini-tts',
          })
        );
      });

      it('既定の defaultVoice は alloy', async () => {
        const { client, create } = makeMockOpenAI();
        const ttsClient = new OpenAIVoiceClient({ client });

        await ttsClient.synthesize('テスト');

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ voice: 'alloy' }));
      });

      it('既定の defaultModel は gpt-4o-mini-tts', async () => {
        const { client, create } = makeMockOpenAI();
        const ttsClient = new OpenAIVoiceClient({ client });

        await ttsClient.synthesize('テスト');

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o-mini-tts' }));
      });

      it('response_format は mp3', async () => {
        const { client, create } = makeMockOpenAI();
        const ttsClient = new OpenAIVoiceClient({ client });

        await ttsClient.synthesize('テスト');

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ response_format: 'mp3' }));
      });

      it('前後の空白を除去してから合成する', async () => {
        const { client, create } = makeMockOpenAI();
        const ttsClient = new OpenAIVoiceClient({ client });

        await ttsClient.synthesize('  テスト  ');

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ input: 'テスト' }));
      });
    });

    describe('エラーハンドリング', () => {
      it('create が例外を投げると SYNTHESIS_FAILED を throw する', async () => {
        const create = jest.fn().mockRejectedValue(new Error('API エラー'));
        const client = {
          audio: { speech: { create } },
        } as unknown as OpenAI;
        const ttsClient = new OpenAIVoiceClient({ client });

        await expect(ttsClient.synthesize('テスト')).rejects.toThrow(
          OPENAI_VOICE_ERROR_MESSAGES.SYNTHESIS_FAILED
        );
      });

      it('SYNTHESIS_FAILED エラーは cause に元の例外を含む', async () => {
        const originalError = new Error('オリジナルエラー');
        const create = jest.fn().mockRejectedValue(originalError);
        const client = {
          audio: { speech: { create } },
        } as unknown as OpenAI;
        const ttsClient = new OpenAIVoiceClient({ client });

        try {
          await ttsClient.synthesize('テスト');
          fail('例外が投げられるべき');
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          expect((err as Error & { cause?: unknown }).cause).toBe(originalError);
        }
      });
    });
  });
});
