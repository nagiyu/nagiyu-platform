/**
 * VOICEVOX HTTP API クライアント。
 *
 * 現状リブトークからのみ利用される想定で `services/livetalk/core` に配置している。
 * 別サービスからも使う必要が出てきた段階で `libs/voicevox-client/` への昇格を検討する。
 *
 * プロバイダ非依存のインターフェース（IVoiceClient / VoiceConfig）は voice/ に配置されている。
 */

export { VoicevoxClient, VOICEVOX_ERROR_MESSAGES } from './voicevox-client.js';
export type { VoicevoxClientOptions } from './types.js';
