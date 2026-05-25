/**
 * @jest-environment node
 */
import { getVoicevoxClient, setVoicevoxClientForTesting } from '@/lib/server/voicevox';

describe('getVoicevoxClient', () => {
  afterEach(() => {
    setVoicevoxClientForTesting(null);
  });

  it('同じインスタンスをキャッシュして返す', () => {
    const first = getVoicevoxClient();
    const second = getVoicevoxClient();
    expect(first).toBe(second);
  });

  it('setVoicevoxClientForTesting でキャッシュをリセットできる', () => {
    const first = getVoicevoxClient();
    setVoicevoxClientForTesting(null);
    const second = getVoicevoxClient();
    expect(first).not.toBe(second);
  });

  it('差し替えた client をそのまま返す', () => {
    const stub = { synthesize: async () => new ArrayBuffer(0) };
    setVoicevoxClientForTesting(stub);
    expect(getVoicevoxClient()).toBe(stub);
  });
});
