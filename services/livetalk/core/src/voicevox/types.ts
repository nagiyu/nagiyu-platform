/**
 * VOICEVOX クライアント周辺の型定義。
 */

/**
 * 音声合成クライアントの抽象インターフェース。
 * 将来 VOICEVOX 以外の TTS（CoeFont 等）に差し替えることを想定。
 *
 * @see tasks/livetalk/design.md §4.4
 */
export interface IVoiceClient {
  /**
   * テキストから音声を合成する。
   *
   * @param text 合成対象のテキスト（空文字不可）
   * @param speakerId 話者 ID。省略時は実装側の既定話者を使用する（VOICEVOX 既定は 14 = 冥鳴ひまり）
   * @returns 合成された音声バイナリ（VOICEVOX の場合は WAV）
   * @throws テキストが空文字、または HTTP 呼び出しに失敗した場合
   */
  synthesize(text: string, speakerId?: number): Promise<ArrayBuffer>;
}

/**
 * VoicevoxClient の構築オプション。
 */
export interface VoicevoxClientOptions {
  /**
   * VOICEVOX エンジンの base URL（末尾スラッシュなし）。
   * 既定: `http://localhost:50021`
   * 環境変数 `VOICEVOX_URL` で上書きする運用を想定。
   */
  baseUrl?: string;
  /**
   * 既定の話者 ID。`synthesize` 呼び出し時に省略すると使われる。
   * 既定: 14（冥鳴ひまり）
   */
  defaultSpeakerId?: number;
  /**
   * HTTP リクエストのタイムアウト ms。
   * 既定: 30000（30 秒）
   * 長文の合成は時間がかかるため余裕を持たせる。
   */
  timeoutMs?: number;
  /**
   * テスト用に差し替え可能な fetch 実装。既定はグローバル `fetch`。
   */
  fetch?: typeof globalThis.fetch;
}
