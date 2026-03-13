import { sleep } from '../api/client.js';
import { logger } from '../logger/logger.js';
import type { RetryOptions, RetryLogger } from './types.js';

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
  const retryLogger: RetryLogger = opts.logger ?? logger;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (opts.shouldRetry && !opts.shouldRetry(lastError)) {
        throw lastError;
      }

      if (attempt === opts.maxRetries) {
        retryLogger.error('リトライ回数が上限に達しました', {
          attempt: attempt + 1,
          error: lastError.message,
        });
        throw lastError;
      }

      const delayMs = opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt);
      retryLogger.warn('処理が失敗したため、リトライします', {
        attempt: attempt + 1,
        delayMs,
        error: lastError.message,
      });
      await sleep(delayMs);
    }
  }

  throw lastError || new Error('予期しないエラーが発生しました');
}
