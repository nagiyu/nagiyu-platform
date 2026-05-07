/**
 * ErrorEventReader インタフェース定義
 *
 * Admin Web で永続化済みエラーイベントを参照するための読み取り専用 API。
 */

import type { ErrorEvent } from '@nagiyu/common';

/**
 * 一覧取得時のクエリパラメータ
 */
export type ListErrorEventsQuery = {
  /** サービス ID で絞り込み（未指定なら全サービス） */
  serviceId?: string;
  /** 開始時刻（ISO-8601、含む） */
  from?: string;
  /** 終了時刻（ISO-8601、含む） */
  to?: string;
  /** 1 ページの最大件数（既定 50、最大 100） */
  limit?: number;
  /** ページング cursor（前回の応答で受け取った nextCursor） */
  cursor?: string;
};

/**
 * 一覧取得の結果
 */
export type ListErrorEventsResult = {
  items: ErrorEvent[];
  /** 次ページがある場合の cursor、なければ null */
  nextCursor: string | null;
};

/**
 * エラーイベント参照 API
 */
export interface ErrorEventReader {
  /**
   * 条件に合致するエラーイベントを時系列降順で取得する。
   */
  list(query: ListErrorEventsQuery): Promise<ListErrorEventsResult>;

  /**
   * eventId と occurredAt を指定して 1 件取得する。
   * 該当が無い、もしくは TTL で削除済みの場合は null を返す。
   */
  findById(eventId: string, occurredAt: string, serviceId: string): Promise<ErrorEvent | null>;
}

/**
 * 既定の最大取得件数
 */
export const DEFAULT_LIST_LIMIT = 50;

/**
 * 上限となる最大取得件数
 */
export const MAX_LIST_LIMIT = 100;

const ERROR_MESSAGES = {
  INVALID_CURSOR: 'cursor が不正な形式です',
} as const;

/**
 * 不透明な cursor 文字列に DynamoDB の LastEvaluatedKey をエンコードする。
 */
export function encodeCursor(lastEvaluatedKey: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf-8').toString('base64url');
}

/**
 * cursor 文字列から DynamoDB の LastEvaluatedKey をデコードする。
 *
 * @throws cursor が不正な場合
 */
export function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('parsed result is not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(ERROR_MESSAGES.INVALID_CURSOR);
  }
}

/**
 * limit を既定値・上限に丸める。
 */
export function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIST_LIMIT;
  }
  if (limit < 1) {
    return 1;
  }
  if (limit > MAX_LIST_LIMIT) {
    return MAX_LIST_LIMIT;
  }
  return Math.floor(limit);
}
