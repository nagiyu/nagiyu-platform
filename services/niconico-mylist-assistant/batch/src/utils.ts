/**
 * ユーティリティ関数
 */

import { RetryConfig } from './types';
import { DEFAULT_RETRY_CONFIG } from './constants';

/**
 * 指定されたミリ秒間待機する
 *
 * @param ms 待機時間（ミリ秒）。負の値は0として扱う
 */
export async function sleep(ms: number): Promise<void> {
  const delay = Math.max(0, ms);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * リトライ機能を持つ関数実行ラッパー
 *
 * @param fn 実行する関数
 * @param config リトライ設定
 * @returns 関数の実行結果
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries, retryDelay } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        console.log(`リトライ ${attempt + 1}/${maxRetries}: ${lastError.message}`);
        await sleep(retryDelay);
      }
    }
  }

  throw lastError;
}

/**
 * 現在時刻を ISO 8601 形式で取得
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * デフォルトのマイリスト名を生成
 * 形式: "自動登録 YYYY/MM/DD HH:MM:SS"
 */
export function generateDefaultMylistName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `自動登録 ${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}
