/**
 * ブラウザの現在の origin（スキーム + ホスト + ポート）を返す。
 *
 * `window.location.origin` は jsdom 環境でモック不可のため、
 * テスト時に差し替え可能なように独立した関数として切り出している。
 */
export function getOrigin(): string {
  return window.location.origin;
}
