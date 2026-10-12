import { reportErrorEvent } from '@nagiyu/aws';
import { createApiErrorReporting } from '@nagiyu/nextjs';
import { NextResponse } from 'next/server';

/** Admin へ報告するときのサービス識別子。バッチ側の報告と同じ値に揃える */
export const SERVICE_ID = 'quick-clip';

/**
 * ルートハンドラを包み、想定外の例外を 500 に変換して Admin へ報告する。
 *
 * 500 の message がルートごとに異なるため、呼び出し側から受け取って
 * クライアントへ返すレスポンスの形を保つ。
 *
 * @param title - 報告のタイトル
 * @param internalServerErrorMessage - 500 レスポンスの message
 * @param handler - 例外を握らずに throw するルートハンドラ
 */
export function withApiErrorReporting<Args extends unknown[], R extends Response>(
  title: string,
  internalServerErrorMessage: string,
  handler: (...args: Args) => Promise<R>
): (...args: Args) => Promise<R | Response> {
  return createApiErrorReporting({
    serviceId: SERVICE_ID,
    report: reportErrorEvent,
    toErrorResponse: (error) => {
      // 報告の成否にかかわらず調査用のログを残す
      console.error(`[${title}]`, error);
      return NextResponse.json(
        { error: 'INTERNAL_SERVER_ERROR', message: internalServerErrorMessage },
        { status: 500 }
      );
    },
  })(title, handler);
}
