import { describe, it, expect } from '@jest/globals';
import { formatJstDate, formatJstDateTime } from '../../../src/format/jst.js';

describe('formatJstDateTime', () => {
  it('UTC を JST に変換し、秒なしで整形する', () => {
    expect(formatJstDateTime(Date.UTC(2026, 9, 5, 0, 3, 7))).toBe('2026/10/05 09:03');
  });

  it('seconds: true で秒まで整形する', () => {
    expect(formatJstDateTime(Date.UTC(2026, 9, 5, 0, 3, 7), { seconds: true })).toBe(
      '2026/10/05 09:03:07'
    );
  });

  it('seconds: false は秒を含めない', () => {
    expect(formatJstDateTime(Date.UTC(2026, 9, 5, 0, 3, 7), { seconds: false })).toBe(
      '2026/10/05 09:03'
    );
  });

  it('日付をまたぐ場合は翌日の 00 時になり、24 時表記にならない', () => {
    const result = formatJstDateTime(Date.UTC(2026, 9, 5, 15, 0, 0), { seconds: true });
    expect(result).toBe('2026/10/06 00:00:00');
    expect(result).not.toContain('24:');
  });

  it('年をまたぐ場合は翌年になる', () => {
    expect(formatJstDateTime(Date.UTC(2026, 11, 31, 16, 5, 0))).toBe('2027/01/01 01:05');
  });

  it('Date と number の両方を受け付ける', () => {
    const ms = Date.UTC(2026, 9, 5, 0, 3, 7);
    expect(formatJstDateTime(new Date(ms))).toBe(formatJstDateTime(ms));
  });

  it('1 桁の月・日・時・分・秒をゼロ埋めする', () => {
    expect(formatJstDateTime(Date.UTC(2026, 0, 2, 18, 4, 5), { seconds: true })).toBe(
      '2026/01/03 03:04:05'
    );
  });

  it('無効な日時ではエラーを投げる', () => {
    expect(() => formatJstDateTime(NaN)).toThrow('無効な日時が指定されました');
    expect(() => formatJstDateTime(new Date('invalid'))).toThrow('無効な日時が指定されました');
  });
});

describe('formatJstDate', () => {
  it('JST の日付を整形する', () => {
    expect(formatJstDate(Date.UTC(2026, 9, 5, 0, 3, 7))).toBe('2026/10/05');
  });

  it('UTC では前日でも JST の日付を返す', () => {
    expect(formatJstDate(Date.UTC(2026, 9, 5, 15, 0, 0))).toBe('2026/10/06');
  });

  it('年をまたぐ場合は翌年になる', () => {
    expect(formatJstDate(Date.UTC(2026, 11, 31, 16, 5, 0))).toBe('2027/01/01');
  });

  it('Date と number の両方を受け付ける', () => {
    const ms = Date.UTC(2026, 0, 2, 18, 4, 5);
    expect(formatJstDate(new Date(ms))).toBe('2026/01/03');
    expect(formatJstDate(ms)).toBe('2026/01/03');
  });

  it('無効な日時ではエラーを投げる', () => {
    expect(() => formatJstDate(NaN)).toThrow('無効な日時が指定されました');
  });
});
