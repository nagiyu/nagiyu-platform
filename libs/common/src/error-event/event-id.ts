/**
 * ErrorEvent の eventId 生成ヘルパー
 *
 * 同一プラットフォーム内で衝突しない一意な ID を生成する。
 * 形式は実装非依存（呼び出し側は文字列としてのみ扱うこと）。
 */

import { randomUUID } from 'node:crypto';

/**
 * 新しい eventId を生成する。
 *
 * 現在の実装は UUID v4 を使用するが、将来の変更に備えて呼び出し側は
 * 形式に依存しないこと。
 *
 * @returns 一意な eventId 文字列
 */
export function generateEventId(): string {
  return randomUUID();
}
