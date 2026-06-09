/**
 * OpenAI TTS クライアント。
 *
 * プロバイダ非依存のインターフェース（IVoiceClient / VoiceConfig）は voice/ に配置されている。
 */

export { OpenAIVoiceClient, OPENAI_VOICE_ERROR_MESSAGES } from './openai-voice-client.js';
export type { OpenAIVoiceClientOptions } from './types.js';
