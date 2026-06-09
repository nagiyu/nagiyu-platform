import type OpenAI from 'openai';

/**
 * OpenAIVoiceClient の構築オプション。
 * client を渡す場合は apiKey 不要（テスト・差し替え用）。
 */
export interface OpenAIVoiceClientOptions {
  /** OpenAI API キー。`client` を渡す場合は不要 */
  apiKey?: string;
  /** テスト・差し替え用に既存の OpenAI クライアントを注入できる */
  client?: OpenAI;
  /**
   * 既定で使用するモデル名。省略時は 'gpt-4o-mini-tts'。
   * synthesize 呼び出し時に voice.model を指定した場合はそちらが優先される。
   */
  defaultModel?: string;
  /**
   * 既定で使用する voice 名。省略時は 'alloy'。
   * synthesize 呼び出し時に voice.voice を指定した場合はそちらが優先される。
   */
  defaultVoice?: string;
}
