/**
 * OpenAI Realtime API を使う音声合成クライアント。
 *
 * プロバイダ非依存のインターフェース（IVoiceClient / VoiceConfig）は voice/ に配置されている。
 */

export {
  OpenAIVoiceClient,
  OPENAI_VOICE_ERROR_MESSAGES,
  READ_ALOUD_INSTRUCTIONS,
} from './openai-voice-client.js';
export { pcm16ToWav } from './wav.js';
export type { OpenAIVoiceClientOptions, RealtimeConnection, RealtimeConnector } from './types.js';
