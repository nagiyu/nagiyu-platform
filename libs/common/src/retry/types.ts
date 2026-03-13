import type { Logger } from '../logger/types.js';

/**
 * リトライ処理で利用するロガー型
 */
export type RetryLogger = Pick<Logger, 'warn' | 'error'>;

/**
 * バックエンド向けリトライオプション
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
   * 指数バックオフ倍率
   */
  backoffMultiplier: number;

  /**
   * リトライ対象エラー判定
   */
  shouldRetry?: (error: Error) => boolean;

  /**
   * カスタムロガー
   */
  logger?: RetryLogger;
}
