import {
  VoicevoxClient,
  OpenAIVoiceClient,
  CompositeVoiceClient,
} from '@nagiyu/livetalk-core';
import type { IVoiceClient } from '@nagiyu/livetalk-core';

let cachedClient: IVoiceClient | null = null;

/**
 * TTS クライアントのシングルトン。
 * CompositeVoiceClient を返し、voice.provider に応じて VOICEVOX / OpenAI を自動振り分けする。
 *
 * - defaultProvider は 'voicevox'（後方互換）。
 * - OpenAIVoiceClient は OPENAI_API_KEY が存在する場合のみ遅延登録する。
 *   キーが不在の状態で voicevox のリクエストが来ても正常に動作する。
 */
export function getVoiceClient(): IVoiceClient {
  if (!cachedClient) cachedClient = createVoiceClient();
  return cachedClient;
}

function createVoiceClient(): IVoiceClient {
  // OpenAI TTS は API キーが存在する場合のみ遅延ファクトリとして登録する。
  // ファクトリは初回利用時に実行されるため、VOICEVOX のみのリクエストでは
  // OPENAI_API_KEY 不在でも OpenAIVoiceClient が生成されず、エラーにならない。
  const openaiClientFactory: (() => IVoiceClient) | undefined = process.env.OPENAI_API_KEY
    ? () => new OpenAIVoiceClient({ apiKey: process.env.OPENAI_API_KEY })
    : undefined;

  return new CompositeVoiceClient({
    clients: {
      voicevox: new VoicevoxClient({ baseUrl: process.env.VOICEVOX_URL }),
      ...(openaiClientFactory ? { openai: openaiClientFactory } : {}),
    },
    defaultProvider: 'voicevox',
  });
}

/**
 * テスト用にクライアントを差し替えるエントリポイント。
 * 本番コードからは呼ばない。
 */
export function setVoiceClientForTesting(client: IVoiceClient | null): void {
  cachedClient = client;
}
