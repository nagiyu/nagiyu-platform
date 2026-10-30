import { NextResponse } from 'next/server';
import { createErrorReporter, reportErrorEvent } from '@nagiyu/aws';
import { createApiErrorReporting } from '@nagiyu/nextjs';

const SERVICE_ID = 'niconico-mylist-assistant';

/**
 * 例外を握って処理を続ける箇所と、Push 系ルートのファクトリが 500 を返す直前に、その場で報告する。
 * ファクトリは例外を自前で 500 にするため、ラッパーには届かない。
 */
export const errorReporter = createErrorReporter({ serviceId: SERVICE_ID });

/**
 * 想定外エラーを handleApiError の形式で返すルート用のラッパー
 */
export const withApiErrorReporting = createApiErrorReporting({
  serviceId: SERVICE_ID,
  report: reportErrorEvent,
});

/**
 * 想定外エラーを固定の 500 レスポンスで返すルート用のラッパーを作る
 *
 * クライアントへ返す body の形はルートごとに異なり、変えると呼び出し側が壊れるため、
 * ルートが渡した body をそのまま返す。
 *
 * @param logLabel console.error に出すラベル
 * @param body 500 で返す body
 * @param toLogDetail ログに出す内容。認証情報を含みうる例外はメッセージだけに絞るために差し替える
 */
export function createWithApiErrorReportingBody(
  logLabel: string,
  body: unknown,
  toLogDetail: (error: unknown) => unknown = (error) => error
) {
  return createApiErrorReporting({
    serviceId: SERVICE_ID,
    report: reportErrorEvent,
    toErrorResponse: (error) => {
      console.error(logLabel, toLogDetail(error));
      return NextResponse.json(body, { status: 500 });
    },
  });
}
