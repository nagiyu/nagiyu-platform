/**
 * ErrorEvent の eventId 生成ヘルパー
 *
 * 同一プラットフォーム内で衝突しない一意な ID を生成する。
 * 形式は実装非依存（呼び出し側は文字列としてのみ扱うこと）。
 */

/**
 * 新しい eventId を生成する。
 *
 * 現在の実装は `globalThis.crypto.randomUUID()` を使用する。
 * Node.js 19 以降と最新ブラウザの双方で動作するため、
 * クライアント / サーバ両方の環境にバンドルされる場合でも問題ない。
 *
 * @returns 一意な eventId 文字列
 */
export function generateEventId(): string {
  return globalThis.crypto.randomUUID();
}
