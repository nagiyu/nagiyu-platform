import { VoicevoxClient } from '@nagiyu/voicevox-client';
import type { IVoiceClient } from '@nagiyu/voicevox-client';

/**
 * VOICEVOX クライアントのシングルトン。
 * ECS Task 内では VOICEVOX サイドカー（同 Task の localhost:50021）に接続される。
 * `VOICEVOX_URL` 環境変数で接続先を上書き可能（将来共通サービス化に備える）。
 */
let cachedClient: IVoiceClient | null = null;

export function getVoicevoxClient(): IVoiceClient {
  if (!cachedClient) {
    cachedClient = new VoicevoxClient({
      baseUrl: process.env.VOICEVOX_URL,
    });
  }
  return cachedClient;
}

/**
 * テスト用にクライアントを差し替えるエントリポイント。
 * 本番コードからは呼ばない。
 */
export function setVoicevoxClientForTesting(client: IVoiceClient | null): void {
  cachedClient = client;
}
