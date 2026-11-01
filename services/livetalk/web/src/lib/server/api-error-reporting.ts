/**
 * Web API ルート用のエラー報告の組み立て
 *
 * 例外を最後に受け止めるのはルート入口なので、報告はここに集約する。
 */
import { NextResponse } from 'next/server';
import { ERROR_CODES } from '@nagiyu/common';
import { createErrorReporter, reportErrorEvent } from '@nagiyu/aws';
import { createApiErrorReporting } from '@nagiyu/nextjs';

const SERVICE_ID = 'livetalk';

/**
 * 例外を握って処理を続ける箇所と、Push 系ルートのファクトリが 500 を返す直前に、その場で報告する。
 * ファクトリは例外を自分で握って 500 にするため、ラッパーでは報告できない。
 */
export const errorReporter = createErrorReporter({ serviceId: SERVICE_ID });

const API_ERROR_REPORTING_MESSAGES = {
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
