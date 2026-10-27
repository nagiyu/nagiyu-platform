import { reportErrorEvent } from '@nagiyu/aws';
import { createApiErrorReporting } from '@nagiyu/nextjs';
import { createInternalServerErrorResponse } from '@/lib/api/responses';

/** ログ文言定数 */
export const API_ERROR_REPORTING_MESSAGES = {
  UNEXPECTED_ERROR: 'API の実行に失敗しました',
} as const;

/**
 * 想定外の例外を、クライアントへ返す既存の 500 形式へ変換する。
 *
 * 各ルートの catch でログを出していた代わりに、ここで一括して出す。
 */
export function toInternalServerErrorResponse(error: unknown): Response {
  console.error(API_ERROR_REPORTING_MESSAGES.UNEXPECTED_ERROR, { error });
  return createInternalServerErrorResponse();
}

/**
 * ルートハンドラを包み、500 になる想定外の例外だけを Admin へ報告する。
 */
export const withApiErrorReporting = createApiErrorReporting({
  serviceId: 'share-together',
  report: reportErrorEvent,
  toErrorResponse: toInternalServerErrorResponse,
});
