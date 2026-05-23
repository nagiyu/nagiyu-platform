import type { ErrorSeverity } from '@nagiyu/common';
import { reportErrorEvent } from './report.js';

export interface WithErrorReportingOptions {
  serviceId: string;
  severity?: ErrorSeverity;
  title: string;
  context?: Record<string, unknown>;
  exitOnError?: boolean;
  runIfNotTest?: boolean;
  onSuccess?: () => Promise<void>;
  onError?: (error: unknown) => Promise<void>;
}

/**
 * Lambda / Batch エントリポイントの定型エラーハンドリングラッパー。
 *
 * - catch 時に reportErrorEvent を呼び、context に error の stack / message を自動マージする
 * - exitOnError: true のとき process.exit(1) で終了する（throw しない）
 * - runIfNotTest: true のとき NODE_ENV !== 'test' のときのみ fn を実行する
 * - onError: catch 内の追加副作用（ジョブステータス FAILED 更新など）を渡す
 */
export async function withErrorReporting<T>(
  opts: WithErrorReportingOptions,
  fn: () => Promise<T>
): Promise<T | undefined> {
  const run = async (): Promise<T | undefined> => {
    try {
      const result = await fn();
      if (opts.onSuccess) {
        await opts.onSuccess();
      }
      return result;
    } catch (error) {
      const errorContext: Record<string, unknown> = {
        ...opts.context,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      };

      await reportErrorEvent({
        serviceId: opts.serviceId,
        severity: opts.severity ?? 'error',
        title: opts.title,
        message: error instanceof Error ? error.message : String(error),
        context: errorContext,
      });

      if (opts.onError) {
        await opts.onError(error);
      }

      if (opts.exitOnError) {
        process.exit(1);
      }
      throw error;
    }
  };

  if (opts.runIfNotTest) {
    if (process.env.NODE_ENV !== 'test') {
      return run();
    }
    return undefined;
  }

  return run();
}
