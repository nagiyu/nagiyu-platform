import { formatJstMonthDay } from '../../../src/lib/format-date.js';

describe('formatJstMonthDay', () => {
  it('Unix ms を "M月D日" 表記に変換する', () => {
    // 2026-07-15T00:00:00 相当のローカル時刻
    const ms = new Date(2026, 6, 15).getTime();
    expect(formatJstMonthDay(ms)).toBe('7月15日');
  });

  it('1 桁の月日でもゼロ埋めしない', () => {
    const ms = new Date(2026, 0, 5).getTime();
    expect(formatJstMonthDay(ms)).toBe('1月5日');
  });

  it('月末日でも正しく変換する', () => {
    const ms = new Date(2026, 11, 31).getTime();
    expect(formatJstMonthDay(ms)).toBe('12月31日');
  });
});
