/**
 * Web API ルート用のエラー報告の組み立て
 *
 * 例外を最後に受け止めるのはルート入口なので、報告はここに集約する。
 */
import { NextResponse } from 'next/server';
import { ERROR_CODES, toErrorMessage, type ErrorSeverity } from '@nagiyu/common';
import { reportErrorEvent } from '@nagiyu/aws';
import { createApiErrorReporting } from '@nagiyu/nextjs';

const SERVICE_ID = 'livetalk';

const API_ERROR_REPORTING_MESSAGES = {
  REPORT_FAILED: '[reportSwallowedError] エラー報告に失敗しました',
  AUTH_PROCESSING_FAILED: '認証処理に失敗しました',
} as const;

/**
 * 想定外の例外時にクライアントへ返す 500 の本文
 */
export interface ApiFailureBody {
  error: string;
  message: string;
}

/**
 * 認証ラッパーが握った例外に返している本文。
 * 失敗の本文を持たないルートは、クライアントに見える形を保つためこれを使う。
 */
export const DEFAULT_API_FAILURE_BODY: ApiFailureBody = {
  error: ERROR_CODES.INTERNAL_ERROR,
  message: API_ERROR_REPORTING_MESSAGES.AUTH_PROCESSING_FAILED,
};

/**
 * ルートハンドラを包み、投げられた例外を 500 にして報告する。
 *
 * 失敗の本文がルートごとに異なるため、ルートから受け取る。
 * withAuth は例外を投げ直すので、このラッパーを withAuth の外側に置く。
 */
export function withApiErrorReporting<Args extends unknown[], R extends Response>(
  title: string,
  handler: (...args: Args) => Promise<R>,
  failureBody: ApiFailureBody = DEFAULT_API_FAILURE_BODY
): (...args: Args) => Promise<R | Response> {
  const wrap = createApiErrorReporting({
    serviceId: SERVICE_ID,
    report: reportErrorEvent,
    // 報告とは別にサーバーログにも原因を残す
    toErrorResponse: (error) => {
      console.error(`[${title}]`, error);
      return NextResponse.json(failureBody, { status: 500 });
    },
  });
  return wrap(title, handler);
}

/**
 * Push 系ルートのファクトリが 500 を返す直前に呼ぶ報告関数を作る。
 * ファクトリは例外を自分で握って 500 にするため、ラッパーでは報告できない。
 */
export function createPushRouteErrorReporter(title: string): (error: unknown) => Promise<void> {
  return (error) => reportSwallowedError(title, error);
}

/**
 * 例外を握って処理を続ける箇所から、その場で報告する。
 * 報告の失敗で本来の処理を止めないよう、reportErrorEvent の失敗は握る。
 */
export async function reportSwallowedError(
  title: string,
  error: unknown,
  context: Record<string, unknown> = {},
  severity: ErrorSeverity = 'error'
): Promise<void> {
  try {
    await reportErrorEvent({
      serviceId: SERVICE_ID,
      severity,
      title,
      message: toErrorMessage(error),
      context: {
        ...context,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: toErrorMessage(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    });
  } catch (reportError) {
    console.error(API_ERROR_REPORTING_MESSAGES.REPORT_FAILED, reportError);
  }
}
