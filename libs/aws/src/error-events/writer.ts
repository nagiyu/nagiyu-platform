/**
 * ErrorEventWriter インタフェース定義
 *
 * プラットフォーム上で発生したエラーイベントを永続化する書き込み専用 API。
 * DynamoDB / in-memory の両方の実装を切り替え可能にするため抽象化する。
 */

import type { ErrorEvent } from '@nagiyu/common';

/**
 * エラーイベント書き込み API
 */
export interface ErrorEventWriter {
  /**
   * エラーイベントを 1 件書き込む。
   *
   * @param event - 永続化するエラーイベント
   * @throws データベース書き込みに失敗した場合
   */
  put(event: ErrorEvent): Promise<void>;
}

/**
 * エラーイベントテーブルの DynamoDB キー
 */
export type ErrorEventKey = {
  serviceId: string;
  occurredAt: string;
  eventId: string;
};

/**
 * DynamoDB Item の Type 値
 */
export const ERROR_EVENT_ENTITY_TYPE = 'ErrorEvent';

/**
 * 全件横断クエリ用 GSI1 のパーティションキー値（固定）
 */
export const ERROR_EVENT_GSI1_PK = 'ERROR_EVENT_ALL';

/**
 * TTL の保持期間（日数）
 */
export const ERROR_EVENT_TTL_DAYS = 180;

/**
 * PK プレフィックス
 */
export const ERROR_EVENT_PK_PREFIX = 'ERROR_EVENT#';

/**
 * SK プレフィックス
 */
export const ERROR_EVENT_SK_PREFIX = 'OCCURRED#';

/**
 * PK を構築する。
 */
export function buildErrorEventPK(serviceId: string): string {
  return `${ERROR_EVENT_PK_PREFIX}${serviceId}`;
}

/**
 * SK を構築する。
 */
export function buildErrorEventSK(occurredAt: string, eventId: string): string {
  return `${ERROR_EVENT_SK_PREFIX}${occurredAt}#${eventId}`;
}

/**
 * occurredAt（ISO-8601）から TTL の Unix epoch 秒を計算する。
 *
 * @param occurredAt - ISO-8601 文字列
 * @returns occurredAt + 180 日後の Unix epoch 秒
 */
export function computeErrorEventTtl(occurredAt: string): number {
  const occurredAtMillis = Date.parse(occurredAt);
  if (Number.isNaN(occurredAtMillis)) {
    throw new Error(`occurredAt が ISO-8601 として解釈できません: ${occurredAt}`);
  }
  const ttlMillis = occurredAtMillis + ERROR_EVENT_TTL_DAYS * 24 * 60 * 60 * 1000;
  return Math.floor(ttlMillis / 1000);
}
