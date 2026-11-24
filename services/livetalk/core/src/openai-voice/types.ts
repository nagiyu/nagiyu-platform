import type OpenAI from 'openai';
import type { RealtimeClientEvent, RealtimeServerEvent } from 'openai/resources/realtime/realtime';

/**
 * Realtime API との 1 回分の接続。
 *
 * 合成ロジックを WebSocket 実装から切り離し、テストで差し替えられるようにするための最小形。
 */
export interface RealtimeConnection {
  /** クライアントイベントを送る (open 後に呼ぶ) */
  send(event: RealtimeClientEvent): void;
  /** 接続を閉じる。複数回呼んでも安全であること */
  close(): void;
  /** 接続が確立したときのリスナーを登録する */
  onOpen(listener: () => void): void;
  /** サーバーイベント受信時のリスナーを登録する (`error` イベントも含む) */
  onEvent(listener: (event: RealtimeServerEvent) => void): void;
  /** 通信路の失敗時のリスナーを登録する */
  onError(listener: (error: Error) => void): void;
  /** 接続が閉じたときのリスナーを登録する */
  onClose(listener: () => void): void;
}

/**
 * 指定モデルで Realtime 接続を開始する関数。
 *
 * 返す接続は、open / error / close がリスナー登録前に起きていても、後から登録された
 * リスナーへ渡せること。呼び出し側は接続を受け取った後に await を挟んでもよい。
 */
export type RealtimeConnector = (model: string) => Promise<RealtimeConnection>;

/**
 * OpenAIVoiceClient の構築オプション。
 * client を渡す場合は apiKey 不要（テスト・差し替え用）。
 */
export interface OpenAIVoiceClientOptions {
  /** OpenAI API キー。`client` を渡す場合は不要 */
  apiKey?: string;
  /** テスト・差し替え用に既存の OpenAI クライアントを注入できる */
  client?: OpenAI;
  /** テスト・差し替え用に Realtime 接続の作り方を注入できる。省略時は SDK のネイティブ WebSocket */
  connector?: RealtimeConnector;
  /**
   * 既定で使用するモデル名。省略時は 'gpt-realtime-2.1-mini'。
   * synthesize 呼び出し時に voice.model を指定した場合はそちらが優先される。
   */
  defaultModel?: string;
  /**
   * 既定で使用する voice 名。省略時は 'marin'。
   * synthesize 呼び出し時に voice.voice を指定した場合はそちらが優先される。
   */
  defaultVoice?: string;
  /** 1 回の合成 (接続から応答完了まで) のタイムアウト (ミリ秒)。省略時は 30000 */
  timeoutMs?: number;
}
