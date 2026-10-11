/**
 * ErrorEvent の DynamoDB Item 変換
 *
 * 書き込み (Item の組み立て) と読み出し (Item の検証) の保存形式を 1 か所に集約する。
 * 書き手と読み手が別々に形を持つと、フィールド追加時に片方だけ更新される事故が起きる。
 */

import { isErrorSeverity, isErrorSource, type ErrorEvent } from '@nagiyu/common';
import {
  buildErrorEventPK,
  buildErrorEventSK,
  computeErrorEventTtl,
  ERROR_EVENT_ENTITY_TYPE,
  ERROR_EVENT_GSI1_PK,
} from './writer.js';

const ERROR_MESSAGES = {
  INVALID_ITEM_FIELD: 'エラーイベントの保存データのフィールドが不正です',
} as const;

const STRING_FIELDS = [
  'eventId',
  'serviceId',
  'title',
  'message',
  'context',
  'occurredAt',
] as const;

/**
 * ErrorEvent を DynamoDB に書き込む Item へ変換する。
 *
 * @param event - 永続化するエラーイベント
 * @param now - CreatedAt / UpdatedAt に使う現在時刻 (epoch ミリ秒)
 */
export function toErrorEventItem(event: ErrorEvent, now: number): Record<string, unknown> {
  const sortKey = buildErrorEventSK(event.occurredAt, event.eventId);

  return {
    PK: buildErrorEventPK(event.serviceId),
    SK: sortKey,
    Type: ERROR_EVENT_ENTITY_TYPE,
    GSI1PK: ERROR_EVENT_GSI1_PK,
    GSI1SK: sortKey,
    eventId: event.eventId,
    serviceId: event.serviceId,
    source: event.source,
    severity: event.severity,
    title: event.title,
    message: event.message,
    context: event.context,
    occurredAt: event.occurredAt,
    ttl: computeErrorEventTtl(event.occurredAt),
    CreatedAt: now,
    UpdatedAt: now,
  };
}

/**
 * DynamoDB から読み出した Item (unmarshall 済み) を検証して ErrorEvent に変換する。
 *
 * 不正な Item を黙って除外すると障害に気づけないため、呼び出し側へ例外として伝える。
 *
 * @throws フィールドが欠けている・型が違う・source / severity が一覧外の場合
 */
export function parseErrorEventItem(item: Record<string, unknown>): ErrorEvent {
  for (const field of STRING_FIELDS) {
    if (typeof item[field] !== 'string') {
      throw new Error(`${ERROR_MESSAGES.INVALID_ITEM_FIELD}: ${field}`);
    }
  }
  if (!isErrorSource(item.source)) {
    throw new Error(`${ERROR_MESSAGES.INVALID_ITEM_FIELD}: source (${String(item.source)})`);
  }
  if (!isErrorSeverity(item.severity)) {
    throw new Error(`${ERROR_MESSAGES.INVALID_ITEM_FIELD}: severity (${String(item.severity)})`);
  }

  return {
    eventId: item.eventId as string,
    serviceId: item.serviceId as string,
    source: item.source,
    severity: item.severity,
    title: item.title as string,
    message: item.message as string,
    context: item.context as string,
    occurredAt: item.occurredAt as string,
  };
}
