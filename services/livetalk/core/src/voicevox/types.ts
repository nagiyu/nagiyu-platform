/**
 * VOICEVOX クライアント固有の型定義。
 * プロバイダ非依存の IVoiceClient / VoiceConfig は voice/types.ts で定義する。
 */

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
