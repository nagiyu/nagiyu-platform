/**
 * ErrorEvents Writer 共通ヘルパーの単体テスト
 */

import {
  buildErrorEventPK,
  buildErrorEventSK,
  computeErrorEventTtl,
  ERROR_EVENT_GSI1_PK,
  ERROR_EVENT_PK_PREFIX,
  ERROR_EVENT_SK_PREFIX,
  ERROR_EVENT_TTL_DAYS,
} from '../../../src/error-events/writer.js';

describe('buildErrorEventPK', () => {
  it('プレフィックス付きの PK を構築する', () => {
    expect(buildErrorEventPK('stock-tracker')).toBe(`${ERROR_EVENT_PK_PREFIX}stock-tracker`);
  });
});

describe('buildErrorEventSK', () => {
  it('occurredAt と eventId を結合した SK を構築する', () => {
    const sk = buildErrorEventSK('2026-05-06T01:32:11Z', 'evt-1');
    expect(sk).toBe(`${ERROR_EVENT_SK_PREFIX}2026-05-06T01:32:11Z#evt-1`);
  });
});

describe('computeErrorEventTtl', () => {
  it('occurredAt から TTL_DAYS 日後の Unix epoch 秒を返す', () => {
    const occurredAt = '2026-05-06T00:00:00Z';
    const expected = Math.floor(
      (Date.parse(occurredAt) + ERROR_EVENT_TTL_DAYS * 24 * 60 * 60 * 1000) / 1000
    );
    expect(computeErrorEventTtl(occurredAt)).toBe(expected);
  });

  it('TTL は occurredAt より TTL_DAYS 日後である', () => {
    const occurredAt = '2026-01-01T00:00:00Z';
    const ttlSeconds = computeErrorEventTtl(occurredAt);
    const occurredAtSeconds = Math.floor(Date.parse(occurredAt) / 1000);
    expect(ttlSeconds - occurredAtSeconds).toBe(ERROR_EVENT_TTL_DAYS * 24 * 60 * 60);
  });

  it('不正な occurredAt は例外を投げる', () => {
    expect(() => computeErrorEventTtl('not-a-date')).toThrow(
      /occurredAt が ISO-8601 として解釈できません/
    );
  });
});

describe('定数', () => {
  it('GSI1PK は固定文字列', () => {
    expect(ERROR_EVENT_GSI1_PK).toBe('ERROR_EVENT_ALL');
  });

  it('TTL_DAYS は 180 日', () => {
    expect(ERROR_EVENT_TTL_DAYS).toBe(180);
  });
});
