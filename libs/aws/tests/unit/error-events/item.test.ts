/**
 * ErrorEvent の Item 変換の単体テスト
 */

import type { ErrorEvent } from '@nagiyu/common';
import { parseErrorEventItem, toErrorEventItem } from '../../../src/error-events/item.js';
import {
  buildErrorEventPK,
  buildErrorEventSK,
  computeErrorEventTtl,
  ERROR_EVENT_ENTITY_TYPE,
  ERROR_EVENT_GSI1_PK,
} from '../../../src/error-events/writer.js';

const baseEvent: ErrorEvent = {
  eventId: 'evt-1',
  serviceId: 'stock-tracker',
  source: 'cloudwatch-alarm',
  severity: 'error',
  title: 'stock-tracker-web-error-rate-prod (ALARM)',
  message: 'Threshold Crossed',
  context: '{"raw":true}',
  occurredAt: '2026-05-06T01:32:11.000Z',
};

describe('toErrorEventItem', () => {
  it('キー・Type・各フィールド・ttl・タイムスタンプを持つ Item を返す', () => {
    const sortKey = buildErrorEventSK(baseEvent.occurredAt, baseEvent.eventId);

    expect(toErrorEventItem(baseEvent, 1234567890)).toEqual({
      PK: buildErrorEventPK(baseEvent.serviceId),
      SK: sortKey,
      Type: ERROR_EVENT_ENTITY_TYPE,
      GSI1PK: ERROR_EVENT_GSI1_PK,
      GSI1SK: sortKey,
      ...baseEvent,
      ttl: computeErrorEventTtl(baseEvent.occurredAt),
      CreatedAt: 1234567890,
      UpdatedAt: 1234567890,
    });
  });
});

describe('parseErrorEventItem', () => {
  it('書き込んだ Item を ErrorEvent に復元する', () => {
    const item = toErrorEventItem(baseEvent, 1);
    expect(parseErrorEventItem(item)).toEqual(baseEvent);
  });

  it('キー属性など余分な属性は含めない', () => {
    const result = parseErrorEventItem({ ...baseEvent, PK: 'x', extra: 1 });
    expect(Object.keys(result).sort()).toEqual(Object.keys(baseEvent).sort());
  });

  it('message / context が空文字でも受け付ける', () => {
    const event = { ...baseEvent, message: '', context: '' };
    expect(parseErrorEventItem({ ...event })).toEqual(event);
  });

  it.each(['eventId', 'serviceId', 'title', 'message', 'context', 'occurredAt'] as const)(
    '%s が欠けていると、そのフィールド名を含む例外を投げる',
    (field) => {
      const item: Record<string, unknown> = { ...baseEvent };
      delete item[field];
      expect(() => parseErrorEventItem(item)).toThrow(
        `エラーイベントの保存データのフィールドが不正です: ${field}`
      );
    }
  );

  it('文字列でないフィールドは例外を投げる', () => {
    expect(() => parseErrorEventItem({ ...baseEvent, title: 123 })).toThrow(
      'エラーイベントの保存データのフィールドが不正です: title'
    );
  });

  it('未知の severity は値を含む例外を投げる', () => {
    expect(() => parseErrorEventItem({ ...baseEvent, severity: 'fatal' })).toThrow(
      'エラーイベントの保存データのフィールドが不正です: severity (fatal)'
    );
  });

  it('severity が無い場合は例外を投げる', () => {
    const item: Record<string, unknown> = { ...baseEvent };
    delete item.severity;
    expect(() => parseErrorEventItem(item)).toThrow('severity');
  });

  it('未知の source は値を含む例外を投げる', () => {
    expect(() => parseErrorEventItem({ ...baseEvent, source: 'unknown' })).toThrow(
      'エラーイベントの保存データのフィールドが不正です: source (unknown)'
    );
  });

  it('source が無い場合は例外を投げる', () => {
    const item: Record<string, unknown> = { ...baseEvent };
    delete item.source;
    expect(() => parseErrorEventItem(item)).toThrow('source');
  });
});
