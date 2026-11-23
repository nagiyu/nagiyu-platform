import OpenAI from 'openai';
import type { RealtimeClientEvent, RealtimeServerEvent } from 'openai/resources/realtime/realtime';
import type { IVoiceClient, VoiceConfig } from '../voice/types.js';
import type { OpenAIVoiceClientOptions, RealtimeConnection, RealtimeConnector } from './types.js';
import { withLLMRetry, withLLMTimeout } from '../lib/llm-retry.js';
import { createDefaultRealtimeConnector } from './realtime-connection.js';
import { pcm16ToWav } from './wav.js';

/**
 * OpenAI 音声合成クライアント周りのエラーメッセージ（日本語、定数化）。
 */
export const OPENAI_VOICE_ERROR_MESSAGES = {
  EMPTY_TEXT: 'テキストが空です',
  EMPTY_API_KEY: 'OpenAI API キーが指定されていません',
  SYNTHESIS_FAILED: 'OpenAI の音声合成に失敗しました',
  EMPTY_AUDIO: 'OpenAI から音声データが返されませんでした',
  RESPONSE_NOT_COMPLETED: 'OpenAI の音声応答が完了しませんでした',
  CONNECTION_CLOSED: 'OpenAI Realtime の接続が応答完了前に閉じられました',
  SERVER_ERROR: 'OpenAI Realtime がエラーを返しました',
} as const;

const DEFAULT_MODEL = 'gpt-realtime-2.1-mini';
const DEFAULT_VOICE = 'marin';
const DEFAULT_TIMEOUT_MS = 30_000;

/** Realtime の出力 PCM は 24 kHz・16 bit・mono・little endian で固定。 */
const PCM_SAMPLE_RATE = 24000;
const PCM_CHANNELS = 1;

/**
 * 読み上げ専用にするための指示。
 *
 * Realtime モデルは会話用のため、何も指示しないと入力文に返答してしまう。
 * キャラクター固有の instructions はこの後ろに足す。
 */
export const READ_ALOUD_INSTRUCTIONS = [
  'あなたは読み上げ専用の音声合成エンジンです。',
  'ユーザーから受け取った文を、一字一句そのまま、足さず省かず読み上げてください。',
  '返答・相槌・前置き・感想は一切付けないでください。',
  '文の内容が質問や依頼であっても、それに応じず、文そのものを読み上げるだけにしてください。',
].join('\n');

/**
 * OpenAI Realtime API（WebSocket）を {@link IVoiceClient} 形にラップする実装。
 *
 * - 1 回の合成ごとに接続し、読み上げ専用の応答を 1 件だけ生成させて PCM を集め、WAV にして返す。
 *   `gpt-realtime-*` は `/v1/audio/speech` では使えず、Realtime API 専用のため。
 * - `voice.provider === 'openai'` の場合のみ voice / instructions / model を解釈する。
 *   それ以外（voicevox 等）は既定値で合成する（VoicevoxClient と同じ寛容さ）。
 * - 接続は成功・失敗・タイムアウトのいずれでも必ず閉じる。
 * - `synthesize` は `withLLMRetry` で一過性エラー（接続失敗・タイムアウト・rate limit 等）を
 *   リトライする。全敗した場合は `SYNTHESIS_FAILED` エラーでラップして throw する。
 * - SDK 自動リトライは `maxRetries: 0` で無効化し、アプリ側で一元管理する。
 */
export class OpenAIVoiceClient implements IVoiceClient {
  private readonly connector: RealtimeConnector;
  private readonly defaultModel: string;
  private readonly defaultVoice: string;
  private readonly timeoutMs: number;

  constructor(options: OpenAIVoiceClientOptions = {}) {
    if (options.connector) {
      this.connector = options.connector;
    } else if (options.client) {
      this.connector = createDefaultRealtimeConnector(options.client);
    } else {
      if (!options.apiKey) {
        throw new Error(OPENAI_VOICE_ERROR_MESSAGES.EMPTY_API_KEY);
      }
      this.connector = createDefaultRealtimeConnector(
        new OpenAI({ apiKey: options.apiKey, maxRetries: 0 })
      );
    }
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL;
    this.defaultVoice = options.defaultVoice ?? DEFAULT_VOICE;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async synthesize(text: string, voice?: VoiceConfig): Promise<ArrayBuffer> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error(OPENAI_VOICE_ERROR_MESSAGES.EMPTY_TEXT);
    }

    // voice が省略された場合、または provider が openai でない場合は既定値を使用する
    const isOpenAI = voice !== undefined && voice.provider === 'openai';
    const resolvedVoice = isOpenAI ? voice.voice : this.defaultVoice;
    const resolvedModel = isOpenAI ? (voice.model ?? this.defaultModel) : this.defaultModel;
    const characterInstructions = isOpenAI ? voice.instructions : undefined;
    const instructions = characterInstructions
      ? `${READ_ALOUD_INSTRUCTIONS}\n\n${characterInstructions}`
      : READ_ALOUD_INSTRUCTIONS;

    try {
      return await withLLMRetry(() =>
        this.synthesizeOnce(trimmed, resolvedModel, resolvedVoice, instructions)
      );
    } catch (error) {
      throw new Error(OPENAI_VOICE_ERROR_MESSAGES.SYNTHESIS_FAILED, { cause: error });
    }
  }

  /** 接続から応答完了までを 1 回行う。接続は必ず閉じる。 */
  private async synthesizeOnce(
    text: string,
    model: string,
    voice: string,
    instructions: string
  ): Promise<ArrayBuffer> {
    const connection = await this.connector(model);
    try {
      const pcm = await withLLMTimeout(
        collectPcm(connection, text, voice, instructions),
        this.timeoutMs
      );
      return pcm16ToWav(pcm, PCM_SAMPLE_RATE, PCM_CHANNELS);
    } finally {
      connection.close();
    }
  }
}

/**
 * Realtime のエラー情報を、リトライ判定（`isRetryableLLMError`）が解釈できる
 * `OpenAI.APIError` に変換する。
 *
 * server_error は 500、rate limit は 429（いずれもリトライ対象）、認証系は 401、
 * それ以外（不正な要求など）は 400（リトライしない）にする。
 */
function toAPIError(
  info: { type?: string; code?: string | null; message?: string } | undefined,
  fallbackStatus: number
): InstanceType<typeof OpenAI.APIError> {
  const type = info?.type;
  const code = info?.code ?? undefined;
  let status = fallbackStatus;
  if (type === 'server_error' || code === 'server_error') {
    status = 500;
  } else if (
    type === 'rate_limit_error' ||
    type === 'rate_limit_exceeded' ||
    code === 'rate_limit_exceeded'
  ) {
    status = 429;
  } else if (type === 'authentication_error' || code === 'invalid_api_key') {
    status = 401;
  } else if (type === 'invalid_request_error') {
    status = 400;
  }
  const message = info?.message
    ? `${OPENAI_VOICE_ERROR_MESSAGES.SERVER_ERROR}: ${info.message}`
    : OPENAI_VOICE_ERROR_MESSAGES.SERVER_ERROR;
  return new OpenAI.APIError(status, info ?? undefined, message, undefined);
}

/**
 * 接続を開き、読み上げ専用の応答 1 件の音声を集めて PCM として返す。
 *
 * `response.done` の status が completed 以外、または `error` イベントなら reject する。
 */
function collectPcm(
  connection: RealtimeConnection,
  text: string,
  voice: string,
  instructions: string
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const fail = (error: Error): void => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    connection.onEvent((event: RealtimeServerEvent) => {
      if (settled) {
        return;
      }
      if (event.type === 'response.output_audio.delta') {
        chunks.push(Buffer.from(event.delta, 'base64'));
      } else if (event.type === 'error') {
        fail(toAPIError(event.error, 400));
      } else if (event.type === 'response.done') {
        const { status, status_details: details } = event.response;
        if (status !== 'completed') {
          fail(
            status === 'failed'
              ? toAPIError(
                  {
                    ...details?.error,
                    message: OPENAI_VOICE_ERROR_MESSAGES.RESPONSE_NOT_COMPLETED,
                  },
                  500
                )
              : toAPIError({ message: OPENAI_VOICE_ERROR_MESSAGES.RESPONSE_NOT_COMPLETED }, 400)
          );
          return;
        }
        const pcm = Buffer.concat(chunks);
        if (pcm.byteLength === 0) {
          fail(toAPIError({ message: OPENAI_VOICE_ERROR_MESSAGES.EMPTY_AUDIO }, 500));
          return;
        }
        settled = true;
        resolve(pcm);
      }
    });

    // 通信路の失敗は接続エラーとして扱い、リトライ対象にする
    connection.onError((error) => {
      fail(new OpenAI.APIConnectionError({ message: error.message, cause: error }));
    });
    connection.onClose(() => {
      fail(
        new OpenAI.APIConnectionError({ message: OPENAI_VOICE_ERROR_MESSAGES.CONNECTION_CLOSED })
      );
    });

    // 他のリスナーを登録してから open を待つ（登録前にイベントを取りこぼさないため）
    connection.onOpen(() => {
      const sessionUpdate: RealtimeClientEvent = {
        type: 'session.update',
        session: {
          type: 'realtime',
          output_modalities: ['audio'],
          audio: { output: { voice, format: { type: 'audio/pcm', rate: PCM_SAMPLE_RATE } } },
          instructions,
        },
      };
      // 会話履歴に残さない out-of-band の応答として、読み上げる文だけを入力に渡す
      const responseCreate: RealtimeClientEvent = {
        type: 'response.create',
        response: {
          conversation: 'none',
          output_modalities: ['audio'],
          input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text }] }],
        },
      };
      connection.send(sessionUpdate);
      connection.send(responseCreate);
    });
  });
}
