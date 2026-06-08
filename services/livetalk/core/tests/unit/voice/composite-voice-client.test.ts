import {
  CompositeVoiceClient,
  COMPOSITE_VOICE_ERROR_MESSAGES,
} from '../../../src/voice/composite-voice-client.js';
import type { IVoiceClient, VoiceConfig } from '../../../src/voice/types.js';

/**
 * テスト用モッククライアントのファクトリ。
 * synthesize の呼び出し引数を記録する。
 */
function makeMockClient(returnValue: ArrayBuffer = new ArrayBuffer(0)): {
  client: IVoiceClient;
  synthesize: jest.Mock;
} {
  const synthesize = jest.fn().mockResolvedValue(returnValue);
  const client: IVoiceClient = { synthesize };
  return { client, synthesize };
}

describe('CompositeVoiceClient', () => {
  describe('provider の振り分け', () => {
    it('voice.provider === voicevox のとき voicevox クライアントに委譲する', async () => {
      const voicevoxBuf = new ArrayBuffer(4);
      const openAiBuf = new ArrayBuffer(8);
      const { client: voicevoxClient, synthesize: voicevoxSynthesize } =
        makeMockClient(voicevoxBuf);
      const { client: openaiClient, synthesize: openaiSynthesize } = makeMockClient(openAiBuf);

      const composite = new CompositeVoiceClient({
        clients: { voicevox: voicevoxClient, openai: openaiClient },
        defaultProvider: 'voicevox',
      });

      const voice: VoiceConfig = { provider: 'voicevox', speakerId: 14 };
      const result = await composite.synthesize('こんにちは', voice);

      expect(result).toBe(voicevoxBuf);
      expect(voicevoxSynthesize).toHaveBeenCalledWith('こんにちは', voice);
      expect(openaiSynthesize).not.toHaveBeenCalled();
    });

    it('voice.provider === openai のとき openai クライアントに委譲する', async () => {
      const openAiBuf = new ArrayBuffer(8);
      const { client: voicevoxClient, synthesize: voicevoxSynthesize } = makeMockClient();
      const { client: openaiClient, synthesize: openaiSynthesize } = makeMockClient(openAiBuf);

      const composite = new CompositeVoiceClient({
        clients: { voicevox: voicevoxClient, openai: openaiClient },
        defaultProvider: 'voicevox',
      });

      const voice: VoiceConfig = { provider: 'openai', voice: 'nova' };
      const result = await composite.synthesize('テスト', voice);

      expect(result).toBe(openAiBuf);
      expect(openaiSynthesize).toHaveBeenCalledWith('テスト', voice);
      expect(voicevoxSynthesize).not.toHaveBeenCalled();
    });

    it('voice 未指定のとき defaultProvider に委譲する', async () => {
      const voicevoxBuf = new ArrayBuffer(4);
      const { client: voicevoxClient, synthesize: voicevoxSynthesize } =
        makeMockClient(voicevoxBuf);

      const composite = new CompositeVoiceClient({
        clients: { voicevox: voicevoxClient },
        defaultProvider: 'voicevox',
      });

      const result = await composite.synthesize('テスト');

      expect(result).toBe(voicevoxBuf);
      expect(voicevoxSynthesize).toHaveBeenCalledWith('テスト', undefined);
    });

    it('defaultProvider が openai のとき voice 未指定で openai に委譲する', async () => {
      const { client: openaiClient, synthesize: openaiSynthesize } = makeMockClient();

      const composite = new CompositeVoiceClient({
        clients: { openai: openaiClient },
        defaultProvider: 'openai',
      });

      await composite.synthesize('テスト');

      expect(openaiSynthesize).toHaveBeenCalledWith('テスト', undefined);
    });
  });

  describe('未登録プロバイダ', () => {
    it('voice.provider に対応するクライアントが無い場合は UNKNOWN_PROVIDER を投げる', async () => {
      const { client: voicevoxClient } = makeMockClient();

      const composite = new CompositeVoiceClient({
        clients: { voicevox: voicevoxClient },
        defaultProvider: 'voicevox',
      });

      const voice: VoiceConfig = { provider: 'openai', voice: 'alloy' };
      await expect(composite.synthesize('テスト', voice)).rejects.toThrow(
        COMPOSITE_VOICE_ERROR_MESSAGES.UNKNOWN_PROVIDER
      );
    });

    it('defaultProvider に対応するクライアントが無い場合も UNKNOWN_PROVIDER を投げる', async () => {
      const composite = new CompositeVoiceClient({
        clients: {},
        defaultProvider: 'voicevox',
      });

      await expect(composite.synthesize('テスト')).rejects.toThrow(
        COMPOSITE_VOICE_ERROR_MESSAGES.UNKNOWN_PROVIDER
      );
    });
  });

  describe('遅延ファクトリ', () => {
    it('ファクトリ関数を登録した場合、初回呼び出し時にクライアントが生成される', async () => {
      const factoryBuf = new ArrayBuffer(12);
      const { client: openaiClient, synthesize: openaiSynthesize } = makeMockClient(factoryBuf);
      const factory = jest.fn().mockReturnValue(openaiClient);

      const composite = new CompositeVoiceClient({
        clients: { openai: factory },
        defaultProvider: 'openai',
      });

      // 初回呼び出し前はファクトリが実行されていない
      expect(factory).not.toHaveBeenCalled();

      const result = await composite.synthesize('テスト');

      expect(factory).toHaveBeenCalledTimes(1);
      expect(result).toBe(factoryBuf);
      expect(openaiSynthesize).toHaveBeenCalled();
    });

    it('ファクトリは2回目以降呼ばれない（キャッシュされる）', async () => {
      const { client: openaiClient } = makeMockClient();
      const factory = jest.fn().mockReturnValue(openaiClient);

      const composite = new CompositeVoiceClient({
        clients: { openai: factory },
        defaultProvider: 'openai',
      });

      await composite.synthesize('1回目');
      await composite.synthesize('2回目');
      await composite.synthesize('3回目');

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('voicevox クライアントが IVoiceClient インスタンス、openai がファクトリのとき voicevox は openai ファクトリを実行しない', async () => {
      const { client: voicevoxClient } = makeMockClient();
      const openaiFactory = jest.fn();

      const composite = new CompositeVoiceClient({
        clients: { voicevox: voicevoxClient, openai: openaiFactory },
        defaultProvider: 'voicevox',
      });

      await composite.synthesize('テスト', { provider: 'voicevox', speakerId: 14 });

      expect(openaiFactory).not.toHaveBeenCalled();
    });
  });

  describe('voice の受け渡し', () => {
    it('委譲時に元の voice オブジェクトをそのまま渡す', async () => {
      const { client, synthesize } = makeMockClient();

      const composite = new CompositeVoiceClient({
        clients: { voicevox: client },
        defaultProvider: 'voicevox',
      });

      const voice: VoiceConfig = { provider: 'voicevox', speakerId: 99 };
      await composite.synthesize('テスト', voice);

      expect(synthesize).toHaveBeenCalledWith('テスト', voice);
    });
  });
});
