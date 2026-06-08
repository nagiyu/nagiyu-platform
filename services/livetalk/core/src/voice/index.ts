/**
 * TTS（音声合成）プロバイダ非依存ポートの公開エントリポイント。
 */
export type { IVoiceClient, VoiceConfig } from './types.js';
export { CompositeVoiceClient, COMPOSITE_VOICE_ERROR_MESSAGES } from './composite-voice-client.js';
export type { CompositeVoiceClientOptions } from './composite-voice-client.js';
