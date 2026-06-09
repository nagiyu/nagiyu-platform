/**
 * @jest-environment node
 */
import { getVoiceClient, setVoiceClientForTesting } from '@/lib/server/voice';
import type { IVoiceClient } from '@nagiyu/livetalk-core';

describe('getVoiceClient', () => {
  beforeEach(() => {
    // 各テスト前にキャッシュをクリアする
    setVoiceClientForTesting(null);
    // OPENAI_API_KEY 環境変数をリセットする
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    setVoiceClientForTesting(null);
    delete process.env.OPENAI_API_KEY;
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
    const stub: IVoiceClient = { synthesize: async () => new ArrayBuffer(0) };
    setVoiceClientForTesting(stub);
    expect(getVoiceClient()).toBe(stub);
  });

  it('synthesize メソッドを持つクライアントを返す', () => {
    const client = getVoiceClient();
    expect(typeof client.synthesize).toBe('function');
  });

  it('OPENAI_API_KEY 不在でも getVoiceClient が例外を投げない（voicevox は動作する）', () => {
    // OPENAI_API_KEY を未設定の状態でクライアントが生成できることを確認する
    delete process.env.OPENAI_API_KEY;
    expect(() => getVoiceClient()).not.toThrow();
  });

  it('OPENAI_API_KEY がある場合も getVoiceClient が例外を投げない', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    // キャッシュをクリアして新しくクライアントを生成する
    setVoiceClientForTesting(null);
    expect(() => getVoiceClient()).not.toThrow();
  });

  it('setVoiceClientForTesting に null を渡すと次回 getVoiceClient で再生成する', () => {
    const first = getVoiceClient();
    setVoiceClientForTesting(null);
    const second = getVoiceClient();
    // 再生成されるため別インスタンスになる
    expect(second).not.toBe(first);
    expect(typeof second.synthesize).toBe('function');
  });
});
