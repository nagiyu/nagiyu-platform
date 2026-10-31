/**
 * ErrorEventReader インタフェース定義
 *
 * Admin Web で永続化済みエラーイベントを参照するための読み取り専用 API。
 */

import { InvalidInputError, type ErrorEvent } from '@nagiyu/common';

/**
 * 一覧取得時のクエリパラメータ
 */
export type ListErrorEventsQuery = {
  /** サービス ID で絞り込み（未指定なら全サービス） */
  serviceId?: string;
  /** 開始時刻（ISO-8601、含む）。SK の範囲比較に使うため ISO 文字列で受ける */
  from?: string;
  /** 終了時刻（ISO-8601、含む）。SK の範囲比較に使うため ISO 文字列で受ける */
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
   * eventId と occurredAt (epoch ミリ秒) を指定して 1 件取得する。
   * 該当が無い、もしくは TTL で削除済みの場合は null を返す。
   *
   * @throws InvalidEntityDataError 保存データが読めないとき
   */
  findById(eventId: string, occurredAt: number, serviceId: string): Promise<ErrorEvent | null>;
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
  INVALID_RANGE: 'from は to よりも前の時刻である必要があります',
} as const;

/**
 * from が to より後の範囲指定を拒否する。
 *
 * 実装ごとに判定がずれないよう、DynamoDB 版と in-memory 版で共有する。
 *
 * @throws InvalidInputError from が to より後のとき
 */
export function assertValidRange(query: Pick<ListErrorEventsQuery, 'from' | 'to'>): void {
  if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) {
    throw new InvalidInputError(ERROR_MESSAGES.INVALID_RANGE);
  }
}

/**
 * 不透明な cursor 文字列に DynamoDB の LastEvaluatedKey をエンコードする。
 */
export function encodeCursor(lastEvaluatedKey: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf-8').toString('base64url');
}

/**
 * cursor 文字列から DynamoDB の LastEvaluatedKey をデコードする。
 *
 * @throws InvalidInputError cursor が不正な場合
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
    throw new InvalidInputError(ERROR_MESSAGES.INVALID_CURSOR);
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
