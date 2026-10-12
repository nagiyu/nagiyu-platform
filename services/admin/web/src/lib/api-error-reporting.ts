import { reportErrorEvent } from '@nagiyu/aws';
import { createApiErrorReporting, createErrorResponse } from '@nagiyu/nextjs';

const SERVICE_ID = 'admin';

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
