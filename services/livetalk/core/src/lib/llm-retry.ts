import OpenAI from 'openai';
import { withRetry } from '@nagiyu/common';

/**
 * LLM 呼び出し共通のリトライ設定。
 *
 * 最大 3 回リトライし、初回待機 1 秒から指数バックオフ（倍率 2）で増加する。
 */
export const LLM_RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
} as const;

/**
 * LLM リトライモジュール内のエラーメッセージ定数。
 */
export const LLM_RETRY_ERROR_MESSAGES = {
  TIMEOUT: 'LLM API 呼び出しがタイムアウトしました',
} as const;

/**
 * 自前タイムアウトを一過性エラーとして識別するためのエラークラス。
 *
 * `isRetryableLLMError` はこのクラスのインスタンスをリトライ対象と判定する。
 */
export class LLMTimeoutError extends Error {
  /** エラー種別の識別子（`'LLMTimeoutError'`）。 */
  public override readonly name = 'LLMTimeoutError';

  constructor(message: string) {
    super(message);
  }
}

/**
 * 一過性エラーかどうかを判定する。
 *
 * OpenAI SDK の既定リトライ意味論に準拠し、以下を一過性（リトライ可能）と判定する：
 * - `LLMTimeoutError`（自前タイムアウト）
 * - `OpenAI.APIConnectionError`（接続エラー・接続タイムアウト。`APIConnectionTimeoutError` を含む）
 * - `OpenAI.APIError` で `status` が `408 | 409 | 429 | 500+`
 *
 * それ以外（`400 | 401 | 403 | 404`、自前バリデーションエラー等）は恒久的エラーとして false を返す。
 */
export function isRetryableLLMError(error: Error): boolean {
  // 自前タイムアウトは一過性
  if (error instanceof LLMTimeoutError) {
    return true;
  }

  // 接続エラー（APIConnectionTimeoutError も含む）は一過性
  // APIConnectionError は status が undefined のため、APIError の前に判定する
  if (error instanceof OpenAI.APIConnectionError) {
    return true;
  }

  // HTTP ステータスコードによる判定
  if (error instanceof OpenAI.APIError) {
    const { status } = error;
    if (typeof status !== 'number') {
      // status が undefined（APIUserAbortError 等）は対象外
      return false;
    }
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  // 上記以外（恒久的エラー・自前バリデーションエラー等）
  return false;
}

/**
 * 指定のタイムアウト時間内に Promise が解決しなければ `LLMTimeoutError` を throw する。
 *
 * `clearTimeout` は finally で確実に実行する。
 *
 * @param promise - 待機対象の Promise
 * @param timeoutMs - タイムアウトまでのミリ秒
 * @param message - タイムアウト時のエラーメッセージ（省略時は {@link LLM_RETRY_ERROR_MESSAGES.TIMEOUT}）
 */
export async function withLLMTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string = LLM_RETRY_ERROR_MESSAGES.TIMEOUT
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new LLMTimeoutError(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * LLM API 呼び出しを一過性エラーに対してリトライする薄いラッパー関数。
 *
 * `LLM_RETRY_OPTIONS` と `isRetryableLLMError` を使って `withRetry` を呼び出す。
 * 恒久的エラー（`400`, `401`, `403`, `404` 等）は即時 throw される。
 *
 * @param fn - リトライ対象の非同期処理
 */
export function withLLMRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, { ...LLM_RETRY_OPTIONS, shouldRetry: isRetryableLLMError });
}
