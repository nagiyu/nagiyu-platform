/**
 * 書き込み前のエラーイベント入力検証
 *
 * DynamoDB 版と in-memory 版で同じ入力を拒否するため、検証を共有する。
 */

import type { ErrorEvent } from '@nagiyu/common';

const ERROR_MESSAGES = {
  INVALID_EVENT_ID: 'eventId は空文字にできません',
  INVALID_SERVICE_ID: 'serviceId は空文字にできません',
  INVALID_OCCURRED_AT: 'occurredAt は有限の数値 (epoch ミリ秒) である必要があります',
  INVALID_TITLE: 'title は空文字にできません',
} as const;

/**
 * 書き込めないイベントを拒否する。
 *
 * @throws Error 必須項目が空、または occurredAt が日時として解釈できないとき
 */
export function assertWritableErrorEvent(event: ErrorEvent): void {
  if (!event.eventId) {
    throw new Error(ERROR_MESSAGES.INVALID_EVENT_ID);
  }
  if (!event.serviceId) {
    throw new Error(ERROR_MESSAGES.INVALID_SERVICE_ID);
  }
  if (typeof event.occurredAt !== 'number' || Number.isNaN(new Date(event.occurredAt).getTime())) {
    throw new Error(ERROR_MESSAGES.INVALID_OCCURRED_AT);
  }
  if (!event.title) {
    throw new Error(ERROR_MESSAGES.INVALID_TITLE);
  }
}
