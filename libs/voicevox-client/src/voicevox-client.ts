import type { IVoiceClient, VoicevoxClientOptions } from './types.js';

/**
 * クライアント周りのエラーメッセージ（日本語、定数化）。
 */
export const VOICEVOX_ERROR_MESSAGES = {
  EMPTY_TEXT: 'テキストが空です',
  AUDIO_QUERY_FAILED: 'VOICEVOX の audio_query 呼び出しに失敗しました',
  SYNTHESIS_FAILED: 'VOICEVOX の synthesis 呼び出しに失敗しました',
  TIMEOUT: 'VOICEVOX の呼び出しがタイムアウトしました',
} as const;

const DEFAULT_BASE_URL = 'http://localhost:50021';
const DEFAULT_SPEAKER_ID = 14; // 冥鳴ひまり
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * VOICEVOX エンジン（HTTP API）クライアント。
 *
 * `/audio_query` → `/synthesis` の 2 段呼び出しで WAV を取得する。
 * 将来共通サービス化したときに `baseUrl` だけ差し替えられるようにしてある。
 *
 * @see https://voicevox.github.io/voicevox_engine/api/
 * @see tasks/livetalk/external-design.md ADR-003 / ADR-004
 */
export class VoicevoxClient implements IVoiceClient {
  private readonly baseUrl: string;
  private readonly defaultSpeakerId: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: VoicevoxClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.defaultSpeakerId = options.defaultSpeakerId ?? DEFAULT_SPEAKER_ID;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  public async synthesize(text: string, speakerId?: number): Promise<ArrayBuffer> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error(VOICEVOX_ERROR_MESSAGES.EMPTY_TEXT);
    }

    const speaker = speakerId ?? this.defaultSpeakerId;
    const audioQuery = await this.callAudioQuery(trimmed, speaker);
    return this.callSynthesis(audioQuery, speaker);
  }

  private async callAudioQuery(text: string, speaker: number): Promise<unknown> {
    const url = `${this.baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`;
    const response = await this.fetchWithTimeout(url, { method: 'POST' });
    if (!response.ok) {
      throw new Error(
        `${VOICEVOX_ERROR_MESSAGES.AUDIO_QUERY_FAILED}: HTTP ${response.status}`
      );
    }
    return response.json();
  }

  private async callSynthesis(audioQuery: unknown, speaker: number): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}/synthesis?speaker=${speaker}`;
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audioQuery),
    });
    if (!response.ok) {
      throw new Error(
        `${VOICEVOX_ERROR_MESSAGES.SYNTHESIS_FAILED}: HTTP ${response.status}`
      );
    }
    return response.arrayBuffer();
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(VOICEVOX_ERROR_MESSAGES.TIMEOUT, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
