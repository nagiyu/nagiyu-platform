import { describe, it, expect } from '@jest/globals';
import { getTimestamp, formatLocalDate } from '../../../src/format/timestamp.js';

describe('getTimestamp', () => {
  it('ISO 8601 形式（UTC）のタイムスタンプを返す', () => {
    const timestamp = getTimestamp();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('返却値は有効な Date として解釈できる', () => {
    const timestamp = getTimestamp();
    const date = new Date(timestamp);
    expect(date.toString()).not.toBe('Invalid Date');
  });

  it('呼び出すたびに異なる時刻を返す', async () => {
    const t1 = getTimestamp();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const t2 = getTimestamp();
    expect(t1).not.toBe(t2);
  });
});

describe('formatLocalDate', () => {
  it('ローカル時刻の日付を YYYY-MM-DD 形式で返す', () => {
    expect(formatLocalDate(new Date(2024, 11, 25, 23, 59, 59))).toBe('2024-12-25');
  });

  it('月と日を 2 桁にゼロ埋めする', () => {
    expect(formatLocalDate(new Date(2024, 0, 5, 0, 0, 0))).toBe('2024-01-05');
  });
});
