import { NextResponse } from 'next/server';
import { createErrorReporter, reportErrorEvent } from '@nagiyu/aws';
import { createApiErrorReporting } from '@nagiyu/nextjs';

const SERVICE_ID = 'auth';

/**
 * ルートハンドラの外 (NextAuth のコールバックなど) で例外を握る箇所から、その場で報告する。
 */
export const errorReporter = createErrorReporter({ serviceId: SERVICE_ID });

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
      console.error(title, error);
      return NextResponse.json({ error: internalErrorMessage }, { status: 500 });
    },
  })(title, handler);
}
