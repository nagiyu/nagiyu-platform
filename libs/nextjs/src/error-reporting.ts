/**
 * Web API ルート用のエラー報告ラッパー
 *
 * 例外を最後に受け止める層だけが報告する方針のため、ルート入口で一度だけ報告する。
 * libs/nextjs は @nagiyu/aws に依存しないので、報告関数は呼び出し側から注入する。
 */

import { buildErrorContext, toErrorMessage, type ErrorSeverity } from '@nagiyu/common';
import { handleApiError } from './error.js';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  REPORT_FAILED: '[withApiErrorReporting] エラー報告に失敗しました',
} as const;

/** 500 以上のみを想定外の障害とみなす境界 */
const REPORT_STATUS_THRESHOLD = 500;

/**
 * 報告関数に渡す入力
 *
 * `@nagiyu/aws` の `ReportErrorEventInput` に代入できる形に揃えている。
 */
export interface ApiErrorReportInput {
  serviceId: string;
  severity: ErrorSeverity;
  title: string;
  message: string;
  context: Record<string, unknown>;
}

export interface CreateApiErrorReportingOptions {
  serviceId: string;
  /** 報告関数。投げても応答には影響しない */
  report: (input: ApiErrorReportInput) => Promise<unknown>;
  /** 例外をレスポンスへ変換する。サービス固有のエラー形式を保つために差し替える。省略時は handleApiError */
  toErrorResponse?: (error: unknown) => Response;
}

/**
 * ルートハンドラを包み、500 以上になる例外だけを報告するラッパーを生成する。
 *
 * - 正常に返したレスポンスは 4xx / 5xx でも報告しない (ハンドラ自身が返したものは想定内)
 * - 404 / 400 などにマッピングされる例外も報告しない
 * - 引数は素通しするため withAuth 等と合成できる
 *
 * @example
 * ```typescript
 * const withApiErrorReporting = createApiErrorReporting({ serviceId: 'my-service', report: reportErrorEvent });
 * export const GET = withApiErrorReporting('GET /api/items', async (request: NextRequest) => {
 *   return NextResponse.json(await listItems());
 * });
 * ```
 */
export function createApiErrorReporting(options: CreateApiErrorReportingOptions) {
  const toErrorResponse = options.toErrorResponse ?? handleApiError;

  return function withApiErrorReporting<Args extends unknown[], R extends Response>(
    title: string,
    handler: (...args: Args) => Promise<R>
  ): (...args: Args) => Promise<R | Response> {
    return async (...args: Args): Promise<R | Response> => {
      try {
        return await handler(...args);
      } catch (error) {
        const response = toErrorResponse(error);
        if (response.status >= REPORT_STATUS_THRESHOLD) {
          await reportSafely(options, title, error, args[0]);
        }
        return response;
      }
    };
  };
}

/**
 * 報告の失敗でレスポンスを失わないよう、例外を握って console.error に留める。
 */
async function reportSafely(
  options: CreateApiErrorReportingOptions,
  title: string,
  error: unknown,
  firstArg: unknown
): Promise<void> {
  try {
    await options.report({
      serviceId: options.serviceId,
      severity: 'error',
      title,
      message: toErrorMessage(error),
      context: {
        ...buildRequestContext(firstArg),
        ...buildErrorContext(error),
      },
    });
  } catch (reportError) {
    console.error(ERROR_MESSAGES.REPORT_FAILED, reportError);
  }
}

/**
 * 第 1 引数がリクエストのとき method と pathname を取り出す。
 * クエリは個人情報を含みうるため載せない。
 */
function buildRequestContext(firstArg: unknown): Record<string, unknown> {
  if (typeof Request === 'undefined' || !(firstArg instanceof Request)) {
    return {};
  }
  try {
    return { method: firstArg.method, pathname: new URL(firstArg.url).pathname };
  } catch {
    return { method: firstArg.method };
  }
}
