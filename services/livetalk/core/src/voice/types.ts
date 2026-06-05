/**
 * TTS（音声合成）プロバイダ非依存のポート定義。
 */

/**
 * キャラが用いる音声の選択情報。プロバイダごとに必要項目が異なるため discriminated union とし、
 * 各 IVoiceClient 実装は自分の provider のみ解釈する。将来 openai 等の variant を追加する。
 */
export type VoiceConfig = {
  provider: 'voicevox';
  /** VOICEVOX の話者 ID（例: 14 = 冥鳴ひまり） */
  speakerId: number;
};
// 将来: | { provider: 'openai'; voice: string; instructions?: string; model?: string }

/**
 * 音声合成（TTS）クライアントの抽象インターフェース。
 * プロバイダ（VOICEVOX / OpenAI 等）に依存しない共通ポート。
 */
export interface IVoiceClient {
  /**
   * テキストから音声を合成する。voice 省略時は実装側の既定音声。
   * 戻り値はブラウザで再生可能な音声バイナリ。
   *
   * @param text 合成対象のテキスト（空文字不可）
   * @param voice 音声設定。省略時は実装側の既定音声を使用する
   * @returns 合成された音声バイナリ
   * @throws テキストが空文字、または HTTP 呼び出しに失敗した場合
   */
  synthesize(text: string, voice?: VoiceConfig): Promise<ArrayBuffer>;
}
