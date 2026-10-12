import { reportErrorEvent } from '@nagiyu/aws';
import { toErrorMessage } from '@nagiyu/common';
import { createApiErrorReporting, createErrorResponse } from '@nagiyu/nextjs';

const SERVICE_ID = 'admin';

const ERROR_MESSAGES = {
  REPORT_FAILED: '[createRouteErrorReporter] エラー報告に失敗しました',
} as const;

/**
 * ルートハンドラを包み、想定外の例外を報告して 500 を返す。
 *
 * 500 の body はルートごとに異なるため、クライアントに返す文言は呼び出し側から受け取る。
 * 例外のログはここで出すので、ルート側で console.error する必要はない。
 */
export function withApiErrorReporting<Args extends unknown[], R extends Response>(
  title: string,
  handler: (...args: Args) => Promise<R>,
  internalErrorMessage: string
) {
  return createApiErrorReporting({
    serviceId: SERVICE_ID,
    report: reportErrorEvent,
    toErrorResponse: (error) => {
      console.error(title, { error });
      return createErrorResponse(500, 'INTERNAL_ERROR', internalErrorMessage);
    },
  })(title, handler);
}

/**
 * lib のルートファクトリが自前で 500 を返すため、ラッパーでは拾えない例外を報告する onError を作る。
 *
 * 報告の失敗でレスポンスを失わないよう、例外は握って console.error に留める。
 */
export function createRouteErrorReporter(title: string) {
  return async (error: unknown): Promise<void> => {
    try {
      await reportErrorEvent({
        serviceId: SERVICE_ID,
        severity: 'error',
        title,
        message: toErrorMessage(error),
        context: { errorStack: error instanceof Error ? error.stack : undefined },
      });
    } catch (reportError) {
      console.error(ERROR_MESSAGES.REPORT_FAILED, reportError);
    }
  };
}
