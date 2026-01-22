/**
 * リトライロジックユーティリティ
 * 失敗時に指数バックオフでリトライを実行する
 */

import { logger } from './logger.js';

/**
 * リトライオプション
 */
export interface RetryOptions {
  /**
   * 最大リトライ回数
   */
  maxRetries: number;

  /**
   * 初期待機時間（ミリ秒）
   */
  initialDelayMs: number;

  /**
   * 指数バックオフの倍率
   */
  backoffMultiplier: number;

  /**
   * リトライ対象エラーの判定関数（省略時は全エラーをリトライ）
   */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * デフォルトのリトライオプション
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
};

/**
 * 指数バックオフでリトライを実行する
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // リトライ対象エラーかチェック
      if (opts.shouldRetry && !opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // 最大リトライ回数に達した場合は例外をスロー
      if (attempt === opts.maxRetries) {
        logger.error('リトライ回数が上限に達しました', {
          attempt: attempt + 1,
          error: lastError.message,
        });
        throw lastError;
      }

      // 次回リトライまで待機
      const delayMs = opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt);
      logger.warn('処理が失敗したため、リトライします', {
        attempt: attempt + 1,
        delayMs,
        error: lastError.message,
      });

      await sleep(delayMs);
    }
  }

  // ここには到達しないはずだが、型安全のため
  throw lastError || new Error('予期しないエラーが発生しました');
}

/**
 * 指定時間待機する
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
