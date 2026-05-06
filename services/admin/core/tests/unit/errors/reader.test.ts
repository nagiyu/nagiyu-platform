/**
 * ErrorEventReader 共通ヘルパーの単体テスト
 */

import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  decodeCursor,
  encodeCursor,
  normalizeLimit,
} from '../../../src/errors/reader.js';

describe('encodeCursor / decodeCursor', () => {
  it('オブジェクトを base64url 経由で往復できる', () => {
    const key = { PK: 'ERROR_EVENT#stock-tracker', SK: 'OCCURRED#2026-05-06T00:00:00Z#evt-1' };
    const cursor = encodeCursor(key);
    expect(typeof cursor).toBe('string');
    expect(decodeCursor(cursor)).toEqual(key);
  });

  it('decodeCursor は不正な文字列で例外を投げる', () => {
    expect(() => decodeCursor('not-base64!@#')).toThrow('cursor が不正な形式です');
  });

  it('decodeCursor は JSON でない base64 で例外を投げる', () => {
    const invalid = Buffer.from('not json', 'utf-8').toString('base64url');
    expect(() => decodeCursor(invalid)).toThrow('cursor が不正な形式です');
  });
});

describe('normalizeLimit', () => {
  it('未指定のとき既定値を返す', () => {
    expect(normalizeLimit(undefined)).toBe(DEFAULT_LIST_LIMIT);
  });

  it('正常値はそのまま整数にして返す', () => {
    expect(normalizeLimit(20)).toBe(20);
    expect(normalizeLimit(20.7)).toBe(20);
  });

  it('1 未満は 1 に丸める', () => {
    expect(normalizeLimit(0)).toBe(1);
    expect(normalizeLimit(-5)).toBe(1);
  });

  it('上限を超えると上限に丸める', () => {
    expect(normalizeLimit(MAX_LIST_LIMIT + 50)).toBe(MAX_LIST_LIMIT);
  });
});
