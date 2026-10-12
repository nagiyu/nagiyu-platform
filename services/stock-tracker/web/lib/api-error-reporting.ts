/**
 * Web API ルートのエラー報告
 *
 * 例外を最後に受け止めるルート入口だけが報告する。
 * ルート内で例外を握りつぶして処理を続ける箇所は、上に例外が届かないため reportSwallowedError で報告する。
 */

import { NextResponse } from 'next/server';
import { reportErrorEvent } from '@nagiyu/aws';
import { toErrorMessage, type ErrorResponse } from '@nagiyu/common';
import { createApiErrorReporting } from '@nagiyu/nextjs';

/** 報告先のサービス識別子 */
const SERVICE_ID = 'stock-tracker';

/** 想定外エラーを返すときのエラーコード */
const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';

/** 想定外エラーのログに付ける既定のラベル */
const DEFAULT_LOG_LABEL = 'API Error:';

/**
 * handleApiError 形式のエラーレスポンスを返すルート用のラッパー
 */
export const withApiErrorReporting = createApiErrorReporting({
  serviceId: SERVICE_ID,
  report: reportErrorEvent,
});

/**
 * 例外の種類によらず 500 と固定メッセージを返すルート用のラッパーを作る
 *
 * 一部のルートはクライアントへ返すエラーの形が handleApiError と異なるため、その形を保ったまま報告だけを寄せる。
 *
 * @param message - 500 レスポンスの message
 * @param logLabel - 例外をログに出すときのラベル
 */
export function createInternalErrorReporting(
  message: string,
  logLabel: string = DEFAULT_LOG_LABEL
): ReturnType<typeof createApiErrorReporting> {
  return createApiErrorReporting({
    serviceId: SERVICE_ID,
    report: reportErrorEvent,
    toErrorResponse: (error) => {
      console.error(logLabel, error);
      return NextResponse.json({ error: INTERNAL_ERROR_CODE, message } satisfies ErrorResponse, {
        status: 500,
      });
    },
  });
}

/**
 * 例外を握りつぶして処理を続ける箇所から報告する
 *
 * 呼び出し元へ例外が届かないため、ルート入口のラッパーでは拾えない。
 *
 * @param title - 報告のタイトル
 * @param error - 握りつぶした例外
 * @param context - 原因調査に使う追加情報
 */
export async function reportSwallowedError(
  title: string,
  error: unknown,
  context: Record<string, unknown> = {}
): Promise<void> {
  await reportErrorEvent({
    serviceId: SERVICE_ID,
    severity: 'error',
    title,
    message: toErrorMessage(error),
    context: {
      ...context,
      errorName: error instanceof Error ? error.name : typeof error,
      errorStack: error instanceof Error ? error.stack : undefined,
    },
  });
}

/**
 * 工場関数で作るルート (Push 購読・VAPID 公開鍵) の onError に渡す報告関数を作る
 *
 * 工場関数のルートは内部で例外を握って 500 を返すため、入口のラッパーでは拾えない。
 *
 * @param title - 報告のタイトル
 */
export function createRouteErrorReporter(title: string): (error: unknown) => Promise<void> {
  return (error) => reportSwallowedError(title, error);
}
