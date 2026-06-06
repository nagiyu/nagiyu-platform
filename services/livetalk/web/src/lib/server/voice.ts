import { VoicevoxClient } from '@nagiyu/livetalk-core';
import type { IVoiceClient } from '@nagiyu/livetalk-core';

let cachedClient: IVoiceClient | null = null;

/**
 * TTS クライアントのシングルトン。環境変数 TTS_PROVIDER でプロバイダを選択（既定: voicevox）。
 * ECS Task 内では VOICEVOX サイドカー（同 Task の localhost:50021）に接続される。
 */
export function getVoiceClient(): IVoiceClient {
  if (!cachedClient) cachedClient = createVoiceClient();
  return cachedClient;
}

function createVoiceClient(): IVoiceClient {
  const provider = process.env.TTS_PROVIDER ?? 'voicevox';
  switch (provider) {
    case 'voicevox':
      return new VoicevoxClient({ baseUrl: process.env.VOICEVOX_URL });
    default:
      // 未知のプロバイダ指定時は VOICEVOX にフォールバック（振る舞い不変を優先）
      return new VoicevoxClient({ baseUrl: process.env.VOICEVOX_URL });
  }
}

/**
 * テスト用にクライアントを差し替えるエントリポイント。
 * 本番コードからは呼ばない。
 */
export function setVoiceClientForTesting(client: IVoiceClient | null): void {
  cachedClient = client;
}
