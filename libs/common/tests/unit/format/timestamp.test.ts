import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { getTimestamp, formatLocalDateTime } from '../../../src/format/timestamp.js';

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

describe('formatLocalDateTime', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('"YYYY/MM/DD HH:MM:SS" 形式の文字列を返す', () => {
    const result = formatLocalDateTime(new Date(2024, 5, 15, 10, 30, 45));
    expect(result).toBe('2024/06/15 10:30:45');
  });

  it('月が 1 桁の場合 0 パディングされる', () => {
    const result = formatLocalDateTime(new Date(2024, 0, 15, 10, 30, 45));
    expect(result).toBe('2024/01/15 10:30:45');
  });

  it('日が 1 桁の場合 0 パディングされる', () => {
    const result = formatLocalDateTime(new Date(2024, 5, 1, 10, 30, 45));
    expect(result).toBe('2024/06/01 10:30:45');
  });

  it('時・分・秒が 1 桁の場合 0 パディングされる', () => {
    const result = formatLocalDateTime(new Date(2024, 5, 15, 1, 2, 3));
    expect(result).toBe('2024/06/15 01:02:03');
  });

  it('引数を省略した場合は現在時刻を使用する', () => {
    const mockDate = new Date(2024, 11, 31, 23, 59, 58);
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as Date);

    const result = formatLocalDateTime();
    expect(result).toBe('2024/12/31 23:59:58');
  });

  it('異なる時刻の Date を渡すと異なる結果を返す', () => {
    const d1 = new Date(2024, 5, 15, 10, 30, 45);
    const d2 = new Date(2024, 5, 15, 10, 30, 46);
    expect(formatLocalDateTime(d1)).not.toBe(formatLocalDateTime(d2));
  });
});
