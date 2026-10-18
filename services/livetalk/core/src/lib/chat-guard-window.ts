/**
 * チャットのレート制限ウィンドウに関する純粋な計算。
 * DynamoDB 実装と InMemory 実装で同じバケット・同じ TTL を使うため共有する。
 */

import type { RateLimitWindow } from '../repositories/chat-guard.repository.interface.js';

/**
 * ウィンドウのバケット文字列を算出する。
 * - '1m': エポック分（floor(nowMs / 60000)）
 * - '1h': エポック時（floor(nowMs / 3600000)）
 */
export function computeBucket(window: RateLimitWindow, nowMs: number): string {
  if (window === '1m') return String(Math.floor(nowMs / 60_000));
  return String(Math.floor(nowMs / 3_600_000));
}

/**
 * ウィンドウ満了 Unix 秒（アイテムの TTL 用）を算出する。
 * バッファを加算してウィンドウ直後に即座に消えないようにする。
 * - '1m': 次の分の開始 Unix 秒 + 120s バッファ
 * - '1h': 次の時間の開始 Unix 秒 + 7200s バッファ
 */
export function computeWindowTtlSec(window: RateLimitWindow, nowMs: number): number {
  if (window === '1m') {
    return (Math.floor(nowMs / 60_000) + 1) * 60 + 120;
  }
  return (Math.floor(nowMs / 3_600_000) + 1) * 3_600 + 7_200;
}

/**
 * ロックアイテムの TTL（Unix 秒）を算出する。
 * ロック満了の少し後に自動削除されるよう余裕（300 秒）を持たせる。
 */
export function computeLockTtlSec(expiresAtMs: number): number {
  return Math.floor(expiresAtMs / 1000) + 300;
}
