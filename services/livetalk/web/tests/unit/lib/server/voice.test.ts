/**
 * @jest-environment node
 */
import { getVoiceClient, setVoiceClientForTesting } from '@/lib/server/voice';

describe('getVoiceClient', () => {
  beforeEach(() => {
    // 各テスト前にキャッシュをクリアする
    setVoiceClientForTesting(null);
    // TTS_PROVIDER 環境変数をリセットする
    delete process.env.TTS_PROVIDER;
  });

  afterEach(() => {
    setVoiceClientForTesting(null);
    delete process.env.TTS_PROVIDER;
  });

  it('同じインスタンスをキャッシュして返す', () => {
    const first = getVoiceClient();
    const second = getVoiceClient();
    expect(first).toBe(second);
  });

  it('setVoiceClientForTesting でキャッシュをリセットできる', () => {
    const first = getVoiceClient();
    setVoiceClientForTesting(null);
    const second = getVoiceClient();
    expect(first).not.toBe(second);
  });

  it('差し替えた client をそのまま返す', () => {
    const stub = { synthesize: async () => new ArrayBuffer(0) };
    setVoiceClientForTesting(stub);
    expect(getVoiceClient()).toBe(stub);
  });

  it('TTS_PROVIDER 未指定時は VOICEVOX クライアントを生成する', () => {
    const client = getVoiceClient();
    // VoicevoxClient のインスタンスであることを確認（synthesize メソッドを持つ）
    expect(typeof client.synthesize).toBe('function');
  });

  it('TTS_PROVIDER=voicevox でも VOICEVOX クライアントを生成する', () => {
    process.env.TTS_PROVIDER = 'voicevox';
    const client = getVoiceClient();
    expect(typeof client.synthesize).toBe('function');
  });

  it('TTS_PROVIDER に未知の値を指定しても VOICEVOX にフォールバックする', () => {
    process.env.TTS_PROVIDER = 'unknown-provider';
    const client = getVoiceClient();
    // フォールバックで VOICEVOX クライアントが生成されることを確認
    expect(typeof client.synthesize).toBe('function');
  });
});
