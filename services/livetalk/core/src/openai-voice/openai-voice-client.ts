import OpenAI from 'openai';
import type { IVoiceClient, VoiceConfig } from '../voice/types.js';
import type { OpenAIVoiceClientOptions } from './types.js';
import { withLLMRetry } from '../lib/llm-retry.js';

/**
 * OpenAI TTS クライアント周りのエラーメッセージ（日本語、定数化）。
 */
export const OPENAI_VOICE_ERROR_MESSAGES = {
  EMPTY_TEXT: 'テキストが空です',
  EMPTY_API_KEY: 'OpenAI API キーが指定されていません',
  SYNTHESIS_FAILED: 'OpenAI TTS の音声合成に失敗しました',
} as const;

const DEFAULT_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_VOICE = 'alloy';

/**
 * OpenAI TTS API を {@link IVoiceClient} 形にラップする実装。
 *
 * - `audio.speech.create` で MP3 バイナリを取得し、ArrayBuffer として返す。
 * - `voice.provider === 'openai'` の場合のみ voice / instructions / model を解釈する。
 *   それ以外（voicevox 等）は既定値で合成する（VoicevoxClient と同じ寛容さ）。
 * - `synthesize` は `withLLMRetry` で一過性エラー（rate limit, timeout 等）をリトライする。
 *   全敗した場合は `SYNTHESIS_FAILED` エラーでラップして throw する。
 * - SDK 自動リトライは `maxRetries: 0` で無効化し、アプリ側で一元管理する。
 */
export class OpenAIVoiceClient implements IVoiceClient {
  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly defaultVoice: string;

  constructor(options: OpenAIVoiceClientOptions = {}) {
    if (options.client) {
      this.client = options.client;
    } else {
      if (!options.apiKey) {
        throw new Error(OPENAI_VOICE_ERROR_MESSAGES.EMPTY_API_KEY);
      }
      this.client = new OpenAI({ apiKey: options.apiKey, maxRetries: 0 });
    }
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL;
    this.defaultVoice = options.defaultVoice ?? DEFAULT_VOICE;
  }

  public async synthesize(text: string, voice?: VoiceConfig): Promise<ArrayBuffer> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error(OPENAI_VOICE_ERROR_MESSAGES.EMPTY_TEXT);
    }

    // voice が省略された場合、または provider が openai でない場合は既定値を使用する
    const resolvedVoice = voice && voice.provider === 'openai' ? voice.voice : this.defaultVoice;
    const resolvedModel =
      voice && voice.provider === 'openai' ? (voice.model ?? this.defaultModel) : this.defaultModel;
    const resolvedInstructions =
      voice && voice.provider === 'openai' ? voice.instructions : undefined;

    try {
      const requestParams: Parameters<typeof this.client.audio.speech.create>[0] = {
        model: resolvedModel,
        voice: resolvedVoice as Parameters<typeof this.client.audio.speech.create>[0]['voice'],
        input: trimmed,
        response_format: 'mp3',
      };

      // instructions は値がある場合のみ渡す
      if (resolvedInstructions !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (requestParams as any).instructions = resolvedInstructions;
      }

      const response = await withLLMRetry(() => this.client.audio.speech.create(requestParams));
      return response.arrayBuffer();
    } catch (error) {
      throw new Error(OPENAI_VOICE_ERROR_MESSAGES.SYNTHESIS_FAILED, { cause: error });
    }
  }
}
